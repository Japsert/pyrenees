import {
  Feature,
  FeatureCollection,
  LineString,
  MultiLineString,
  MultiPoint,
  Position,
} from 'geojson';

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

type SegmentProperties = {
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
  start: Waypoint;
  end: Waypoint;
  track: Node[] | null = null;
  info: SegmentInfo | null = null;

  constructor(start: Waypoint, end: Waypoint) {
    this.start = start;
    this.end = end;
  }

  static fromFeatures(
    start: Waypoint,
    end: Waypoint,
    positions: Position[],
    properties: SegmentProperties,
  ): Segment {
    const segment = new Segment(start, end);
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

  static fromFeatureCollection(start: Waypoint, end: Waypoint, fc: FeatureCollection): Segment {
    const segment = new Segment(start, end);

    const feature = fc.features.at(0)!;
    const { coordinates } = feature.geometry as LineString;
    const p = feature.properties!;
    const times = p['times'] as number[];
    segment.track = coordinates.map((pos, idx) => new Node([pos[0], pos[1]], pos[2], times[idx]));
    segment.info = {
      length: p['track-length'],
      totalAscend: p['filtered ascend'],
      netAscend: p['plain-ascend'],
      time: p['total-time'],
    };

    return segment;
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
    const segment = new Segment(start, end);
    this.segments.push(segment);

    this.initialWaypoint = null;

    return segment;
  }

  clone(): Route {
    const copy = new Route();
    copy.segments = [...this.segments];
    return copy;
  }

  toGeoJSON(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [this.waypointsToFeature(), this.tracksToFeature()],
    };
  }

  private waypointsToFeature(): Feature {
    const waypoints = this.segments.map((segment) => segment.start);
    if (this.segments.length > 0) waypoints.push(this.segments.at(-1)!.end);
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

  private tracksToFeature(): Feature {
    const routedSegments = this.segments.filter(
      (s): s is Segment & { track: Node[]; info: SegmentInfo } =>
        s.track !== null && s.info !== null,
    );
    const trackPositions: MultiLineString = {
      type: 'MultiLineString',
      coordinates: routedSegments.map((segment) => segment.track.map((node) => node.position)),
    };
    const segmentPropertiesList: SegmentProperties[] = routedSegments.map((segment) => ({
      trackElevation: segment.track.map((node) => node.elevation),
      trackTime: segment.track.map((node) => node.time),
      length: segment.info.length,
      totalAscend: segment.info.totalAscend,
      netAscend: segment.info.netAscend,
      time: segment.info.time,
    }));
    return {
      type: 'Feature',
      geometry: trackPositions,
      properties: segmentPropertiesList,
    };
  }

  static fromGeoJSON(featureCollection: FeatureCollection): Route {
    const route = new Route();
    const [waypointsFeature, tracksFeature] = featureCollection.features;
    const waypoints = (waypointsFeature.geometry as MultiPoint).coordinates;
    const positionsList = (tracksFeature.geometry as MultiLineString).coordinates;
    const waypointPropertiesList = waypointsFeature.properties as WaypointProperties[];

    route.segments = positionsList.map((positions, idx) => {
      const startProps = waypointPropertiesList.at(idx)!;
      const endProps = waypointPropertiesList.at(idx + 1)!;
      const start = new Waypoint(
        waypoints.at(idx)!,
        startProps.doesStartDay,
        startProps.doesEndDay,
      );
      const end = new Waypoint(waypoints.at(idx + 1)!, endProps.doesStartDay, endProps.doesEndDay);
      const properties = (tracksFeature.properties as SegmentProperties[]).at(idx)!;
      return Segment.fromFeatures(start, end, positions, properties);
    });

    return route;
  }
}
