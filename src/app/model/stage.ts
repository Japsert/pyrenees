import { Feature, LineString, Point, Position } from 'geojson';
import { LngLat } from 'mapbox-gl';
import { nearestPointOnLine } from '@turf/turf';
import { colorProperties, generateId, Id } from '../util';
import {
  Segment,
  SegmentInfo,
  SegmentProperties,
  VersionMismatchError,
  Waypoint,
  WaypointProperties,
  Node,
  SegmentJson,
} from '.';
import { NearestPointOnLine } from '../services';
import { Color, color } from 'use-color';

export type StageJson = {
  id: Id;
  version: number;
  sourceId: Id;
  name: string;
  initialWaypoint: Waypoint | null;
  segments: SegmentJson[];
};

type WaypointFeature = Feature<Point, WaypointProperties>;
type SegmentFeature = Feature<LineString, SegmentProperties>;
type StageFeatures = {
  waypoints: WaypointFeature[];
  segments: SegmentFeature[];
};

export type StageStats = SegmentInfo;

export class Stage {
  private static readonly VERSION: number = 6;
  private static readonly DEFAULT_COLOR = color('#ffaa00');

  private constructor(
    readonly id: Id,
    readonly sourceId: Id,
    readonly name: string,
    readonly color: Color,
    readonly initialWaypoint: Waypoint | null,
    readonly segments: readonly Segment[],
  ) {}

  static create(): Stage {
    return new Stage(generateId(), generateId(), 'New stage', Stage.DEFAULT_COLOR, null, []);
  }

  //#region Mutating methods

  withName(name: string) {
    return new Stage(
      this.id,
      this.sourceId,
      name,
      Stage.DEFAULT_COLOR,
      this.initialWaypoint,
      this.segments,
    );
  }

  withAppendedWaypoint(position: Position): [Stage, Segment | null] {
    if (this.segments.length === 0 && !this.initialWaypoint) {
      const newInitialWaypoint = Waypoint.create(position);
      const newStage = new Stage(
        this.id,
        this.sourceId,
        this.name,
        Stage.DEFAULT_COLOR,
        newInitialWaypoint,
        this.segments,
      );
      const appendedSegment = null;
      return [newStage, appendedSegment];
    }

    const start = this.initialWaypoint ?? this.segments.at(-1)!.end;
    const end = Waypoint.create(position);
    const appendedSegment = Segment.create(start, end);

    const newSegments = [...this.segments, appendedSegment];
    const newStage = new Stage(
      this.id,
      this.sourceId,
      this.name,
      Stage.DEFAULT_COLOR,
      null,
      newSegments,
    );
    return [newStage, appendedSegment];
  }

  withMovedWaypoint(
    id: Id,
    newPos: Position,
  ): [Stage, { prevSegment: Segment | undefined; nextSegment: Segment | undefined }] {
    if (this.initialWaypoint) {
      const initialWaypoint = this.initialWaypoint.withPosition(newPos);
      const newStage = new Stage(
        this.id,
        this.sourceId,
        this.name,
        Stage.DEFAULT_COLOR,
        initialWaypoint,
        this.segments,
      );
      const neighborSegments = { prevSegment: undefined, nextSegment: undefined };
      return [newStage, neighborSegments];
    }

    const prevSegmentIdx = this.segments.findIndex((seg) => seg.end.id === id);
    const nextSegmentIdx = this.segments.findIndex((seg) => seg.start.id === id);
    const prevSegment = prevSegmentIdx === -1 ? null : this.segments[prevSegmentIdx];
    const nextSegment = nextSegmentIdx === -1 ? null : this.segments[nextSegmentIdx];

    const waypoint = prevSegmentIdx === -1 ? nextSegment!.start : prevSegment!.end;
    const movedWaypoint = waypoint.withPosition(newPos);

    let newPrevSegment: Segment | undefined;
    let newNextSegment: Segment | undefined;

    const newSegments = [...this.segments];
    if (prevSegment) {
      newPrevSegment = Segment.create(
        prevSegment.start,
        movedWaypoint,
        prevSegment.id,
        prevSegment.track ?? undefined,
        prevSegment.info ?? undefined,
      );
      newSegments.splice(prevSegmentIdx, 1, newPrevSegment);
    }

    if (nextSegment) {
      newNextSegment = Segment.create(movedWaypoint, nextSegment.end, nextSegment.id);
      newSegments.splice(nextSegmentIdx, 1, newNextSegment);
    }

    const newStage = new Stage(
      this.id,
      this.sourceId,
      this.name,
      Stage.DEFAULT_COLOR,
      this.initialWaypoint,
      newSegments,
    );
    const neighborSegments = { prevSegment: newPrevSegment, nextSegment: newNextSegment };
    return [newStage, neighborSegments];
  }

