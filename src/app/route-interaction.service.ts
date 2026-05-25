import { computed, inject, Injectable, signal } from '@angular/core';
import { Map as MapboxMap, LngLat, GeoJSONFeature } from 'mapbox-gl';
import { Segment, SegmentProperties, WaypointProperties } from './route/route';
import { Position } from 'geojson';
import { RoutePlannerService } from './route-planner.service';
import { ease } from './math';
import { MapLayersService } from './map-layers.service';
import { Property } from 'csstype';
import { LayerIds } from './layer-ids.enum';

@Injectable({
  providedIn: 'root',
})
export class RouteInteractionService {
  private readonly mapLayers = inject(MapLayersService);
  private readonly routePlanner = inject(RoutePlannerService);

  //#region State

  isAddingWaypoints = signal<boolean>(false);

  readonly draggedSegment = signal<Segment | null>(null);
  readonly isDraggingSegment = computed(() => this.draggedSegment() != null);
  readonly selectedWaypointId = signal<string | null>(null);
  readonly hasSelectedWaypoint = computed(() => this.selectedWaypointId() != null);
  readonly mayDragWaypointId = signal<string | null>(null);
  readonly mayDragWaypoint = computed(() => this.mayDragWaypointId() != null);
  readonly draggedWaypointId = signal<string | null>(null);
  readonly isDraggingWaypoint = computed(() => this.draggedWaypointId() != null);
  readonly hoveredWaypointId = signal<string | null>(null);
  readonly isHoveringWaypoint = computed(() => this.hoveredWaypointId() != null);

  readonly hoverProgress = new Map<string, number>();
  readonly isOverLine = signal<boolean>(false);
  readonly isOverWaypoint = signal<boolean>(false);

  //#endregion
  //#region Public API

