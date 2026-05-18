import { Feature, FeatureCollection, LineString, Point, Position } from 'geojson';

export type WaypointProperties = {
  version: number;
  idx: number;
  doesStartDay: boolean;
  doesEndDay: boolean;
};

export class Waypoint {
  readonly idx: number;
  readonly position: Position;
  readonly doesStartDay: boolean;
  readonly doesEndDay: boolean;

  constructor(
    idx: number,
    position: Position,
    doesStartDay: boolean = false,
    doesEndDay: boolean = false,
  ) {
    this.idx = idx;
    this.position = position;
    this.doesStartDay = doesStartDay;
    this.doesEndDay = doesEndDay;
  }
}

class Node {
  readonly position: Position;
  readonly elevation: number;
  readonly time: number;

  constructor(position: Position, elevation: number, time: number) {
    this.position = position;
    this.elevation = elevation;
    this.time = time;
  }
}

export type SegmentProperties = {
  version: number;
  idx: number;
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
  'track-length': number;
  'filtered ascend': number;
  'plain-ascend': number;
  'total-time': number;
};
export type BRouterFeatureCollection = FeatureCollection<LineString, BRouterGeoJSONProperties>;

export class Segment {
  readonly idx: number;
  readonly start: Waypoint;
  readonly end: Waypoint;
  track: readonly Node[] | null = null;
  info: SegmentInfo | null = null;

  constructor(idx: number, start: Waypoint, end: Waypoint, track?: readonly Node[], info?: SegmentInfo) {
    this.idx = idx;
    this.start = start;
    this.end = end;
    if (track) this.track = track;
    if (info) this.info = info;
  }

  static fromFeatures(
    start: Waypoint,
    end: Waypoint,
    positions: Position[],
    properties: SegmentProperties,
  ): Segment {
    const segment = new Segment(properties.idx, start, end);
    segment.track = positions.map((pos, idx) => {
      const elevation = properties.trackElevation.at(idx)!;
      const time = properties.trackTime.at(idx)!;
      return new Node(pos, elevation, time);
    });
    segment.info = {
      length: properties.length,
      totalAscend: properties.totalAscend,
      netAscend: properties.netAscend,
      time: properties.time,
    };
    return segment;
  }

