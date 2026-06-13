import { FeatureCollection, LineString, Position } from 'geojson';
import { generateId } from '../math';
import { Waypoint, Node } from './waypoint';

export type SegmentProperties = {
  version: number;
  id: string;
  trackElevation: number[];
  trackTime: number[];
} & SegmentInfo;

export type SegmentInfo = {
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
