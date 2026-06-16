import { Position } from 'geojson';
import { LngLat } from 'mapbox-gl';

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
}
