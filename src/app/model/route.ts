import {
  Segment,
  SegmentProperties,
  Stage,
  StageJson,
  StageStats,
  Waypoint,
  WaypointProperties,
} from '.';
import { LngLat } from 'mapbox-gl';
import { NearestPointOnLine } from '../services';
import { generateId, Id, nearestPoint } from '../util';
import { Feature, LineString, Point } from 'geojson';

export type RouteJson = {
  id: Id;
  name: string;
  stages: StageJson[];
};

type WaypointFeature = Feature<Point, WaypointProperties>;
type SegmentFeature = Feature<LineString, SegmentProperties>;
type RouteFeatures = {
  waypoints: WaypointFeature[];
  segments: SegmentFeature[];
};

export type RouteStats = StageStats;

export class Route {
  private constructor(
    readonly id: Id,
    readonly name: string,
    readonly stages: readonly Stage[],
  ) {}

  static create(): Route {
    return new Route(generateId(), 'New route', []);
  }

  withName(name: string): Route {
    return new Route(this.id, name, this.stages);
  }

  withAddedStage(): [Route, Stage] {
    const newStage = Stage.create();
    const newStages = [...this.stages, newStage];
    const newRoute = new Route(this.id, this.name, newStages);
    return [newRoute, newStage];
  }

  withUpdatedStage(stage: Stage, func: (stage: Stage) => Stage): Route {
    const idx = this.findStageIdxOrElse(stage.id);
    const newStages = [...this.stages];
    newStages[idx] = func(stage);
    return new Route(this.id, this.name, newStages);
  }

  withUpdatedSegment(stage: Stage, segment: Segment, func: (segment: Segment) => Segment): Route {
    const idx = this.findStageIdxOrElse(stage.id);
    const newStages = [...this.stages];
    newStages[idx] = newStages[idx].withUpdatedSegment(segment, func);
    return new Route(this.id, this.name, newStages);
  }

  withDeletedStage(stage: Stage): Route {
    const idx = this.findStageIdxOrElse(stage.id);
    const newStages = [...this.stages];
    newStages.splice(idx, 1);
    return new Route(this.id, this.name, newStages);
  }

  // ha ha
  private findStageIdxOrElse(stageId: Id): number {
    const idx = this.stages.findIndex((stage) => stage.id === stageId);
    if (idx === -1) throw new Error('Stage not found in stages array!');
    return idx;
  }

  findStageById(id: Id): Stage | null {
    return this.stages.find((stage) => stage.id === id) ?? null;
  }

  findSegmentById(id: Id): { route: Route; stage: Stage; segment: Segment } | null {
    for (const stage of this.stages) {
      const SS = stage.findSegmentById(id); // stage, segment
      if (SS !== null) return { route: this, ...SS };
    }
    return null;
  }

  findWaypointById(
    id: Id,
  ): { route: Route; stage: Stage; segment: Segment | null; waypoint: Waypoint } | null {
    for (const stage of this.stages) {
      const SSW = stage.findWaypointById(id); // stage, segment, waypoint
      if (SSW !== null) return { route: this, ...SSW };
    }
    return null;
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    for (const stage of this.stages) {
      const segment = stage.findSegment(func);
      if (segment !== null) return segment;
    }
    return null;
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine | undefined {
    return nearestPoint(this.stages, lngLat);
  }

  getStats(): RouteStats | null {
    const stats = {
      length: 0,
      totalAscend: 0,
      netAscend: 0,
      time: 0,
    } satisfies RouteStats;

    for (const stage of this.stages) {
      const stageStats = stage.getStats();
      if (!stageStats) return null;
      stats.length += stageStats.length;
      stats.totalAscend += stageStats.totalAscend;
      stats.netAscend += stageStats.netAscend;
      stats.time += stageStats.time;
    }

    return stats;
  }

  toJson(): RouteJson {
    return { id: this.id, name: this.name, stages: this.stages.map((stage) => stage.toJson()) };
  }

  static fromJson(d: RouteJson): Route {
    return new Route(
      d.id,
      d.name,
      d.stages.map((stage) => Stage.fromJson(stage)),
    );
  }

  toFeatures(): RouteFeatures {
    const stagesFeatures = this.stages.map((stage) => stage.toFeatures());
    return {
      waypoints: stagesFeatures.flatMap((features) => features.waypoints),
      segments: stagesFeatures.flatMap((features) => features.segments),
    };
  }
}
