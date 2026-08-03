import { Route, RouteJson, Segment, Stage, Waypoint } from '.';
import { LngLat } from 'mapbox-gl';
import { Id, nearestPoint } from '../util';
import { NearestPointOnLine } from '../services';
import { GeoJSON } from 'geojson';

export type TripJson = {
  version: number;
  routes: RouteJson[];
};

export class VersionMismatchError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'VersionMismatchError';
    Object.setPrototypeOf(this, VersionMismatchError.prototype);
  }
}

export class Trip {
  private static readonly VERSION: number = 3;

  private constructor(readonly routes: readonly Route[]) {}

  static create() {
    return new Trip([]);
  }

  withAddedRoute(): [Trip, Route] {
    const newRoute = Route.create();
    const newRoutes = [...this.routes, newRoute];
    const newTrip = new Trip(newRoutes);
    return [newTrip, newRoute];
  }

  withAddedStage(route: Route): [Trip, Stage] {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    const [newRoute, newStage] = newRoutes[idx].withAddedStage();
    newRoutes[idx] = newRoute;
    const newTrip = new Trip(newRoutes);
    return [newTrip, newStage];
  }

  // ha ha
  private findRouteIdxOrElse(routeId: Id): number {
    const idx = this.routes.findIndex((route) => route.id === routeId);
    if (idx === -1) throw new Error('Route not found in routes array!');
    return idx;
  }

  withUpdatedRoute(route: Route, func: (route: Route) => Route): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes[idx] = func(route);
    return new Trip(newRoutes);
  }

  withUpdatedStage(route: Route, stage: Stage, func: (stage: Stage) => Stage): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes[idx] = newRoutes[idx].withUpdatedStage(stage, func);
    return new Trip(newRoutes);
  }

  withDuplicatedRoute(route: Route): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes.splice(idx, 0, route);
    return new Trip(newRoutes);
  }

  withDuplicatedStage(route: Route, stage: Stage): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes[idx] = newRoutes[idx].withDuplicatedStage(stage);
    return new Trip(newRoutes);
  }

  withUpdatedSegment(
    route: Route,
    stage: Stage,
    segment: Segment,
    func: (segment: Segment) => Segment,
  ): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes[idx] = newRoutes[idx].withUpdatedSegment(stage, segment, func);
    return new Trip(newRoutes);
  }

  withDeletedRoute(route: Route): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes.splice(idx, 1);
    return new Trip(newRoutes);
  }

  withDeletedStage(route: Route, stage: Stage): Trip {
    const idx = this.findRouteIdxOrElse(route.id);
    const newRoutes = [...this.routes];
    newRoutes[idx] = newRoutes[idx].withDeletedStage(stage);
    return new Trip(newRoutes);
  }

  findRouteById(id: Id): Route | null {
    return this.routes.find((route) => route.id === id) ?? null;
  }

  findStageById(id: Id): Stage | null {
    for (const route of this.routes) {
      const stage = route.findStageById(id);
      if (stage !== null) return stage;
    }
    return null;
  }

  findSegmentById(id: Id): { trip: Trip; route: Route; stage: Stage; segment: Segment } | null {
    for (const route of this.routes) {
      const RSS = route.findSegmentById(id); // route, stage, segment
      if (RSS !== null) return { trip: this, ...RSS };
    }
    return null;
  }

  findWaypointById(id: Id): {
    trip: Trip;
    route: Route;
    stage: Stage;
    segment: Segment | null;
    waypoint: Waypoint;
  } | null {
    for (const route of this.routes) {
      const RSSW = route.findWaypointById(id); // route, stage, segment, waypoint
      if (RSSW !== null) return { trip: this, ...RSSW };
    }
    return null;
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    for (const route of this.routes) {
      const segment = route.findSegment(func);
      if (segment !== null) return segment;
    }
    return null;
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined {
    return nearestPoint(this.routes, lngLat);
  }

  hasRoutes(): boolean {
    return this.routes.length !== 0;
  }

  toGeoJson(): GeoJSON {
    const routesFeatures = this.routes.map((route) => route.toFeatures());
    const waypoints = routesFeatures.flatMap((feature) => feature.waypoints);
    const segments = routesFeatures.flatMap((feature) => feature.segments);
    return {
      type: 'FeatureCollection',
      features: [...waypoints, ...segments],
    };
  }

  toJson(): TripJson {
    return { version: Trip.VERSION, routes: this.routes.map((route) => route.toJson()) };
  }

  static fromJson(d: TripJson): Trip {
    if (d.version !== Trip.VERSION)
      throw new VersionMismatchError(
        `Tried loading a trip with a different version (${d.version}) than expected (${Trip.VERSION}).`,
      );
    return new Trip(d.routes.map((route) => Route.fromJson(route)));
  }
}
