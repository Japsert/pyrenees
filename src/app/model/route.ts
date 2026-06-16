import { Signal, signal } from '@angular/core';
import { Segment, Stage, StageData, Waypoint } from '.';
import { LngLat } from 'mapbox-gl';
import { NearestPointOnLine } from '../services';
import { nearestPoint } from '../util';

export type RouteData = {
  name: string;
  stages: StageData[];
};

export class Route {
  private constructor(
    readonly name: string,
    readonly stages: Signal<Stage[]>,
  ) {}
  
  findWaypointById(id: string): Waypoint | null {
    for (const stage of this.stages()) {
      const waypoint = stage.findWaypointById(id);
      if (waypoint !== null) return waypoint;
    }
    return null;
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    for (const stage of this.stages()) {
      const segment = stage.findSegment(func);
      if (segment !== null) return segment;
    }
    return null;
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined {
    return nearestPoint(this.stages(), lngLat);
  }

  toJson(): RouteData {
    return { name: this.name, stages: this.stages().map((stage) => stage.toJson()) };
  }

  static fromJson(d: RouteData): Route {
    return new Route(d.name, signal(d.stages.map((stage) => Stage.fromJson(stage))));
  }
}
