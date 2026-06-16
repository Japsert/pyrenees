import { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import { LngLat } from 'mapbox-gl';
import { nearestPointOnLine } from '@turf/turf';
import { generateId } from '../util';
import {
  Segment,
  SegmentInfo,
  SegmentProperties,
  VersionMismatchError,
  Waypoint,
  WaypointProperties,
  Node,
} from '.';
import { NearestPointOnLine } from '../services';

class GeoJSONError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'GeoJSONError';
    Object.setPrototypeOf(this, GeoJSONError.prototype);
  }
}

export type WaypointFeatureCollection = FeatureCollection<Point, WaypointProperties>;
export type SegmentFeatureCollection = FeatureCollection<LineString, SegmentProperties>;
export type StageData = {
  version: number;
  sourceId: string;
  name: string;
  initialWaypoint: Waypoint | null;
  segments: readonly Segment[];
};
export type StageFeatureCollection = FeatureCollection<
  Point | LineString,
  WaypointProperties | SegmentProperties
>;

export type StageStats = SegmentInfo;

export class Stage {
  private static readonly VERSION: number = 6;

  private constructor(
    readonly sourceId: string,
    readonly name: string,
    readonly initialWaypoint: Waypoint | null,
    readonly segments: readonly Segment[],
  ) {}

  static create(): Stage {
    return new Stage(generateId(), '', null, []);
  }

  //#region Mutating methods

  withName(name: string) {
    return new Stage(this.sourceId, name, this.initialWaypoint, this.segments);
  }

  withAppendedWaypoint(position: Position): [Stage, Segment | null] {
    if (this.segments.length === 0 && !this.initialWaypoint) {
      const newInitialWaypoint = Waypoint.create(position);
      const newStage = new Stage(this.sourceId, this.name, newInitialWaypoint, this.segments);
      const appendedSegment = null;
      return [newStage, appendedSegment];
    }

    const start = this.initialWaypoint ?? this.segments.at(-1)!.end;
    const end = Waypoint.create(position);
    const appendedSegment = Segment.create(start, end);

    const newSegments = [...this.segments, appendedSegment];
    const newStage = new Stage(this.sourceId, this.name, null, newSegments);
    return [newStage, appendedSegment];
  }

  withMovedWaypoint(
    id: string,
    newPos: Position,
  ): [Stage, { prevSegment: Segment | undefined; nextSegment: Segment | undefined }] {
    if (this.initialWaypoint) {
      const initialWaypoint = this.initialWaypoint.withPosition(newPos);
      const newStage = new Stage(this.sourceId, this.name, initialWaypoint, this.segments);
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

    const newStage = new Stage(this.sourceId, this.name, this.initialWaypoint, newSegments);
    const neighborSegments = { prevSegment: newPrevSegment, nextSegment: newNextSegment };
    return [newStage, neighborSegments];
  }

  withDeletedWaypoint(id: string): [Stage, Segment | undefined] {
    if (this.initialWaypoint != null) {
      const newInitialWaypoint = null;
      const newStage = new Stage(this.sourceId, this.name, newInitialWaypoint, this.segments);
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
    const idx = this.segments.indexOf(segment);

    if (idx === -1)
      throw new Error('Tried to delete a segment that was not found in the segments array!');

    const newSegments = [...this.segments].splice(idx, 1);
    const newStage = new Stage(this.sourceId, this.name, this.initialWaypoint, newSegments);
    return [newStage, undefined];
  }

  private withMergedSegments(segment1: Segment, segment2: Segment): [Stage, Segment] {
    const idx1 = this.segments.indexOf(segment1);
    const idx2 = this.segments.indexOf(segment2);
    if (idx1 + 1 != idx2) throw new Error('Tried to merge two non-adjacent segments!');

    const newMergedSegment = Segment.create(segment1.start, segment2.end);
    const newSegments = [...this.segments].splice(idx1, 2, newMergedSegment);
    const newStage = new Stage(this.sourceId, this.name, this.initialWaypoint, newSegments);
    return [newStage, newMergedSegment];
  }

  withSplitSegment(
    segment: Segment,
    newPos: Position,
  ): [Stage, { prevSegment: Segment; nextSegment: Segment }] {
    const idx = this.segments.indexOf(segment);
    if (idx === -1)
      throw new Error('Tried to split a segment that was not found in the segments array!');

    const middle = Waypoint.create(newPos);
    const prevSegment = Segment.create(segment.start, middle);
    const nextSegment = Segment.create(middle, segment.end);

    const newSegments = [...this.segments].splice(idx, 1, prevSegment, nextSegment);
    const newStage = new Stage(this.sourceId, this.name, this.initialWaypoint, newSegments);
    const newSplitSegments = { prevSegment, nextSegment };
    return [newStage, newSplitSegments];
  }

  withUpdatedSegment(segment: Segment, newSegment: Segment): [Stage, undefined] {
    const idx = this.segments.indexOf(segment);
    if (idx === -1)
      throw new Error('Tried to update a segment that was not found in the segments array!');

    const newSegments = [...this.segments].splice(idx, 1, newSegment);
    const newStage = new Stage(this.sourceId, this.name, this.initialWaypoint, newSegments);
    return [newStage, undefined];
  }

  //#endregion
  //#region Non-mutating methods

  findWaypointById(id: string): Waypoint | null {
    if (this.initialWaypoint?.id === id) return this.initialWaypoint;

    for (const segment of this.segments) {
      const waypoint = segment.findWaypoint(id);
      if (waypoint !== null) return waypoint;
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

  toJson(): StageData {
    return {
      version: Stage.VERSION,
      sourceId: this.sourceId,
      name: this.name,
      initialWaypoint: this.initialWaypoint,
      segments: this.segments,
    };
  }

  static fromJson(data: StageData): Stage {
    if (data.version != Stage.VERSION)
      throw new VersionMismatchError(
        `Tried loading a route with a different version (${data.version}) than expected (${Stage.VERSION}).`,
      );
    return new Stage(data.sourceId, data.name, data.initialWaypoint, data.segments);
  }

  toGeoJson(): StageFeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [...this.waypointsToFeatures(), ...this.tracksToFeatures()],
    };
  }

  private waypointsToFeatures(): Feature<Point, WaypointProperties>[] {
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
      } satisfies WaypointProperties,
    }));
  }

  private tracksToFeatures(): Feature<LineString, SegmentProperties>[] {
    // Save only routed segments
    const routedSegments = this.segments.filter(
      (s): s is Segment & { track: Node[]; info: SegmentInfo } =>
        s.track !== null && s.info !== null,
    );
    return routedSegments.map((segment) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: segment.track.map((node) => node.position),
      } satisfies LineString,
      properties: {
        id: segment.id,
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
    const tracks = this.tracksToFeatures();
    return {
      type: 'LineString',
      coordinates: tracks.flatMap((track) => track.geometry.coordinates),
    };
  }

  nearestPoint(lngLat: LngLat): NearestPointOnLine {
    const line = this.toLineString();
    const point = [lngLat.lng, lngLat.lat];
    return nearestPointOnLine(line, point);
  }
}