  withDeletedWaypoint(id: Id): [Stage, Segment | undefined] {
    if (this.initialWaypoint != null) {
      const newInitialWaypoint = null;
      const newStage = new Stage(
        this.id,
        this.sourceId,
        this.name,
        Stage.DEFAULT_COLOR,
        newInitialWaypoint,
        this.segments,
      );
      const newMergedSegment = undefined;
      return [newStage, newMergedSegment];
    }

    // Delete adjoining segment if at either end
    const firstSegment = this.segments.at(0)!;
    if (firstSegment.start.id === id) return this.withDeletedSegment(firstSegment);
    const lastSegment = this.segments.at(-1)!;
    if (lastSegment.end.id === id) return this.withDeletedSegment(lastSegment);

    // Merge adjoining segments
    const idx = this.segments.findIndex((seg) => seg.start.id === id);
    if (idx === -1)
      throw new Error('Tried to delete a waypoint that was not found in any segment!');
    const prevSegment = this.segments.at(idx - 1)!;
    const nextSegment = this.segments.at(idx)!;

    return this.withMergedSegments(prevSegment, nextSegment);
  }

  private withDeletedSegment(segment: Segment): [Stage, undefined] {
    const idx = this.findSegmentIdxOrElse(segment.id);

    const newSegments = [...this.segments];
    newSegments.splice(idx, 1);
    const newStage = new Stage(
      this.id,
      this.sourceId,
      this.name,
      Stage.DEFAULT_COLOR,
      this.initialWaypoint,
      newSegments,
    );
    return [newStage, undefined];
  }

  private withMergedSegments(segment1: Segment, segment2: Segment): [Stage, Segment] {
    const idx1 = this.findSegmentIdxOrElse(segment1.id);
    const idx2 = this.findSegmentIdxOrElse(segment2.id);
    if (idx1 + 1 != idx2) throw new Error('Tried to merge two non-adjacent segments!');

    const newMergedSegment = Segment.create(segment1.start, segment2.end);
    const newSegments = [...this.segments];
    newSegments.splice(idx1, 2, newMergedSegment);
    const newStage = new Stage(
      this.id,
      this.sourceId,
      this.name,
      Stage.DEFAULT_COLOR,
      this.initialWaypoint,
      newSegments,
    );
    return [newStage, newMergedSegment];
  }

  withSplitSegment(
    segment: Segment,
    newPos: Position,
  ): [Stage, { prevSegment: Segment; nextSegment: Segment }] {
    const idx = this.findSegmentIdxOrElse(segment.id);

    const middle = Waypoint.create(newPos);
    const prevSegment = Segment.create(segment.start, middle);
    const nextSegment = Segment.create(middle, segment.end);

    const newSegments = [...this.segments];
    newSegments.splice(idx, 1, prevSegment, nextSegment);
    const newStage = new Stage(
      this.id,
      this.sourceId,
      this.name,
      Stage.DEFAULT_COLOR,
      this.initialWaypoint,
      newSegments,
    );
    const newSplitSegments = { prevSegment, nextSegment };
    return [newStage, newSplitSegments];
  }

  // ha ha
  private findSegmentIdxOrElse(segmentId: Id): number {
    const idx = this.segments.findIndex((segment) => segment.id === segmentId);
    if (idx === -1) {
      debugger;
      throw new Error('Segment not found in segments array!');
    }
    return idx;
  }

