import { FeatureCollection, LineString } from 'geojson';
import { generateId, Id } from '../util';
import { Waypoint, Node, WaypointJson, NodeJson } from '.';

export type SegmentJson = {
  id: Id;
  start: WaypointJson;
  end: WaypointJson;
  track: NodeJson[] | undefined;
  info: SegmentInfo | undefined;
};

export type SegmentProperties = {
  id: Id;
  color: string;
  trackElevation: number[];
  trackTime: number[];
} & SegmentInfo;

export type SegmentInfo = {
  readonly length: number;
  readonly totalAscend: number;
  readonly netAscend: number;
  readonly time: number;
};

type BRouterGeoJsonProperties = {
  times: number[];
  'track-length': string;
  'filtered ascend': string;
  'plain-ascend': string;
  'total-time': string;
};
export type BRouterFeatureCollection = FeatureCollection<LineString, BRouterGeoJsonProperties>;

export class Segment {
  private constructor(
    readonly id: Id,
    readonly start: Waypoint,
    readonly end: Waypoint,
    readonly track?: readonly Node[],
    readonly info?: SegmentInfo,
  ) {}

  static create(
    start: Waypoint,
    end: Waypoint,
    id: string = generateId(),
    track?: readonly Node[],
    info?: SegmentInfo,
  ): Segment {
    return new Segment(id, start, end, track, info);
  }

  withData(fc: BRouterFeatureCollection): Segment {
    const feature = fc.features.at(0)!;
    const { coordinates } = feature.geometry;
    const p = feature.properties;
    const times = p['times'];

    let track: Node[] = [];
    if (times !== undefined) { // leave empty if zero-length segment
      track = coordinates.map((pos, idx) => Node.create([pos[0], pos[1]], pos[2], times[idx]));
    }

    // '+' converts to number below
    const info = {
      length: +p['track-length'],
      totalAscend: +p['filtered ascend'],
      netAscend: +p['plain-ascend'],
      time: +p['total-time'],
    };
    return new Segment(this.id, this.start, this.end, track, info);
  }

  findWaypointById(id: Id): { segment: Segment; waypoint: Waypoint } | null {
    if (this.start.id === id) return { segment: this, waypoint: this.start };
    if (this.end.id === id) return { segment: this, waypoint: this.end };
    return null;
  }

  toJson(): SegmentJson {
    return {
      id: this.id,
      start: this.start.toJson(),
      end: this.end.toJson(),
      track: this.track?.map((node) => node.toJson()),
      info: this.info,
    };
  }

  static fromJson(data: SegmentJson): Segment {
    return new Segment(
      data.id,
      Waypoint.fromJson(data.start),
      Waypoint.fromJson(data.end),
      data.track?.map((node) => Node.fromJson(node)),
      data.info,
    );
  }
}
