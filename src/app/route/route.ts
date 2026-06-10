import { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';
import { LngLat } from 'mapbox-gl';
import { generateId } from '../math';
import { nearestPointOnLine } from '@turf/turf';

export type WaypointProperties = {
  version: number;
  id: string;
};

export class Waypoint {
  readonly id: string;
  readonly position: Position;

  constructor(position: Position, id: string = generateId()) {
    this.id = id;
    this.position = position;
  }

  withPosition(newPos: Position): Waypoint {
    return new Waypoint(newPos, this.id);
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }
}

export class Node {
  readonly position: Position;
  readonly elevation: number;
  readonly time: number;

  constructor(position: Position, elevation: number, time: number) {
    this.position = position;
    this.elevation = elevation;
    this.time = time;
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }
}

export type SegmentProperties = {
  version: number;
  id: string;
  trackElevation: number[];
  trackTime: number[];
} & SegmentInfo;

type SegmentInfo = {
  readonly length: number;
  readonly totalAscend: number;
  readonly netAscend: number;
  readonly time: number;
};

type BRouterGeoJSONProperties = {
  times: number[];
  'track-length': string;
  'filtered ascend': string;
  'plain-ascend': string;
  'total-time': string;
};
export type BRouterFeatureCollection = FeatureCollection<LineString, BRouterGeoJSONProperties>;

export class Segment {
  readonly id: string;
  readonly start: Waypoint;
  readonly end: Waypoint;
  readonly track: readonly Node[] | null = null;
  readonly info: SegmentInfo | null = null;

  constructor(
    start: Waypoint,
    end: Waypoint,
    id: string = generateId(),
    track?: readonly Node[],
    info?: SegmentInfo,
  ) {
    this.start = start;
    this.end = end;
    this.id = id;
    if (track) this.track = track;
    if (info) this.info = info;
  }

  static fromFeatures(
    start: Waypoint,
    end: Waypoint,
    positions: Position[],
    properties: SegmentProperties,
    id: string = generateId(),
  ): Segment {
    const track = positions.map((pos, idx) => {
      const elevation = properties.trackElevation.at(idx)!;
      const time = properties.trackTime.at(idx)!;
      return new Node(pos, elevation, time);
    });
    const info = {
      length: properties.length,
      totalAscend: properties.totalAscend,
      netAscend: properties.netAscend,
      time: properties.time,
    };
    return new Segment(start, end, id, track, info);
  }

  withData(fc: BRouterFeatureCollection): Segment {
    const feature = fc.features.at(0)!;
    const { coordinates } = feature.geometry;
    const p = feature.properties;
    const times = p['times'];

    const track = coordinates.map((pos, idx) => new Node([pos[0], pos[1]], pos[2], times[idx]));
    const info = {
      length: +p['track-length'],
      totalAscend: +p['filtered ascend'],
      netAscend: +p['plain-ascend'],
      time: +p['total-time'],
    };
    return new Segment(this.start, this.end, this.id, track, info);
  }
}

class GeoJSONError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'GeoJSONError';
    Object.setPrototypeOf(this, GeoJSONError.prototype);
  }
}

export class VersionMismatchError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'VersionMismatchError';
    Object.setPrototypeOf(this, VersionMismatchError.prototype);
  }
}

export type RouteFeatureCollection = FeatureCollection<
  Point | LineString,
  WaypointProperties | SegmentProperties
>;

export type RouteStats = SegmentInfo;

export type NearestPointOnLine = Feature<
  Point,
  {
    lineStringIndex: number;
    segmentIndex: number;
    totalDistance: number;
    lineDistance: number;
    segmentDistance: number;
    pointDistance: number;
  }
>;

export class Route {
  private static readonly VERSION: number = 5;
  initialWaypoint: Waypoint | null = null;
  segments: Segment[] = [];

  clone(): Route {
    const copy = new Route();
    copy.initialWaypoint = this.initialWaypoint;
    copy.segments = [...this.segments];
    return copy;
  }