  updateFromFeatureCollection(fc: BRouterFeatureCollection): void {
    const feature = fc.features.at(0)!;
    const { coordinates } = feature.geometry;
    const p = feature.properties;
    const times = p['times'];
    this.track = coordinates.map((pos, idx) => new Node([pos[0], pos[1]], pos[2], times[idx]));
    this.info = {
      length: p['track-length'],
      totalAscend: p['filtered ascend'],
      netAscend: p['plain-ascend'],
      time: p['total-time'],
    };
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

export class Route {
  private static readonly VERSION: number = 4;
  initialWaypoint: Waypoint | null = null;
  segments: Segment[] = [];

  appendWaypoint(lng: number, lat: number): Segment | null {
    if (this.segments.length == 0 && !this.initialWaypoint) {
      this.initialWaypoint = new Waypoint(0, [lng, lat], true, false);
      return null;
    }

    const start = this.initialWaypoint ?? this.segments.at(-1)!.end;
    const end = new Waypoint(start.idx + 1, [lng, lat]);
    const idx = this.segments.length;
    const segment = new Segment(idx, start, end);
    this.segments.push(segment);

    this.initialWaypoint = null;

    return segment;
  }

  clone(): Route {
    const copy = new Route();
    copy.initialWaypoint = this.initialWaypoint;
    copy.segments = [...this.segments];
    return copy;
  }

  private static decrementIndices(segments: Segment[], startIdx: number): Segment[] {
    return Route.updateIndices(segments, startIdx, (idx) => idx - 1);
  }

  private static incrementIndices(segments: Segment[], startIdx: number): Segment[] {
    return Route.updateIndices(segments, startIdx, (idx) => idx + 1);
  }

  private static updateIndices(
    segments: Segment[],
    startIdx: number,
    func: (idx: number) => number,
  ) {
    return segments.map((segment, idx) =>
      idx < startIdx
        ? segment
        : new Segment(
            func(segment.idx),
            new Waypoint(
              func(segment.start.idx),
              segment.start.position,
              segment.start.doesStartDay,
              segment.start.doesEndDay,
            ),
            new Waypoint(
              func(segment.end.idx),
              segment.end.position,
              segment.end.doesStartDay,
              segment.end.doesEndDay,
            ),
            segment.track ?? undefined,
            segment.info ?? undefined,
          ),
    );
  }

  splitSegment(segment: Segment, newPos: Position): { seg1: Segment; seg2: Segment } {
    const idx1 = segment.idx;
    const idx2 = idx1 + 1;

    const start = segment.start;
    const end = segment.end;

    const start1 = new Waypoint(start.idx, start.position, start.doesStartDay, start.doesEndDay);
    const end1 = new Waypoint(idx2, newPos, false, false);
    const start2 = new Waypoint(idx2, newPos, false, false);
    const end2 = new Waypoint(end.idx + 1, end.position, end.doesStartDay, end.doesEndDay);
    const seg1 = new Segment(idx1, start1, end1);
    const seg2 = new Segment(idx2, start2, end2);

    this.segments.splice(idx1, 1, seg1, seg2);
    this.segments = Route.incrementIndices(this.segments, idx2 + 1);
    return { seg1, seg2 };
  }

  deleteWaypoint(idx: number): Segment | void {
    if (this.initialWaypoint != null) {
      if (this.initialWaypoint.idx != idx)
        return console.error(`Tried to delete waypoint ${idx}, but there is only one waypoint!`);
      this.initialWaypoint = null;
      return;
    }

    // Delete adjoining segment if at either end
    const firstSegment = this.segments.at(0)!;
    if (firstSegment.start.idx == idx) return this.deleteSegment(firstSegment);
    const lastSegment = this.segments.at(-1)!;
    if (lastSegment.end.idx == idx) return this.deleteSegment(lastSegment);

    // Merge adjoining segments (including sanity check)
    const prevSegments = this.segments.filter((segment) => segment.end.idx == idx);
    const nextSegments = this.segments.filter((segment) => segment.start.idx == idx);
    if (prevSegments.length == 0)
      return console.error(
        `Tried to delete waypoint ${idx}, but there are no segments with that end idx!`,
      );
    if (nextSegments.length == 0)
      return console.error(
        `Tried to delete waypoint ${idx}, but there are no segments with that start idx!`,
      );
    if (prevSegments.length > 1)
      return console.error(
        `Tried to delete waypoint ${idx}, but there are more than one segments with that end idx!`,
      );
    if (nextSegments.length > 1)
      return console.error(
        `Tried to delete waypoint ${idx}, but there are more than one segments with that start idx!`,
      );

    const prevSegment = prevSegments.at(0)!;
    const nextSegment = nextSegments.at(0)!;
    return this.mergeSegments(prevSegment, nextSegment);
  }

  deleteSegment(segment: Segment): void {
    const idx = this.segments.indexOf(segment);

    if (idx == -1)
      return console.error(
        'Tried to delete segment',
        segment,
        'but it was not found in the segments array!',
      );
    if (idx != segment.idx) console.warn('Mismatching indices when deleting segment!');

    this.segments.splice(idx, 1);
    this.segments = Route.decrementIndices(this.segments, idx);
  }

  mergeSegments(segment1: Segment, segment2: Segment): Segment {
    const idx1 = this.segments.indexOf(segment1);
    const idx2 = this.segments.indexOf(segment2);

    if (idx1 != segment1.idx) console.warn('Mismatching indices when deleting segment!');
    if (idx2 != segment2.idx) console.warn('Mismatching indices when deleting segment!');
    if (idx1 + 1 != idx2) throw new Error('Tried to merge two non-adjacent segments!');

    const oldStart = segment1.start;
    const oldEnd = segment2.end;
    const start = new Waypoint(idx1, oldStart.position, oldStart.doesStartDay, oldEnd.doesEndDay);
    const end = new Waypoint(idx2, oldEnd.position, oldEnd.doesStartDay, oldEnd.doesEndDay);
    const merged = new Segment(idx1, start, end);
    this.segments.splice(idx1, 2, merged);
    this.segments = Route.decrementIndices(this.segments, idx2);

    return merged;
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
        idx: waypoint.idx,
        doesStartDay: waypoint.doesStartDay,
        doesEndDay: waypoint.doesEndDay,
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
        idx: segment.idx,
        trackElevation: segment.track.map((node) => node.elevation),
        trackTime: segment.track.map((node) => node.time),
        length: segment.info.length,
        totalAscend: segment.info.totalAscend,
        netAscend: segment.info.netAscend,
        time: segment.info.time,
      } satisfies SegmentProperties,
    }));
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
          route.initialWaypoint = new Waypoint(
            props.idx,
            pos.coordinates,
            props.doesStartDay,
            props.doesEndDay,
          );
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

        const start = new Waypoint(idx, startPos, startProps.doesStartDay, startProps.doesEndDay);
        const end = new Waypoint(idx + 1, endPos, endProps.doesStartDay, endProps.doesEndDay);
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
