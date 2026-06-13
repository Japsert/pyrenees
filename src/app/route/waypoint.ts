import { Position } from "geojson";
import { generateId } from "../math";
import { LngLat } from "mapbox-gl";

export type WaypointProperties = {
  version: number;
  id: string;
};

export class Waypoint {
  readonly id: string;
  readonly position: Position;

  constructor(position: Position, id: string = generateId()) {
    this.id = id;
    this.position = position;
  }

  withPosition(newPos: Position): Waypoint {
    return new Waypoint(newPos, this.id);
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }
}

export class Node {
  readonly position: Position;
  readonly elevation: number;
  readonly time: number;

  constructor(position: Position, elevation: number, time: number) {
    this.position = position;
    this.elevation = elevation;
    this.time = time;
  }

  asLngLat(): LngLat {
    return new LngLat(this.position[0], this.position[1]);
  }
}