  getStats(): RouteStats | null {
    const stats = {
      length: 0,
      totalAscend: 0,
      netAscend: 0,
      time: 0,
    } satisfies RouteStats;

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

  appendWaypoint(position: Position): Segment | null {
    if (this.segments.length == 0 && !this.initialWaypoint) {
      this.initialWaypoint = new Waypoint(position);
      return null;
    }

    const start = this.initialWaypoint ?? this.segments.at(-1)!.end;
    const end = new Waypoint(position);
    const segment = new Segment(start, end);
    this.segments.push(segment);

    this.initialWaypoint = null;

    return segment;
  }

  moveWaypoint(
    id: string,
    newPos: Position,
  ): { prevSegment: Segment | undefined; nextSegment: Segment | undefined } | void {
    if (this.initialWaypoint) {
      this.initialWaypoint = this.initialWaypoint.withPosition(newPos);
      return;
    }

    const prevSegmentIdx = this.segments.findIndex((seg) => seg.end.id == id);
    const nextSegmentIdx = this.segments.findIndex((seg) => seg.start.id == id);
    const prevSegment = prevSegmentIdx == -1 ? null : this.segments[prevSegmentIdx];
    const nextSegment = nextSegmentIdx == -1 ? null : this.segments[nextSegmentIdx];

    const waypoint = prevSegmentIdx == -1 ? nextSegment!.start : prevSegment!.end;
    const movedWaypoint = waypoint.withPosition(newPos);

    let newPrevSegment: Segment | undefined;
    let newNextSegment: Segment | undefined;

    if (prevSegment) {
      newPrevSegment = new Segment(
        prevSegment.start,
        movedWaypoint,
        prevSegment.id,
        prevSegment.track ?? undefined,
        prevSegment.info ?? undefined,
      );
      this.segments.splice(prevSegmentIdx, 1, newPrevSegment);
    }

    if (nextSegment) {
      newNextSegment = new Segment(movedWaypoint, nextSegment.end, nextSegment.id);
      this.segments.splice(nextSegmentIdx, 1, newNextSegment);
    }

    return { prevSegment: newPrevSegment, nextSegment: newNextSegment };
  }

  deleteWaypoint(id: string): Segment | void {
    if (this.initialWaypoint != null) {
      this.initialWaypoint = null;
      return;
    }

    // Delete adjoining segment if at either end
    const firstSegment = this.segments.at(0)!;
    if (firstSegment.start.id == id) return this.deleteSegment(firstSegment);
    const lastSegment = this.segments.at(-1)!;
    if (lastSegment.end.id == id) return this.deleteSegment(lastSegment);

    // Merge adjoining segments
    const idx = this.segments.findIndex((seg) => seg.start.id == id);
    if (idx == -1) throw new Error('Tried to delete a waypoint that was not found in any segment!');
    const prevSegment = this.segments.at(idx - 1)!;
    const nextSegment = this.segments.at(idx)!;

    return this.mergeSegments(prevSegment, nextSegment);
  }

  private deleteSegment(segment: Segment): void {
    const idx = this.segments.indexOf(segment);

    if (idx == -1)
      return console.error(
        'Tried to delete segment',
        segment,
        'but it was not found in the segments array!',
      );

    this.segments.splice(idx, 1);
  }

  private mergeSegments(segment1: Segment, segment2: Segment): Segment {
    const idx1 = this.segments.indexOf(segment1);
    const idx2 = this.segments.indexOf(segment2);
    if (idx1 + 1 != idx2) throw new Error('Tried to merge two non-adjacent segments!');

    const merged = new Segment(segment1.start, segment2.end);
    this.segments.splice(idx1, 2, merged);
    return merged;
  }

  splitSegment(segment: Segment, newPos: Position): { prevSegment: Segment; nextSegment: Segment } {
    const idx = this.segments.indexOf(segment);
    if (idx == -1)
      throw new Error('Tried to split a segment that was not found in the segments array!');

    const middle = new Waypoint(newPos);
    const prevSegment = new Segment(segment.start, middle);
    const nextSegment = new Segment(middle, segment.end);

    this.segments.splice(idx, 1, prevSegment, nextSegment);
    return { prevSegment, nextSegment };
  }

  toGeoJSON(): RouteFeatureCollection {
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
        version: Route.VERSION,
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
        version: Route.VERSION,
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

  nearestPointOnRoute(lngLat: LngLat): NearestPointOnLine {
    const line = this.toLineString();
    const point = [lngLat.lng, lngLat.lat];
    return nearestPointOnLine(line, point);
  }

  static fromGeoJSON(fc: RouteFeatureCollection): Route {
    const route = new Route();
    try {
      let firstTrackFeatureIdx = fc.features.findIndex((f) => f.geometry.type == 'LineString');
      if (firstTrackFeatureIdx == -1) {
        // No segments. Either there is an initial waypoint, or not
        if (fc.features.length > 0) {
          const pos = fc.features.at(0)!.geometry as Point;
          const props = fc.features.at(0)!.properties as WaypointProperties;
          this.checkVersion(props);
          route.initialWaypoint = new Waypoint(pos.coordinates, props.id);
        }
        return route;
      }

      const waypointFeatures = fc.features.slice(0, firstTrackFeatureIdx);
      const trackFeatures = fc.features.slice(firstTrackFeatureIdx);

      // Sanity check
      if (waypointFeatures.length - 1 != trackFeatures.length)
        throw new GeoJSONError(
          `Number of waypoints (${waypointFeatures.length}) and tracks (${trackFeatures.length}) are incorrect!`,
        );

      route.segments = trackFeatures.map((feature, idx) => {
        const startFeature = waypointFeatures.at(idx)!;
        const endFeature = waypointFeatures.at(idx + 1)!;

        const startPos = (startFeature.geometry as Point).coordinates;
        const endPos = (endFeature.geometry as Point).coordinates;
        const startProps = startFeature.properties as WaypointProperties;
        const endProps = endFeature.properties as WaypointProperties;
        this.checkVersion(startProps);
        this.checkVersion(endProps);

        const start = new Waypoint(startPos, startProps.id);
        const end = new Waypoint(endPos, endProps.id);
        const positions = (feature.geometry as LineString).coordinates;
        const properties = feature.properties as SegmentProperties;
        this.checkVersion(properties);
        return Segment.fromFeatures(start, end, positions, properties);
      });

      return route;
    } catch (error) {
      if (error instanceof VersionMismatchError || error instanceof GeoJSONError) throw error;
      throw new VersionMismatchError(
        'Tried loading a route with a different version than expected.',
      );
    }
  }

  private static checkVersion(properties: WaypointProperties | SegmentProperties): void {
    if (properties.version != Route.VERSION)
      throw new VersionMismatchError(
        `Tried loading a route with a different version (${properties.version}) than expected (${Route.VERSION}).`,
      );
  }
}
