import {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  Position,
} from 'geojson';
import { LngLat } from 'mapbox-gl';

type WaypointProperties = {
  doesStartDay: boolean;
  doesEndDay: boolean;
};

export class Waypoint {
  position: Position;
  doesStartDay: boolean;
  doesEndDay: boolean;

  constructor(position: Position, doesStartDay: boolean = false, doesEndDay: boolean = false) {
    this.position = position;
    this.doesStartDay = doesStartDay;
    this.doesEndDay = doesEndDay;
  }
}

class Node {
  position: Position;
  elevation: number;
  time: number;

  constructor(position: Position, elevation: number, time: number) {
    this.position = position;
    this.elevation = elevation;
    this.time = time;
  }
}

export type SegmentProperties = {
  idx: number;
  trackElevation: number[];
  trackTime: number[];
} & SegmentInfo;

type SegmentInfo = {
  length: number;
  totalAscend: number;
  netAscend: number;
  time: number;
};

export class Segment {
  idx: number;
  start: Waypoint;
  end: Waypoint;
  track: Node[] | null = null;
  info: SegmentInfo | null = null;

  constructor(start: Waypoint, end: Waypoint, idx: number) {
    this.start = start;
    this.end = end;
    this.idx = idx;
  }

  static fromFeatures(
    start: Waypoint,
    end: Waypoint,
    positions: Position[],
    properties: SegmentProperties,
  ): Segment {
    const segment = new Segment(start, end, properties.idx);
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

  updateFromFeatureCollection(fc: FeatureCollection): void {
    const feature = fc.features.at(0)!;
    const { coordinates } = feature.geometry as LineString;
    const p = feature.properties!;
    const times = p['times'] as number[];
    this.track = coordinates.map((pos, idx) => new Node([pos[0], pos[1]], pos[2], times[idx]));
    this.info = {
      length: p['track-length'],
      totalAscend: p['filtered ascend'],
      netAscend: p['plain-ascend'],
      time: p['total-time'],
    };
  }
}

export class Route {
  initialWaypoint: Waypoint | null = null;
  segments: Segment[] = [];

  appendWaypoint(lng: number, lat: number): Segment | null {
    if (this.segments.length == 0 && !this.initialWaypoint) {
      this.initialWaypoint = new Waypoint([lng, lat], true);
      return null;
    }

    const start = this.initialWaypoint ?? this.segments.at(-1)!.end;
    const end = new Waypoint([lng, lat]);
    const idx = this.segments.length;
    const segment = new Segment(start, end, idx);
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

  incrementIndices(startIdx: number): void {
    for (let i = startIdx; i < this.segments.length; i++) {
      this.segments[i].idx++;
    }
  }

  splitSegment(segment: Segment, newPos: Position): { seg1: Segment; seg2: Segment } {
    const idx1 = segment.idx;
    const idx2 = idx1 + 1;
    this.incrementIndices(idx2);

    const end1 = new Waypoint(newPos);
    const start2 = new Waypoint(newPos);
    const seg1 = new Segment(segment.start, end1, idx1);
    const seg2 = new Segment(start2, segment.end, idx2);

    this.segments.splice(idx1, 1, seg1, seg2);

    return { seg1, seg2 };
  }

  toGeoJSON(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [this.waypointsToFeature(), ...this.tracksToFeatures()],
    };
  }

  private waypointsToFeature(): Feature {
    const waypoints = this.segments.map((segment) => segment.start);
    if (this.initialWaypoint) waypoints.push(this.initialWaypoint);
    else if (this.segments.length > 0) waypoints.push(this.segments.at(-1)!.end);

    const waypointPositions: MultiPoint = {
      type: 'MultiPoint',
      coordinates: waypoints.map((wp) => wp.position),
    };
    const waypointPropertiesList: WaypointProperties[] = waypoints.map((waypoint) => ({
      doesStartDay: waypoint.doesStartDay,
      doesEndDay: waypoint.doesEndDay,
    }));
    return {
      type: 'Feature',
      geometry: waypointPositions,
      properties: waypointPropertiesList,
    };
  }

  private tracksToFeatures(): Feature[] {
    const routedSegments = this.segments.filter(
      (s): s is Segment & { track: Node[]; info: SegmentInfo } =>
        s.track !== null && s.info !== null,
    );
    return routedSegments.map((segment) => {
      const segmentPositions: LineString = {
        type: 'LineString',
        coordinates: segment.track.map((node) => node.position),
      };
      const segmentProperties: SegmentProperties = {
        idx: segment.idx,
        trackElevation: segment.track.map((node) => node.elevation),
        trackTime: segment.track.map((node) => node.time),
        length: segment.info.length,
        totalAscend: segment.info.totalAscend,
        netAscend: segment.info.netAscend,
        time: segment.info.time,
      };
      return {
        type: 'Feature',
        geometry: segmentPositions,
        properties: segmentProperties,
      };
    });
  }

  static fromGeoJSON(featureCollection: FeatureCollection): Route {
    const route = new Route();
    const waypointsFeature = featureCollection.features.at(0)!;
    const waypointPositions = (waypointsFeature.geometry as MultiPoint).coordinates;
    const waypointPropertiesList = waypointsFeature.properties as WaypointProperties[];

    const trackFeatures = featureCollection.features.slice(1);
    route.segments = trackFeatures.map((feature, idx) => {
      const startPos = waypointPositions.at(idx)!;
      const endPos = waypointPositions.at(idx + 1)!;
      const startProps = waypointPropertiesList.at(idx)!;
      const endProps = waypointPropertiesList.at(idx + 1)!;

      const start = new Waypoint(startPos, startProps.doesStartDay, startProps.doesEndDay);
      const end = new Waypoint(endPos, endProps.doesStartDay, endProps.doesEndDay);
      const positions = (feature.geometry as LineString).coordinates;
      const properties = feature.properties as SegmentProperties;
      return Segment.fromFeatures(start, end, positions, properties);
    });

    return route;
  }
}