  /**
   * Adds all mouse movement handlers related to waypoint/segment editing to the map.
   *
   * The state machine for waypoint editing is as follows:
   * -> mouseenter (hover)
   *   -> mouseleave (stop hover)
   *   -> mousedown (select, potential drag)
   *     -> mouseup (cancel potential drag)
   *     -> mouseleave (start drag)
   *       -> mousemove (update drag)
   *         -> mousemove (update drag)
   *         -> mouseup (stop drag)
   *       -> mouseup (stop drag)
   */
  addRoutePlannerHandlers(map: MapboxMap): void {
    map
      .on('click', (e) => {
        // on click: if adding wps, add wp, deselect wp unless clicking an existing waypoint
        const clickedWaypoint =
          map.queryRenderedFeatures(e.point, { layers: [LayerIds.WAYPOINTS] }).at(0) ?? null;
        if (this.isAddingWaypoints()) {
          let newPos: Position;
          if (clickedWaypoint) {
            const id = (clickedWaypoint.properties as WaypointProperties).id;
            newPos = this.routePlanner.findWaypoint(id)!.position;
          } else {
            newPos = [e.lngLat.lng, e.lngLat.lat];
          }
          this.routePlanner.newWaypoint(newPos);
        }
        if (clickedWaypoint == null) {
          map.setFeatureState(
            { source: 'route', id: this.selectedWaypointId()! },
            { selected: false },
          );
          this.selectedWaypointId.set(null);
        }
      })
      .on('mouseenter', LayerIds.WAYPOINTS, (e) => {
        // if not dragging route, make wp bigger, remember that we're hovering wp
        if (this.isDraggingSegment()) return;
        const waypointId = (e.features?.at(0)?.properties as WaypointProperties).id;
        this.hoveredWaypointId.set(waypointId);
        this.isOverWaypoint.set(true);
        this.updateLineHover(map);
        if (!this.hoverProgress.has(waypointId)) this.hoverProgress.set(waypointId, 0);
        this.animateHover(map, waypointId, true);
      })
      .on('mouseleave', LayerIds.WAYPOINTS, (e) => {
        // if not dragging route, return to original size, reset hovering wp, if potential wp drag, start dragging wp (make half transparent and render marker at cursor)
        if (this.isDraggingSegment()) return;
        if (this.mayDragWaypoint())
          this.beginDraggingWaypoint(map, this.mayDragWaypointId()!, e.lngLat);
        this.mayDragWaypointId.set(null);
        this.isOverWaypoint.set(false);
        this.updateLineHover(map);
        if (!this.isHoveringWaypoint()) return;
        this.animateHover(map, this.hoveredWaypointId()!, false);
        this.hoveredWaypointId.set(null);
      })
      .on('mousedown', LayerIds.WAYPOINTS, (e) => {
        // select (make darker), potential wp drag
        e.preventDefault();
        if (!this.isHoveringWaypoint()) return console.warn('Selecting a non-hovered waypoint?');
        if (this.hasSelectedWaypoint())
          map.setFeatureState(
            { source: 'route', id: this.selectedWaypointId()! },
            { selected: false },
          );
        this.selectedWaypointId.set(this.hoveredWaypointId()!);
        map.setFeatureState(
          { source: 'route', id: this.selectedWaypointId()! },
          { selected: true },
        );
        this.mayDragWaypointId.set(this.hoveredWaypointId()!);
      })
      // Mousemove handler combined with route's below
      .on('mouseup', LayerIds.WAYPOINTS, (e) => {
        // if not dragging route, if same waypoint, cancel (potential) wp drag
        if (this.isDraggingSegment()) return;
        const waypointId = (e.features?.at(0)?.properties as WaypointProperties).id;
        this.mayDragWaypointId.set(null);
        if (this.isDraggingWaypoint() && this.draggedWaypointId() == waypointId)
          this.cancelDraggingWaypoint(map);
      })
      // Mouseup handler combined with route's below
      .on('mouseenter', LayerIds.ROUTE_LINE_HITBOX, (e) => {
        // if not dragging wp, if not hovering wp, make bigger, render transparent marker at cursor
        if (this.isDraggingWaypoint()) return;
        this.isOverLine.set(true);
        this.updateLineHover(map);
        this.mapLayers.setLayerData(map, LayerIds.ROUTE_HOVER_CURSOR, {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat],
        });
      })
      .on('mouseleave', LayerIds.ROUTE_LINE_HITBOX, () => {
        // if not dragging wp, if not hovering wp, make smaller, stop rendering transparent marker
        if (this.isDraggingWaypoint()) return;
        this.isOverLine.set(false);
        this.updateLineHover(map);
        this.mapLayers.removeLayerData(map, LayerIds.ROUTE_HOVER_CURSOR);
      })
      .on('mousedown', LayerIds.ROUTE_LINE_HITBOX, (e) => {
        // if not hovering wp, start dragging route, make transparent marker opaque
        if (this.isHoveringWaypoint()) return;
        e.preventDefault();
        this.beginDraggingSegment(map, e.features!, e.lngLat);
      })
      .on('mousemove', LayerIds.ROUTE_LINE_HITBOX, (e) => {
        if (this.isDraggingWaypoint()) return;
        this.isOverLine.set(true);
        this.updateLineHover(map);
        this.mapLayers.setLayerData(map, LayerIds.ROUTE_HOVER_CURSOR, {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat],
        });
      })
      .on('mousemove', (e) => {
        if (this.isDraggingWaypoint()) this.updateDraggingWaypoint(map, e.lngLat);
        if (this.isDraggingSegment()) this.updateDraggingSegment(map, e.lngLat);
      })
      .on('mouseup', (e) => {
        let draggingWaypointId: string | null = null;
        if (this.isDraggingWaypoint()) {
          draggingWaypointId = this.draggedWaypointId();
          this.finishDraggingWaypoint(map, e.lngLat);
        }
        if (this.isDraggingSegment()) this.finishDraggingSegment(map, e.lngLat);
        this.updateLineHover(map);
        this.mapLayers.setLayerData(map, LayerIds.ROUTE_HOVER_CURSOR, {
          type: 'Point',
          coordinates: [e.lngLat.lng, e.lngLat.lat],
        });

        // Re-evaluate hover state
        if (draggingWaypointId) {
          this.hoveredWaypointId.set(draggingWaypointId);
          this.isOverWaypoint.set(true);
          this.updateLineHover(map);
          this.hoverProgress.set(draggingWaypointId, 1);
          map.setFeatureState({ source: 'route', id: draggingWaypointId }, { hoverProgress: 1 });
        }
      });
  }

  addRoutePlannerKeyboardHandlers(getActiveMap: () => MapboxMap | null): void {
    globalThis.addEventListener('keydown', (e) => {
      const activeMap = getActiveMap();
      if (!activeMap) return;
      if (e.key == 'Backspace') {
        if (!this.hasSelectedWaypoint()) return;
        this.deleteWaypoint(this.selectedWaypointId()!);
      } else if (e.key == 'Escape') {
        if (this.isDraggingSegment()) this.cancelDraggingSegment(activeMap);
        if (this.isDraggingWaypoint()) this.cancelDraggingWaypoint(activeMap);
      } else if (e.key == 'e') {
        this.toggleAddingWaypoints();
      }
    });
  }

  toggleAddingWaypoints(): void {
    this.isAddingWaypoints.update((bool) => !bool);
    // Change cursor while editing
    this.setMapCursor(this.isAddingWaypoints() ? 'crosshair' : 'auto');
  }

  private setMapCursor(style: Property.Cursor) {
    document.documentElement.style.setProperty('--map-cursor', style);
  }

  //#endregion
  //#region Waypoint hover

  private animateHover(map: MapboxMap, id: string, enter: boolean) {
    this.animate(map, id, 'hoverProgress', this.hoverProgress, enter);
  }

  private animate(
    map: MapboxMap,
    id: string,
    key: string,
    store: Map<string, number>,
    enter: boolean,
  ) {
    const duration = 100;
    const start = performance.now();
    const from = store.get(id) ?? (enter ? 0 : 1);
    const to = enter ? 1 : 0;

    const frame = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const progress = from + (to - from) * ease(t);
      store.set(id, progress);
      map.setFeatureState({ source: 'route', id }, { [key]: progress });
      if (t < 1) requestAnimationFrame(frame);
    };

    requestAnimationFrame(frame);
  }

  //#endregion
  //#region Segment hover

  private updateLineHover(map: MapboxMap): void {
    if (this.isOverLine() && !this.isOverWaypoint() && !this.isDraggingWaypoint()) {
      map.setPaintProperty(LayerIds.ROUTE_LINE, 'line-width', 6);
      if (map.getLayer(LayerIds.ROUTE_HOVER_CURSOR) && !this.isDraggingSegment())
        map.setLayoutProperty(LayerIds.ROUTE_HOVER_CURSOR, 'visibility', 'visible');
    } else if (!this.isDraggingSegment()) {
      map.setPaintProperty(LayerIds.ROUTE_LINE, 'line-width', 3);
      if (map.getLayer(LayerIds.ROUTE_HOVER_CURSOR))
        map.setLayoutProperty(LayerIds.ROUTE_HOVER_CURSOR, 'visibility', 'none');
    }
  }

  //#endregion
  //#region Waypoint drag

  private beginDraggingWaypoint(map: MapboxMap, id: string, newPos: LngLat): void {
    map.setFeatureState({ source: 'route', id: this.draggedWaypointId()! }, { dragging: true });
    this.draggedWaypointId.set(id);
    this.updateDraggingWaypoint(map, newPos);
    this.mapLayers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
  }

  private updateDraggingWaypoint(map: MapboxMap, newPos: LngLat): void {
    if (!this.isDraggingWaypoint()) return console.error('No waypoint is being dragged');
    const prevSegment = this.routePlanner.findSegment(
      (segment) => segment.end.id == this.draggedWaypointId(),
    );
    const nextSegment = this.routePlanner.findSegment(
      (segment) => segment.start.id == this.draggedWaypointId(),
    );
    const coordinates = [];
    if (prevSegment) coordinates.push(prevSegment.start.position);
    const { lng, lat } = newPos;
    coordinates.push([lng, lat]);
    if (nextSegment) coordinates.push(nextSegment.end.position);
    this.mapLayers.setLayerData(map, LayerIds.EDITING_LINES, {
      type: 'LineString',
      coordinates: coordinates,
    });
    this.mapLayers.setLayerData(map, LayerIds.DRAGGING_CURSOR, {
      type: 'Point',
      coordinates: [lng, lat],
    });
  }

  private finishDraggingWaypoint(map: MapboxMap, lngLat: LngLat): void {
    if (!this.isDraggingWaypoint())
      return console.error('finishDraggingWaypoint called but no waypoint is being dragged');

    const newPos: Position = [lngLat.lng, lngLat.lat];
    this.routePlanner.moveWaypoint(this.draggedWaypointId()!, newPos);

    map.setFeatureState({ source: 'route', id: this.draggedWaypointId()! }, { dragging: false });
    map.setFeatureState({ source: 'route', id: this.draggedWaypointId()! }, { selected: false });
    this.draggedWaypointId.set(null);
    this.selectedWaypointId.set(null);
    this.mapLayers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.mapLayers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
  }

  private cancelDraggingWaypoint(map: MapboxMap): void {
    map.setFeatureState({ source: 'route', id: this.draggedWaypointId()! }, { dragging: false });
    map.setFeatureState({ source: 'route', id: this.draggedWaypointId()! }, { selected: false });
    this.draggedWaypointId.set(null);
    this.selectedWaypointId.set(null);
    this.mapLayers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.mapLayers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
  }

  private deleteWaypoint(id: string): void {
    this.routePlanner.deleteWaypoint(id);
    this.isOverWaypoint.set(false);
    this.hoveredWaypointId.set(null);
    this.selectedWaypointId.set(null);
  }

  //#endregion
  //#region Segment drag

  private beginDraggingSegment(
    map: MapboxMap,
    features: Array<GeoJSONFeature>,
    newPos: LngLat,
  ): void {
    const segmentId = (features.at(0)!.properties! as SegmentProperties).id;
    const segment = this.routePlanner.route().segments.find((s) => s.id == segmentId);
    if (!segment) return console.error('Could not find segment for dragging');
    this.draggedSegment.set(segment);
    this.updateDraggingSegment(map, newPos);
    map.setLayoutProperty(LayerIds.ROUTE_HOVER_CURSOR, 'visibility', 'none');
  }

  private updateDraggingSegment(map: MapboxMap, newPos: LngLat): void {
    if (!this.draggedSegment()) return console.error('No segment is being dragged');
    this.mapLayers.setLayerData(map, LayerIds.EDITING_LINES, {
      type: 'LineString',
      coordinates: [
        this.draggedSegment()!.start.position,
        [newPos.lng, newPos.lat],
        this.draggedSegment()!.end.position,
      ],
    });
    this.mapLayers.setLayerData(map, LayerIds.DRAGGING_CURSOR, {
      type: 'Point',
      coordinates: [newPos.lng, newPos.lat],
    });
  }

  private finishDraggingSegment(map: MapboxMap, lngLat: LngLat): void {
    if (!this.draggedSegment()) return console.error('No segment is being dragged');

    const newPos: Position = [lngLat.lng, lngLat.lat];
    this.routePlanner.splitSegment(this.draggedSegment()!, newPos);

    this.draggedSegment.set(null);
    this.mapLayers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.mapLayers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
  }

  private cancelDraggingSegment(map: MapboxMap): void {
    this.draggedSegment.set(null);
    this.mapLayers.removeLayerData(map, LayerIds.EDITING_LINES);
    this.mapLayers.removeLayerData(map, LayerIds.DRAGGING_CURSOR);
    this.mapLayers.removeLayerData(map, LayerIds.ROUTE_HOVER_CURSOR);
  }

  //#endregion
}
