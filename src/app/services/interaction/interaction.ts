import { computed, inject, Injectable, signal } from '@angular/core';
import { Map as MapboxMap, LngLat } from 'mapbox-gl';
import { Position } from 'geojson';
import { PlannerService } from '../planner';
import { ease, Id } from '../../util';
import { MapLayersService } from '../layers';
import { LayerIds, SourceIds } from '../../ids.enum';
import { CursorService } from '../cursor';
import { WaypointProperties, SegmentProperties } from '../../model';
import { IdleState, InteractionContext, InteractionEvent, InteractionState } from './states';

@Injectable({
  providedIn: 'root',
})
export class InteractionService implements InteractionContext {
  private readonly layers = inject(MapLayersService);
  private readonly planner = inject(PlannerService);
  private readonly cursor = inject(CursorService);

  isEditingRoute = signal<boolean>(false);

  readonly hoverProgress = new Map<string, number>();

  //#region State

  readonly state = signal<InteractionState>(new IdleState());
  readonly selectedWaypointId = signal<Id | null>(null);
  readonly routeHoverIdx = signal<number | null>(null);

  dispatch(map: MapboxMap, event: InteractionEvent): void {
    // should see if we can transition from current state with event to another state
    const next = this.state().transition(map, event, this);
    if (next) {
      this.state().onExit(map, this);
      this.state.set(next);
      next.onEnter(map, this);
    }
  }

  //#region Handlers

  addPlannerHandlers(map: MapboxMap): void {
    map
      .on('click', (e) => {
        const clickedWaypoint = map
          .queryRenderedFeatures(e.point, { layers: [LayerIds.WAYPOINTS] })
          .at(0);
        if (this.isEditingRoute()) {
          let newPos: Position;
          if (clickedWaypoint === undefined) {
            newPos = [e.lngLat.lng, e.lngLat.lat];
          } else {
            const id = (clickedWaypoint.properties as WaypointProperties).id;
            newPos = this.planner.findWaypointById(id)!.waypoint.position;
          }
          this.planner.addWaypoint(newPos);
        }
        const selectedWaypointId = this.selectedWaypointId();
        if (clickedWaypoint === undefined && selectedWaypointId !== null)
          this.deselectWaypoint(map, selectedWaypointId);
      })
      .on('mouseenter', LayerIds.WAYPOINTS, (e) => {
        const waypointId = (e.features?.at(0)?.properties as WaypointProperties).id;
        this.dispatch(map, { type: 'mouseEnterWaypoint', waypointId });
      })
      .on('mouseleave', LayerIds.WAYPOINTS, (e) => {
        const segmentFeatures = map.queryRenderedFeatures(e.point, {
          layers: [LayerIds.SEGMENT_LINE_HITBOX],
        });
        const segmentId: Id | undefined = segmentFeatures.at(0)?.properties?.['id'];
        this.dispatch(map, { type: 'mouseLeaveWaypoint', lngLat: e.lngLat, segmentId });
      })
      .on('mousedown', LayerIds.WAYPOINTS, (e) => {
        e.preventDefault(); // prevent map pan
        const waypointId = (e.features?.at(0)?.properties as WaypointProperties).id;
        this.dispatch(map, { type: 'mouseDownWaypoint', waypointId });
      })
      .on('mouseup', LayerIds.WAYPOINTS, (e) => {
        const waypointId = (e.features?.at(0)?.properties as WaypointProperties).id;
        this.dispatch(map, { type: 'mouseUpWaypoint', waypointId });
      })
      .on('mouseenter', LayerIds.SEGMENT_LINE_HITBOX, (e) => {
        const segmentId = (e.features?.at(0)?.properties as SegmentProperties).id;
        this.dispatch(map, { type: 'mouseEnterSegment', segmentId, lngLat: e.lngLat });
      })
      .on('mouseleave', LayerIds.SEGMENT_LINE_HITBOX, (e) => {
        this.dispatch(map, { type: 'mouseLeaveSegment', lngLat: e.lngLat });
      })
      .on('mousedown', LayerIds.SEGMENT_LINE_HITBOX, (e) => {
        e.preventDefault(); // prevent map pan
        const segmentId = (e.features?.at(0)?.properties as SegmentProperties).id;
        this.dispatch(map, { type: 'mouseDownSegment', segmentId });
      })
      .on('mouseup', LayerIds.SEGMENT_LINE_HITBOX, (e) => {
        const segmentId = (e.features?.at(0)?.properties as SegmentProperties).id;
        this.dispatch(map, { type: 'mouseUpSegment', segmentId, lngLat: e.lngLat });
      })
      .on('mousemove', LayerIds.SEGMENT_LINE_HITBOX, (e) => {
        this.dispatch(map, { type: 'mouseMoveSegment', lngLat: e.lngLat });
      })
      .on('mousemove', (e) => {
        this.dispatch(map, { type: 'mouseMove', lngLat: e.lngLat });
      })
      .on('mouseup', (e) => {
        this.dispatch(map, { type: 'mouseUp', lngLat: e.lngLat });
      });
  }

