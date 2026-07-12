import { Id } from '../util';
import { LngLat, Map as MapboxMap } from 'mapbox-gl';

//#region Types

export type InteractionContext = {
  beginWaypointHover(map: MapboxMap, waypointId: Id): void;
  endWaypointHover(map: MapboxMap, waypointId: Id): void;
  beginWaypointDrag(map: MapboxMap, waypointId: Id): void;
  updateWaypointDrag(map: MapboxMap, waypointId: Id, lngLat: LngLat): void;
  finishWaypointDrag(map: MapboxMap, waypointId: Id, lngLat: LngLat): void;
  mergeWaypointDrag(map: MapboxMap, waypointId: Id): void;
  cancelWaypointDrag(map: MapboxMap, waypointId: Id): void;
  selectWaypoint(map: MapboxMap, waypointId: Id): void;

  updateSegmentHover(map: MapboxMap, lngLat: LngLat): void;
  endSegmentHover(map: MapboxMap, segmentId: Id): void;
  beginSegmentDrag(map: MapboxMap, segmentId: Id): void;
  updateSegmentDrag(map: MapboxMap, segmentId: Id, lngLat: LngLat): void;
  finishSegmentDrag(map: MapboxMap, segmentId: Id, lngLat: LngLat): void;
  cancelSegmentDrag(map: MapboxMap): void;
  selectSegment(map: MapboxMap, segmentId: Id): void;
};

export type InteractionEvent =
  | { type: 'mouseEnterWaypoint'; waypointId: Id }
  | { type: 'mouseLeaveWaypoint'; lngLat: LngLat; segmentId: Id | undefined }
  | { type: 'mouseDownWaypoint' }
  | { type: 'mouseUpWaypoint'; waypointId: Id }
  | { type: 'mouseEnterSegment'; segmentId: Id; lngLat: LngLat }
  | { type: 'mouseMoveSegment'; lngLat: LngLat }
  | { type: 'mouseLeaveSegment'; lngLat: LngLat }
  | { type: 'mouseDownSegment' }
  | { type: 'mouseUpSegment'; segmentId: Id; lngLat: LngLat }
  | { type: 'mouseMove'; lngLat: LngLat }
  | { type: 'mouseUp'; lngLat: LngLat }
  | { type: 'keyBackspace' }
  | { type: 'keyEscape' }
  | { type: 'mouseClickOutside' };

//#endregion
//#region Interface

export interface InteractionState {
  mode:
    | 'idle'
    | 'hoverWaypoint'
    | 'mayDragWaypoint'
    | 'dragWaypoint'
    | 'hoverSegment'
    | 'mayDragSegment'
    | 'dragSegment';
  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined;
  onEnter(map: MapboxMap, context: InteractionContext): void;
  onExit(map: MapboxMap, context: InteractionContext): void;
}

//#endregion
//#region IdleState

export class IdleState implements InteractionState {
  readonly mode = 'idle';

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseEnterWaypoint') return new HoverWaypointState(event.waypointId);
    if (event.type === 'mouseEnterSegment')
      return new HoverSegmentState(event.segmentId, event.lngLat);
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {}

  onExit(map: MapboxMap, context: InteractionContext): void {}
}

//#endregion
//#region HoverWaypointState

class HoverWaypointState implements InteractionState {
  readonly mode = 'hoverWaypoint';
  constructor(readonly waypointId: Id) {}

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseLeaveWaypoint') {
      if (event.segmentId !== undefined) {
        return new HoverSegmentState(event.segmentId, event.lngLat);
      }
      return new IdleState();
    }
    if (event.type === 'mouseDownWaypoint') return new MayDragWaypointState(this.waypointId);
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {
    context.beginWaypointHover(map, this.waypointId);
  }

  onExit(map: MapboxMap, context: InteractionContext): void {
    context.endWaypointHover(map, this.waypointId);
  }
}

//#endregion
//#region MayDragWaypointState

