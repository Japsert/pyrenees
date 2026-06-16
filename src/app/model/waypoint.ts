import { Position } from 'geojson';
import { LngLat } from 'mapbox-gl';
import { generateId } from '../util';

export type WaypointProperties = {
  id: string;
};

export class Waypoint {
  private constructor(
    readonly position: Position,
    readonly id: string
  ) {}

  static create(position: Position, id: string = generateId()) {
    return new Waypoint(position, id);
  }

  withPosition(newPos: Position): Waypoint {
    return new Waypoint(newPos, this.id);
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }
}
