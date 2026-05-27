import { Injectable } from '@angular/core';
import * as turf from '@turf/turf';
import { Feature, LineString, Position } from 'geojson';
import { LngLat, Map as MapboxMap, MercatorCoordinate, PaddingOptions } from 'mapbox-gl';
import { FLY_TO_BOTTOM_PADDING } from './map.service';
import { altitudeToZoom, sma } from './math';

export type FlyoverOptions = {
  speedKmh?: number;
  lookAheadM?: number;
  minCameraAltM?: number;
  minCameraElevM?: number;
  runwayLengthM?: number;
  smaWindowSize?: number;
  //sharpness?: number;
  //resolution?: number;
  fitBoundsPadding?: PaddingOptions;
};

@Injectable({
  providedIn: 'root',
})
export class FlyoverService {
  private animationFrameId: number | null = null;
  private isAnimating = false;
  private startTime: number | null = null;

  private originalRoute!: LineString;
  averagedRoute!: Feature<LineString>;
  //smoothedRoute!: Feature<LineString>;
  private totalLengthKm = 0;
  private map!: mapboxgl.Map;
  private config!: Required<FlyoverOptions>;

  private readonly defaultOptions: Required<FlyoverOptions> = {
    speedKmh: 800,
    lookAheadM: 500,
    minCameraAltM: 2000,
    minCameraElevM: 1200,
    runwayLengthM: 600,
    smaWindowSize: 30,
    //sharpness: 0.85,
    //resolution: 10000,
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
    this.startTime = null;

    if (!this.prepareRoute(routeLineString)) return;

    // TODO: refactor to method?

    const cameraPoint = turf.along(this.averagedRoute, 0, { units: 'kilometers' });
    const [cameraLng, cameraLat] = cameraPoint.geometry.coordinates;
    const cameraLngLat = new LngLat(cameraLng, cameraLat);
    const cameraElevation = this.map.queryTerrainElevation(cameraLngLat) ?? 0;

    const targetDistanceKm = this.config.lookAheadM / 1000;
    const clampedTargetDistanceKm = Math.min(targetDistanceKm, this.totalLengthKm);
    const targetPoint = turf.along(this.averagedRoute, clampedTargetDistanceKm, {
      units: 'kilometers',
    });
    const [targetLng, targetLat] = targetPoint.geometry.coordinates;
    const targetLngLat = new LngLat(targetLng, targetLat);
    const targetElevation = this.map.queryTerrainElevation(targetLngLat) ?? 0;

    const cameraOptions = this.map.getFreeCameraOptions();

    const cameraAltitude = Math.max(
      this.config.minCameraAltM,
      cameraElevation + this.config.minCameraElevM,
    );
    cameraOptions.position = MercatorCoordinate.fromLngLat(cameraLngLat, cameraAltitude);
    cameraOptions.lookAtPoint(targetLngLat, undefined, targetElevation);

    const bearing = turf.bearing(
      turf.point([cameraLng, cameraLat]),
      turf.point([targetLng, targetLat]),
    );

    const horizontalDist = turf.distance(
      turf.point([cameraLng, cameraLat]),
      turf.point([targetLng, targetLat]),
      { units: 'meters' },
    );
    const relativeAltitude = cameraAltitude - cameraElevation;
    const pitch = (Math.atan2(horizontalDist, relativeAltitude) * 180) / Math.PI;

    this.map.flyTo({
      center: cameraLngLat,
      bearing,
      pitch,
      zoom: altitudeToZoom(map, cameraAltitude, cameraLat), // ← matches animation frame 0
      duration: 2500,
      essential: true,
      padding: FLY_TO_BOTTOM_PADDING,
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
  }

  private prepareRoute(routeLineString: LineString): boolean {
    this.originalRoute = structuredClone(routeLineString);
    const coords = [...this.originalRoute.coordinates];
    if (coords.length < 2) {
      console.warn('Not enough coordinates on route!');
      return false;
    }

    // Add runway logic
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

    // Make sure start/end go through route start/end
    skeletonCoords[0] = coords[0];
    skeletonCoords[skeletonCoords.length - 1] = coords.at(-1)!;

    this.averagedRoute = turf.lineString(skeletonCoords);
    //this.smoothedRoute = turf.bezierSpline(this.averagedRoute, {
    //  resolution: this.config.resolution,
    //  sharpness: this.config.sharpness,
    //});
    this.totalLengthKm = turf.length(this.averagedRoute, { units: 'kilometers' });

    return true;
  }

  private animationLoop(timestamp: number): void {
    if (!this.isAnimating) return;
    if (!this.startTime) this.startTime = timestamp;

    const elapsedSeconds = (timestamp - this.startTime) / 1000;
    const speedMetersPerSecond = (this.config.speedKmh * 1000) / 3600;
    const currentDistanceMeters = elapsedSeconds * speedMetersPerSecond;
    const currentDistanceKm = currentDistanceMeters / 1000;

    if (currentDistanceKm >= this.totalLengthKm - this.config.lookAheadM / 1000) {
      this.completeFlyover();
      return;
    }

    const cameraPoint = turf.along(this.averagedRoute, currentDistanceKm, { units: 'kilometers' });
    const [cameraLng, cameraLat] = cameraPoint.geometry.coordinates;
    const cameraLngLat = new LngLat(cameraLng, cameraLat);
    const cameraElevation = this.map.queryTerrainElevation(cameraLngLat) ?? 0;

    const targetDistanceKm = (currentDistanceMeters + this.config.lookAheadM) / 1000;
    const clampedTargetDistanceKm = Math.min(targetDistanceKm, this.totalLengthKm);
    const targetPoint = turf.along(this.averagedRoute, clampedTargetDistanceKm, {
      units: 'kilometers',
    });
    const [targetLng, targetLat] = targetPoint.geometry.coordinates;
    const targetLngLat = new LngLat(targetLng, targetLat);
    const targetElevation = this.map.queryTerrainElevation(targetLngLat) ?? 0;

    const cameraOptions = this.map.getFreeCameraOptions();

    const cameraAltitude = Math.max(
      this.config.minCameraAltM,
      cameraElevation + this.config.minCameraElevM,
    );
    cameraOptions.position = MercatorCoordinate.fromLngLat(cameraLngLat, cameraAltitude);
    cameraOptions.lookAtPoint(targetLngLat, undefined, targetElevation);
    this.map.setFreeCameraOptions(cameraOptions);

    this.animationFrameId = requestAnimationFrame((t) => this.animationLoop(t));
  }

  completeFlyover(): void {
    this.stop();

    const routeBoundingBox = turf.bbox(this.originalRoute);

    this.map.fitBounds(
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
}