class MayDragWaypointState implements InteractionState {
  readonly mode = 'mayDragWaypoint';
  constructor(readonly waypointId: Id) {}

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseUpWaypoint') {
      context.selectWaypoint(map, event.waypointId);
      return new IdleState();
    }
    if (event.type === 'mouseLeaveWaypoint') {
      context.beginWaypointDrag(map, this.waypointId);
      return new DragWaypointState(this.waypointId, event.lngLat);
    }
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {}

  onExit(map: MapboxMap, context: InteractionContext): void {}
}

//#endregion
//#region DragWaypointState

class DragWaypointState implements InteractionState {
  readonly mode = 'dragWaypoint';
  constructor(
    readonly waypointId: Id,
    readonly lngLat: LngLat,
  ) {}

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseMove') {
      context.updateWaypointDrag(map, this.waypointId, event.lngLat);
      return new DragWaypointState(this.waypointId, event.lngLat);
    }
    if (event.type === 'mouseUpWaypoint') {
      if (event.waypointId === this.waypointId) {
        // returned to self
        context.cancelWaypointDrag(map, this.waypointId);
        return new HoverWaypointState(this.waypointId);
      } else {
        // released on another waypoint
        context.mergeWaypointDrag(map, this.waypointId);
        return new IdleState();
      }
    }
    if (event.type === 'mouseUp') {
      context.finishWaypointDrag(map, this.waypointId, this.lngLat);
      return new IdleState();
    }
    if (event.type === 'keyEscape') {
      context.cancelWaypointDrag(map, this.waypointId);
      return new IdleState();
    }
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {
    context.updateWaypointDrag(map, this.waypointId, this.lngLat);
  }

  onExit(map: MapboxMap, context: InteractionContext): void {}
}

//#endregion
//#region HoverSegmentState

class HoverSegmentState implements InteractionState {
  readonly mode = 'hoverSegment';
  constructor(
    readonly segmentId: Id,
    readonly lngLat: LngLat,
  ) {}

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseDownSegment') return new MayDragSegmentState(this.segmentId);
    if (event.type === 'mouseLeaveSegment') return new IdleState();
    if (event.type === 'mouseMoveSegment' || event.type === 'mouseMove')
      return new HoverSegmentState(this.segmentId, event.lngLat);
    if (event.type === 'mouseEnterWaypoint') return new HoverWaypointState(event.waypointId);
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {
    context.updateSegmentHover(map, this.lngLat);
  }

  onExit(map: MapboxMap, context: InteractionContext): void {
    context.endSegmentHover(map, this.segmentId);
  }
}

//#endregion
//#region MayDragSegmentState

class MayDragSegmentState implements InteractionState {
  readonly mode = 'mayDragSegment';
  constructor(readonly segmentId: Id) {}

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseLeaveSegment')
      return new DragSegmentState(this.segmentId, event.lngLat);
    if (event.type === 'mouseUpSegment') return new HoverSegmentState(this.segmentId, event.lngLat);
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {
    context.selectSegment(map, this.segmentId);
  }

  onExit(map: MapboxMap, context: InteractionContext): void {}
}

//#endregion
//#region DragSegmentState

class DragSegmentState implements InteractionState {
  readonly mode = 'dragSegment';
  constructor(
    readonly segmentId: Id,
    readonly lngLat: LngLat,
  ) {}

  transition(
    map: MapboxMap,
    event: InteractionEvent,
    context: InteractionContext,
  ): InteractionState | undefined {
    if (event.type === 'mouseMove') return new DragSegmentState(this.segmentId, event.lngLat);
    if (event.type === 'mouseUpSegment' && event.segmentId === this.segmentId) {
      // returned to self
      context.cancelSegmentDrag(map);
      return new IdleState();
    }
    if (event.type === 'mouseUp') {
      context.finishSegmentDrag(map, this.segmentId, event.lngLat);
      return new IdleState();
    }
    if (event.type === 'keyEscape') {
      context.cancelSegmentDrag(map);
      return new IdleState();
    }
    return undefined;
  }

  onEnter(map: MapboxMap, context: InteractionContext): void {
    context.updateSegmentDrag(map, this.segmentId, this.lngLat);
  }

  onExit(map: MapboxMap, context: InteractionContext): void {}
}

//#endregion