  addRoutePlannerKeyboardHandlers(getActiveMap: () => MapboxMap): void {
    globalThis.addEventListener('keydown', (e) => {
      const activeMap = getActiveMap();
      if (e.key === 'Backspace') {
        const selectedWaypointId = this.selectedWaypointId();
        if (selectedWaypointId !== null) this.planner.deleteWaypoint(selectedWaypointId);
      } else if (e.key === 'Escape') {
        this.dispatch(activeMap, { type: 'keyEscape' });
      } else if (e.key === 'e') {
        this.toggleAddingWaypoints();
      }
    });
  }

  //#region Waypoints

  turnAddingWaypointsOn(): void {
    this.isEditingRoute.set(true);
    this.cursor.set('adding-waypoint', true);
  }

  toggleAddingWaypoints(): void {
    this.isEditingRoute.update((bool) => !bool);
    this.cursor.set('adding-waypoint', this.isEditingRoute());
  }

  beginWaypointHover(map: MapboxMap, waypointId: Id): void {
    if (!this.hoverProgress.has(waypointId)) this.hoverProgress.set(waypointId, 0);
    this.animateWaypointHover(map, waypointId, true);
  }

  endWaypointHover(map: MapboxMap, waypointId: Id): void {
    this.animateWaypointHover(map, waypointId, false);
  }

  private animateWaypointHover(map: MapboxMap, id: Id, enter: boolean) {
    this.animate(map, id, 'hoverProgress', this.hoverProgress, enter);
  }

