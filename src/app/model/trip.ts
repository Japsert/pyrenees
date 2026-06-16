import { Signal, signal } from '@angular/core';
import { Route, RouteData, Segment, Waypoint } from '.';
import { LngLat } from 'mapbox-gl';
import { nearestPoint } from '../util';
import { NearestPointOnLine } from '../services';

export type TripData = {
  version: number;
  routes: RouteData[];
};

export class VersionMismatchError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'VersionMismatchError';
    Object.setPrototypeOf(this, VersionMismatchError.prototype);
  }
}

export class Trip {
  private static readonly VERSION: number = 1;

  private constructor(readonly routes: Signal<Route[]>) {}

  static create() {
    return new Trip(signal([]));
  }

  findWaypointById(id: string): Waypoint | null {
    for (const route of this.routes()) {
      const waypoint = route.findWaypointById(id);
      if (waypoint !== null) return waypoint;
    }
    return null;
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    for (const route of this.routes()) {
      const segment = route.findSegment(func);
      if (segment !== null) return segment;
    }
    return null;
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined {
    return nearestPoint(this.routes(), lngLat);
  }

  toJson(): TripData {
    return { version: Trip.VERSION, routes: this.routes().map((route) => route.toJson()) };
  }

  static fromJson(d: TripData): Trip {
    if (d.version !== Trip.VERSION)
      throw new VersionMismatchError(
        `Tried loading a trip with a different version (${d.version}) than expected (${Trip.VERSION}).`,
      );
    return new Trip(signal(d.routes.map((route) => Route.fromJson(route))));
  }
}