  withUpdatedSegment(segment: Segment, func: (segment: Segment) => Segment): Stage {
    const idx = this.findSegmentIdxOrElse(segment.id);

    const newSegments = [...this.segments];
    newSegments[idx] = func(segment);
    return new Stage(
      this.id,
      this.sourceId,
      this.name,
      Stage.DEFAULT_COLOR,
      this.initialWaypoint,
      newSegments,
    );
  }

  //#endregion
  //#region Non-mutating methods

  findSegmentById(id: Id): { stage: Stage; segment: Segment } | null {
    const segment = this.segments.find((segment) => segment.id === id) ?? null;
    if (segment === null) return null;
    return { stage: this, segment };
  }

  findWaypointById(id: Id): { stage: Stage; segment: Segment | null; waypoint: Waypoint } | null {
    if (this.initialWaypoint?.id === id)
      return { stage: this, segment: null, waypoint: this.initialWaypoint };

    for (const segment of this.segments) {
      const SW = segment.findWaypointById(id); // segment, waypoint
      if (SW !== null) return { stage: this, ...SW };
    }
    return null;
  }

  findSegment(func: (segment: Segment) => boolean): Segment | null {
    for (const segment of this.segments) if (func(segment)) return segment;
    return null;
  }

  getStats(): StageStats | null {
    const stats = {
      length: 0,
      totalAscend: 0,
      netAscend: 0,
      time: 0,
    } satisfies StageStats;

    for (const segment of this.segments) {
      const info = segment.info;
      if (!info) return null;
      stats.length += info.length;
      stats.totalAscend += info.totalAscend;
      stats.netAscend += info.netAscend;
      stats.time += info.time;
    }

    return stats;
  }

  //#endregion
  //#region JSON

  toJson(): StageJson {
    return {
      version: Stage.VERSION,
      id: this.id,
      sourceId: this.sourceId,
      name: this.name,
      initialWaypoint: this.initialWaypoint,
      segments: this.segments.map((segment) => segment.toJson()),
    };
  }

  static fromJson(data: StageJson): Stage {
    if (data.version != Stage.VERSION)
      throw new VersionMismatchError(
        `Tried loading a stage with a different version (${data.version}) than expected (${Stage.VERSION}).`,
      );
    return new Stage(
      data.id,
      data.sourceId,
      data.name,
      Stage.DEFAULT_COLOR,
      data.initialWaypoint,
      data.segments.map((segment) => Segment.fromJson(segment)),
    );
  }

  toFeatures(): StageFeatures {
    return {
      waypoints: this.waypointsToFeatures(),
      segments: this.segmentsToFeatures(),
    };
  }

  private waypointsToFeatures(): WaypointFeature[] {
    // Build list of waypoints, containing the start of every segment and the end of the last
    const waypoints = this.segments.map((segment) => segment.start);
    if (this.initialWaypoint) waypoints.push(this.initialWaypoint);
    else if (this.segments.length > 0) waypoints.push(this.segments.at(-1)!.end);

    return waypoints.map((waypoint) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: waypoint.position,
      } satisfies Point,
      properties: {
        id: waypoint.id,
        ...colorProperties(this.color),
      } satisfies WaypointProperties,
    }));
  }

  private segmentsToFeatures(): Feature<LineString, SegmentProperties>[] {
    // Save only routed segments
    const routedSegments = this.segments.filter(
      (s): s is Segment & { track: Node[]; info: SegmentInfo } =>
        s.track !== undefined && s.info !== undefined,
    );
    return routedSegments.map((segment) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segment.track.map((node) => node.position),
      } satisfies LineString,
      properties: {
        id: segment.id,
        ...colorProperties(this.color),
        trackElevation: segment.track.map((node) => node.elevation),
        trackTime: segment.track.map((node) => node.time),
        length: segment.info.length,
        totalAscend: segment.info.totalAscend,
        netAscend: segment.info.netAscend,
        time: segment.info.time,
      } satisfies SegmentProperties,
    }));
  }

  toLineString(): LineString {
    const segments = this.segmentsToFeatures();
    return {
      type: 'LineString',
      coordinates: segments.flatMap((segment) => segment.geometry.coordinates),
    };
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine {
    const line = this.toLineString();
    const point = [lngLat.lng, lngLat.lat];
    return nearestPointOnLine(line, point);
  }
}
