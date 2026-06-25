import { Position } from 'geojson';
import { LngLat } from 'mapbox-gl';

export type NodeJson = {
  position: Position;
  elevation: number;
  time: number;
};

export class Node {
  private constructor(
    readonly position: Position,
    readonly elevation: number,
    readonly time: number,
  ) {}

  static create(position: Position, elevation: number, time: number) {
    return new Node(position, elevation, time);
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }

  toJson(): NodeJson {
    return {
      position: this.position,
      elevation: this.elevation,
      time: this.time,
    };
  }

  static fromJson(data: NodeJson): Node {
    return new Node(data.position, data.elevation, data.time);
  }
}
