import { Position } from 'geojson';
import { LngLat } from 'mapbox-gl';
import { generateId, Id } from '../util';

export type WaypointJson = {
  position: Position;
  id: Id;
};

export type WaypointProperties = {
  id: Id;
  color: string;
};

export class Waypoint {
  private constructor(
    readonly id: Id,
    readonly position: Position,
  ) {}

  static create(position: Position) {
    return new Waypoint(generateId(), position);
  }

  withPosition(newPos: Position): Waypoint {
    return new Waypoint(this.id, newPos);
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }

  toJson(): WaypointJson {
    return {
      position: this.position,
      id: this.id,
    };
  }

  static fromJson(data: WaypointJson): Waypoint {
    return new Waypoint(data.id, data.position);
  }
}
