import { Injectable } from '@angular/core';
import * as turf from '@turf/turf';
import { Feature, LineString, Position } from 'geojson';
import { CameraOptions, LngLat, Map as MapboxMap, PaddingOptions } from 'mapbox-gl';
import { FLY_TO_BOTTOM_PADDING } from './map.service';
import { sma } from './math';

export type FlyoverOptions = {
  speedMps?: number;
  accelerationMpsps?: number;
  runwayLengthM?: number;
  smaWindowSize?: number;
  fitBoundsPadding?: PaddingOptions;
};

@Injectable({
  providedIn: 'root',
})
export class FlyoverService {
  private savedCameraPos!: CameraOptions;
  private animationFrameId: number | null = null;
  private isAnimating = false;
  private isUserInteracting = false;
  private lastTimestamp: number | null = null;
  private currentSpeedMps = 0;
  private currentDistanceKm = 0;

  private originalRoute!: LineString;
  averagedRoute!: Feature<LineString>;
  private totalLengthKm = 0;
  private map!: mapboxgl.Map;
  private config!: Required<FlyoverOptions>;

  private readonly defaultOptions: Required<FlyoverOptions> = {
    speedMps: 600,
    accelerationMpsps: 1200,
    runwayLengthM: 600,
    smaWindowSize: 30,
    fitBoundsPadding: {
      top: 40,
      bottom: 40,
      left: 40,
      right: 40,
    },
  };

  start(map: MapboxMap, routeLineString: LineString, options?: FlyoverOptions): void {
    if (this.isAnimating) this.stop();

    this.map = map;
    this.config = { ...this.defaultOptions, ...options };
    this.isAnimating = true;

    // Reset animation state
    this.lastTimestamp = null;
    this.currentDistanceKm = this.config.runwayLengthM / 1000;
    this.isUserInteracting = false;

    if (!this.prepareRoute(routeLineString)) return;

    this.map.dragPan.disable();
    this.map.keyboard.disable();
    this.addPointerListeners();

    // Save camera position in case we cancel flyover later
    this.savedCameraPos = {
      center: map.getCenter(),
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };

    // Fly to start
    const startPoint = turf.along(this.averagedRoute, this.config.runwayLengthM / 1000, {
      units: 'kilometers',
    });
    const [startLng, startLat] = startPoint.geometry.coordinates;
    const startLngLat = new LngLat(startLng, startLat);

    this.map.flyTo({
      center: startLngLat,
      duration: 1500,
      essential: true,
      padding: FLY_TO_BOTTOM_PADDING,
      zoom: 14,
      pitch: 40,
    });

    this.map.once('moveend', () => {
      if (!this.isAnimating) return;
      this.animationFrameId = requestAnimationFrame((t) => this.animationLoop(t));
    });
  }

  stop(): void {
    this.isAnimating = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.removePointerListeners();
  }

  private prepareRoute(routeLineString: LineString): boolean {
    this.originalRoute = structuredClone(routeLineString);
    const coords = [...this.originalRoute.coordinates];
    if (coords.length < 2) {
      console.warn('Not enough coordinates on route!');
      return false;
    }

    // Runway logic is kept to provide a smooth entry trajectory for the SMA smoothing
    const p0 = turf.point(coords[0]);
    const p1 = turf.point(coords[1]);
    const reverseBearing = turf.bearing(p1, p0);
    const runwayDistanceKm = this.config.runwayLengthM / 1000;
    const runwayPoint = turf.destination(p0, runwayDistanceKm, reverseBearing, {
      units: 'kilometers',
    });

    coords.unshift(runwayPoint.geometry.coordinates);

    const cleanedLine: Feature<LineString> = turf.cleanCoords(turf.lineString(coords));

    // Smooth line using moving average
    const lngs = cleanedLine.geometry.coordinates.map((c) => c[0]);
    const lats = cleanedLine.geometry.coordinates.map((c) => c[1]);

    const smoothLngs = sma(lngs, this.config.smaWindowSize);
    const smoothLats = sma(lats, this.config.smaWindowSize);

    const skeletonCoords = smoothLngs.map((lng, i) => [lng, smoothLats[i]] as Position);

    skeletonCoords[0] = coords[0];
    //skeletonCoords[skeletonCoords.length - 1] = coords.at(-1)!;

    this.averagedRoute = turf.lineString(skeletonCoords);
    this.totalLengthKm = turf.length(this.averagedRoute, { units: 'kilometers' });

    return true;
  }

  private animationLoop(timestamp: number): void {
    if (!this.isAnimating) return;

    if (this.isUserInteracting) {
      this.lastTimestamp = null;
      this.animationFrameId = requestAnimationFrame((t) => this.animationLoop(t));
      return;
    }

    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const deltaTimeSec = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;
    const remainingKm = this.totalLengthKm - this.currentDistanceKm;
    const maxSpeedForBraking = Math.sqrt(2 * this.config.accelerationMpsps * (remainingKm * 1000));

    this.currentSpeedMps = Math.min(
      this.currentSpeedMps + this.config.accelerationMpsps * deltaTimeSec,
      this.config.speedMps,
      maxSpeedForBraking,
    );
    const distanceThisFrameKm = (this.currentSpeedMps * deltaTimeSec) / 1000;
    this.currentDistanceKm += distanceThisFrameKm;

    // Check if we've reached the end
    if (this.currentDistanceKm >= this.totalLengthKm) {
      this.completeFlyover();
      return;
    }

    const currentPoint = turf.along(this.averagedRoute, this.currentDistanceKm, {
      units: 'kilometers',
    });
    const [lng, lat] = currentPoint.geometry.coordinates;

    this.map.jumpTo({
      center: [lng, lat],
    });

    this.animationFrameId = requestAnimationFrame((t) => this.animationLoop(t));
  }

  completeFlyover(canceled: boolean = false): void {
    this.stop(); // This will re-enable panning

    const routeBoundingBox = turf.bbox(this.originalRoute);

    if (canceled) {
      this.map.flyTo({ ...this.savedCameraPos, duration: 1000, essential: true });
    } else {
      this.map.fitBounds(
        [
          [routeBoundingBox[0], routeBoundingBox[1]],
          [routeBoundingBox[2], routeBoundingBox[3]],
        ],
        {
          padding: {
            ...this.config.fitBoundsPadding,
            bottom:
              (this.config.fitBoundsPadding.bottom ?? 0) + (FLY_TO_BOTTOM_PADDING.bottom ?? 0),
          },
          duration: 2500,
          pitch: 40,
          essential: true,
        },
      );
    }
  }

  private addPointerListeners(): void {
    const canvas = this.map.getCanvas();
    canvas.addEventListener('pointerdown', this.handlePointerDown);
    globalThis.addEventListener('pointerup', this.handlePointerUp);
  }

  private removePointerListeners(): void {
    const canvas = this.map?.getCanvas();
    if (canvas) {
      canvas.removeEventListener('pointerdown', this.handlePointerDown);
    }
    globalThis.removeEventListener('pointerup', this.handlePointerUp);
  }

  private readonly handlePointerDown = (e: PointerEvent) => {
    if (e.button === 0 && e.metaKey) {
      this.isUserInteracting = true;
    }
  };

  private readonly handlePointerUp = () => {
    this.isUserInteracting = false;
    this.currentSpeedMps = 0;
  };
}
