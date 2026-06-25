import { inject, Injectable, signal } from '@angular/core';
import * as turf from '@turf/turf';
import { Feature, LineString, Position } from 'geojson';
import { CameraOptions, LngLat, PaddingOptions } from 'mapbox-gl';
import { FLY_TO_BOTTOM_PADDING, MapService } from './map';
import { sma } from '../util';
import { PlannerService } from './planner';

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
  private readonly map = inject(MapService);
  private readonly planner = inject(PlannerService);

  isFlying = signal<boolean>(false);

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

  begin(): void {
    const selectedStage = this.planner.selectedStage();
    if (!selectedStage)
      throw new Error('Flyover starting but no stage is selected!');

    const lineString = selectedStage.toLineString();
    this.start(lineString);
    this.isFlying.set(true);
  }

  start(routeLineString: LineString, options?: FlyoverOptions): void {
    if (this.isAnimating) this.stop();

    this.config = { ...this.defaultOptions, ...options };
    this.isAnimating = true;

    // Reset animation state
    this.lastTimestamp = null;
    this.currentDistanceKm = this.config.runwayLengthM / 1000;
    this.isUserInteracting = false;

    if (!this.prepareRoute(routeLineString)) return;

    this.map.getAllMaps().forEach((map) => {
      map.dragPan.disable();
      map.keyboard.disable();
    });
    this.addPointerListeners();

    // Save camera position in case we cancel flyover later
    const activeMap = this.map.getActiveMap();
    this.savedCameraPos = {
      center: activeMap.getCenter(),
      zoom: activeMap.getZoom(),
      bearing: activeMap.getBearing(),
      pitch: activeMap.getPitch(),
    };

    // Fly to start
    const startPoint = turf.along(this.averagedRoute, this.config.runwayLengthM / 1000, {
      units: 'kilometers',
    });
    const [startLng, startLat] = startPoint.geometry.coordinates;
    const startLngLat = new LngLat(startLng, startLat);

    this.map.getActiveMap().flyTo({
      center: startLngLat,
      duration: 1500,
      essential: true,
      padding: FLY_TO_BOTTOM_PADDING,
      zoom: 14,
      pitch: 40,
    });

    this.map.getActiveMap().once('moveend', () => {
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

    this.map.getAllMaps().forEach((map) => {
      map.dragPan.enable();
      map.keyboard.enable();
    });
    this.removePointerListeners();
    this.isFlying.set(false);
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
      this.complete();
      return;
    }

    const currentPoint = turf.along(this.averagedRoute, this.currentDistanceKm, {
      units: 'kilometers',
    });
    const [lng, lat] = currentPoint.geometry.coordinates;

    this.map.getActiveMap().jumpTo({
      center: [lng, lat],
    });

    this.animationFrameId = requestAnimationFrame((t) => this.animationLoop(t));
  }

  complete(): void {
    this.stop();

    const routeBoundingBox = turf.bbox(this.originalRoute);

    this.map.getActiveMap().fitBounds(
      [
        [routeBoundingBox[0], routeBoundingBox[1]],
        [routeBoundingBox[2], routeBoundingBox[3]],
      ],
      {
        padding: {
          ...this.config.fitBoundsPadding,
          bottom: (this.config.fitBoundsPadding.bottom ?? 0) + (FLY_TO_BOTTOM_PADDING.bottom ?? 0),
        },
        duration: 2500,
        pitch: 40,
        essential: true,
      },
    );
  }

  cancel(): void {
    this.stop();
    this.map.getActiveMap().flyTo({ ...this.savedCameraPos, duration: 1000, essential: true });
  }

  private addPointerListeners(): void {
    this.map
      .getAllMaps()
      .forEach((map) => map.getCanvas().addEventListener('pointerdown', this.handlePointerDown));
    globalThis.addEventListener('pointerup', this.handlePointerUp);
  }

  private removePointerListeners(): void {
    this.map
      .getAllMaps()
      .forEach((map) => map.getCanvas().removeEventListener('pointerdown', this.handlePointerDown));
    globalThis.removeEventListener('pointerup', this.handlePointerUp);
  }

  private readonly handlePointerDown = (e: PointerEvent) => {
    if (e.button === 0 && e.metaKey) {
      this.isUserInteracting = true;
    }
  };

  private readonly handlePointerUp = () => {
    if (!this.isUserInteracting) return;
    this.isUserInteracting = false;
    this.currentSpeedMps = 0;
  };
}