  private animate(map: MapboxMap, id: Id, key: string, store: Map<string, number>, enter: boolean) {
    const duration = 100;
    const start = performance.now();
    const from = store.get(id) ?? (enter ? 0 : 1);
    const to = enter ? 1 : 0;

    const frame = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const progress = from + (to - from) * ease(t);
      store.set(id, progress);
      map.setFeatureState({ source: SourceIds.TRIP, id }, { [key]: progress });
      if (t < 1) requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  beginWaypointDrag(map: MapboxMap, waypointId: Id): void {
    map.setFeatureState({ source: SourceIds.TRIP, id: waypointId }, { dragging: true });
    this.layers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
    this.cursor.set('dragging', true);
  }

  updateWaypointDrag(map: MapboxMap, waypointId: Id, lngLat: LngLat): void {
    const prevSegment = this.planner.findSegment((segment) => segment.end.id === waypointId);
    const nextSegment = this.planner.findSegment((segment) => segment.start.id === waypointId);
    const coordinates = [];
    if (prevSegment) coordinates.push(prevSegment.start.position);
    coordinates.push([lngLat.lng, lngLat.lat]);
    if (nextSegment) coordinates.push(nextSegment.end.position);
    this.layers.setLayerData(map, LayerIds.EDITING_LINES, {
      type: 'LineString',
      coordinates: coordinates,
    });
    this.layers.setLayerData(map, LayerIds.DRAGGING_CURSOR, {
      type: 'Point',
      coordinates: [lngLat.lng, lngLat.lat],
    });
  }

  finishWaypointDrag(map: MapboxMap, waypointId: Id, lngLat: LngLat): void {
    const newPos: Position = [lngLat.lng, lngLat.lat];
    this.planner.moveWaypoint(waypointId, newPos);

    this.cancelWaypointDrag(map, waypointId);
  }

  mergeWaypointDrag(map: MapboxMap, waypointId: Id): void {
    this.planner.deleteWaypoint(waypointId);
    this.cancelWaypointDrag(map, waypointId);
  }

  cancelWaypointDrag(map: MapboxMap, waypointId: Id): void {
    map.setFeatureState({ source: SourceIds.TRIP, id: waypointId }, { dragging: false });
    map.setFeatureState({ source: SourceIds.TRIP, id: waypointId }, { selected: false });
    this.layers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.layers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
    this.cursor.set('dragging', false);
  }

  selectWaypoint(map: MapboxMap, waypointId: Id): void {
    // deselect current selection
    const selectedWaypointId = this.selectedWaypointId();
    if (selectedWaypointId !== null) this.deselectWaypoint(map, selectedWaypointId);

    // select new waypoint
    map.setFeatureState({ source: SourceIds.TRIP, id: waypointId }, { selected: true });
    this.selectedWaypointId.set(waypointId);

    // select route & stage it belongs to
    const TRSSW = this.planner.findWaypointById(waypointId); // trip, route, stage, segment, waypoint
    if (TRSSW === null) throw new Error('waypoint not found');
    this.planner.selectStage(TRSSW.route, TRSSW.stage);
  }

  deselectWaypoint(map: MapboxMap, waypointId: Id): void {
    map.setFeatureState({ source: SourceIds.TRIP, id: waypointId }, { selected: false });
    this.selectedWaypointId.set(null);
  }

  //#region Segments

  updateSegmentHover(map: MapboxMap, lngLat: LngLat): void {
    map.setPaintProperty(LayerIds.SEGMENT_LINE, 'line-width', 10);

    this.layers.setLayerData(map, LayerIds.SEGMENT_HOVER_CURSOR, {
      type: 'Point',
      coordinates: [lngLat.lng, lngLat.lat],
    });
    map.setLayoutProperty(LayerIds.SEGMENT_HOVER_CURSOR, 'visibility', 'visible');

    const nearestPoint = this.planner.nearestPoint(lngLat);
    let dragCursorCoordinates;
    if (nearestPoint === undefined) {
      console.error('Nearest point on line not found!');
      dragCursorCoordinates = [lngLat.lng, lngLat.lat];
    } else {
      this.routeHoverIdx.set(nearestPoint.properties.segmentIndex);
      dragCursorCoordinates = nearestPoint.geometry.coordinates;
    }
    this.layers.setLayerData(map, LayerIds.SEGMENT_HOVER_CURSOR, {
      type: 'Point',
      coordinates: dragCursorCoordinates,
    });

    this.cursor.set('hovering-draggable', true);
  }

  endSegmentHover(map: MapboxMap, segmentId: Id): void {
    map.setPaintProperty(LayerIds.SEGMENT_LINE, 'line-width', 5);

    this.routeHoverIdx.set(null);
    this.layers.removeLayerData(map, LayerIds.SEGMENT_HOVER_CURSOR);

    this.cursor.set('hovering-draggable', false);
  }

  beginSegmentDrag(map: MapboxMap, segmentId: Id): void {
    map.setLayoutProperty(LayerIds.SEGMENT_HOVER_CURSOR, 'visibility', 'none');
    this.cursor.set('dragging', true);
  }

  updateSegmentDrag(map: MapboxMap, segmentId: Id, lngLat: LngLat): void {
    const TRSS = this.planner.findSegmentById(segmentId); // trip, route, stage, segment
    if (TRSS === null) return console.error('Could not find segment to update drag');
    const { segment } = TRSS;
    this.layers.setLayerData(map, LayerIds.EDITING_LINES, {
      type: 'LineString',
      coordinates: [segment.start.position, [lngLat.lng, lngLat.lat], segment.end.position],
    });
    this.layers.setLayerData(map, LayerIds.DRAGGING_CURSOR, {
      type: 'Point',
      coordinates: [lngLat.lng, lngLat.lat],
    });
  }

  finishSegmentDrag(map: MapboxMap, segmentId: Id, lngLat: LngLat): void {
    const TRSS = this.planner.findSegmentById(segmentId); // trip, route, stage, segment
    if (TRSS === null) throw new Error('Segment not found!');
    this.planner.splitSegment(TRSS.segment, [lngLat.lng, lngLat.lat]);

    this.layers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.layers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
    this.cursor.set('dragging', false);
  }

  cancelSegmentDrag(map: MapboxMap): void {
    this.layers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.layers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
    this.layers.removeLayerData(map, LayerIds.SEGMENT_HOVER_CURSOR);
    this.cursor.set('dragging', false);
  }

  selectSegment(map: MapboxMap, segmentId: Id): void {
    // select route & stage it belongs to
    const TRSS = this.planner.findSegmentById(segmentId); // trip, route, stage, segment
    if (TRSS === null) throw new Error('segment not found');
    this.planner.selectStage(TRSS.route, TRSS.stage);
  }
}
