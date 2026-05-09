import {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  LineString,
  MultiPoint,
  Position,
} from 'geojson';

export class Waypoint {
  position: Position;

  constructor(position: Position) {
    this.position = position;
  }
}

function WaypointsToFeature(wps: Waypoint[]): Feature {
  return {
    type: 'Feature',
    geometry: {
      type: 'MultiPoint',
      coordinates: wps.map((waypoint) => waypoint.position),
    },
    properties: {},
  };
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

export class Track {
  track: Node[] = [];
  length: number = 0;
  total_ascend: number = 0;
  net_ascend: number = 0;
  time: number = 0;

  constructor(track?: Feature | FeatureCollection) {
    if (!track) return;

    if (track.type == 'Feature') {
      const { coordinates } = track.geometry as LineString;
      const p = track.properties!;
      const elevations = p['elevations'] as number[];
      const times = p['times'] as number[];
      this.track = coordinates.map(
        (pos, idx) => new Node([pos[0], pos[1]], elevations[idx], times[idx]),
      );
      this.length = p['length'];
      this.total_ascend = p['total_ascend'];
      this.net_ascend = p['net_ascend'];
      this.time = p['time'];
    } else if (track.type == 'FeatureCollection') {
      const feature = (track as FeatureCollection).features[0];
      const { coordinates } = feature.geometry as LineString;
      const p = feature.properties!;
      const times = p['times'] as number[];
      this.track = coordinates.map((pos, idx) => new Node([pos[0], pos[1]], pos[2], times[idx]));
      this.length = p['track-length'];
      this.total_ascend = p['filtered ascend'];
      this.net_ascend = p['plain-ascend'];
      this.time = p['total-time'];
    }
  }

  toFeature(): Feature {
    return {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: this.track.map((node) => node.position),
      },
      properties: {
        elevations: this.track.map((node) => node.elevation),
        times: this.track.map((node) => node.time),
        length: this.length,
        total_ascend: this.total_ascend,
        net_ascend: this.net_ascend,
        time: this.time,
      },
    };
  }
}

export class Route {
  waypoints: Waypoint[];
  track: Track;

  constructor(waypoints?: Waypoint[], track?: Track) {
    this.waypoints = waypoints ?? [];
    this.track = track ?? new Track();
  }

  appendWaypoint(waypoint: Waypoint) {
    this.waypoints.push(waypoint);
  }

  clone(): Route {
    const copy = new Route();
    copy.waypoints = [...this.waypoints];
    copy.track = this.track;
    return copy;
  }

  toGeoJSON(): FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: [WaypointsToFeature(this.waypoints), this.track.toFeature()],
    };
  }

  static fromGeoJSON(featureCollection: FeatureCollection): Route {
    const [waypointsFeature, trackFeature] = featureCollection.features;

    const waypoints = (waypointsFeature.geometry as MultiPoint).coordinates.map(
      (pos) => new Waypoint(pos as Position),
    );
    const track = new Track(trackFeature);

    return new Route(waypoints, track);
  }
}
