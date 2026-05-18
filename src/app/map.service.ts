import {
  Injectable,
  inject,
  PLATFORM_ID,
  ApplicationRef,
  EnvironmentInjector,
  effect,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';
import {
  GeoJSONSource,
  LngLat,
  Map as MapboxMap,
  NavigationControl,
  Popup,
  ScaleControl,
} from 'mapbox-gl';
import { MapStyle } from './style.enum';
import { RouteControl } from './map/route-control/route-control';
import { RoutePlannerService } from './route-planner.service';
import { Route, Segment, SegmentProperties, WaypointProperties } from './route/route';
import { Property } from 'csstype';
import { Position } from 'geojson';
import { ease } from './math';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  activeStyle = signal<MapStyle>(MapStyle.OUTDOOR);
  isEditingRoute = signal(false);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly routePlannerService = inject(RoutePlannerService);
  private map1Container: HTMLElement | null = null;
  private map2Container: HTMLElement | null = null;
  private map1: MapboxMap | null = null;
  private map2: MapboxMap | null = null;
  private isEditingSegment: boolean = false;
  private editingSegment: Segment | null = null;
  private hoveredWaypointId: number | null = null;
  private readonly hoverProgress = new Map<number, number>();
  private readonly deleteProgress = new Map<number, number>();
  private isOverLine: boolean = false;
  private isOverWaypoint: boolean = false;
  private isShiftHeld: boolean = false;

  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  constructor() {
    effect(() => {
      // Call updateRouteData when route changes
      const route = this.routePlannerService.route();
      if (this.map1) this.updateRouteData(this.map1, route);
      if (this.map2) this.updateRouteData(this.map2, route);
    });
  }

  updateRouteData(map: MapboxMap, route: Route): void {
    this.clearHoverState(map);
    map.getSource<GeoJSONSource>('route')?.setData(route.toGeoJSON());
  }

  async initMaps(container1: HTMLElement, container2: HTMLElement): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.map1Container = container1;
    this.map2Container = container2;
    this.setStyle(MapStyle.OUTDOOR);

    this.map1 = this.createMap(container1, 'mapbox://styles/japsert-/cmotu1b3x007o01s67wvi4hiv');
    this.map1.addControl(new NavigationControl({ visualizePitch: true }));
    this.map1.addControl(new RouteControl(this.appRef, this.injector));
    this.map1.addControl(new ScaleControl(), 'bottom-right');
    this.addRoutePlannerHandlers(this.map1);

    this.map1.once('load', () => {
      this.addTrailLayers(this.map1!);
      //this.addShelterLayer(this.map1!);
      this.addRouteLayer(this.map1!);
      this.addSegmentEditingLayer(this.map1!);
      this.updateRouteData(this.map1!, this.routePlannerService.route());

      container2.hidden = false;
      this.map2 = this.createMap(container2, 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo');
      container2.hidden = true;
      this.map2.addControl(new NavigationControl({ visualizePitch: true }));
      this.map2.addControl(new RouteControl(this.appRef, this.injector));
      this.map2.addControl(new ScaleControl(), 'bottom-right');
      this.addRoutePlannerHandlers(this.map2);

      this.map2.once('load', () => {
        this.addTrailLayers(this.map2!);
        //this.addShelterLayer(this.map2!);
        this.addRouteLayer(this.map2!);
        this.addSegmentEditingLayer(this.map2!);
        this.updateRouteData(this.map2!, this.routePlannerService.route());
      });
    });
  }

  destroyMaps(): void {
    if (this.map1) {
      this.map1.remove();
      this.map1 = null;
    }
    if (this.map2) {
      this.map2.remove();
      this.map2 = null;
    }
  }

  private createMap(container: HTMLElement, style: string): MapboxMap {
    return new MapboxMap({
      accessToken: environment.MAPBOX_ACCESS_KEY,
      container,
      style,
      hash: true,
      attributionControl: false,
      logoPosition: 'bottom-right',
      pitchRotateKey: 'Meta',
      center: [0.005708026821338308, 42.68359109598495],
      zoom: 11,
      pitch: 40,
    });
  }

  switchStyle(): void {
    this.activeStyle.update((style) =>
      style == MapStyle.OUTDOOR ? MapStyle.SATELLITE : MapStyle.OUTDOOR,
    );
    this.syncIfActive(this.map1!, this.map2!);
    this.syncIfActive(this.map2!, this.map1!);
    this.setStyle(this.activeStyle());
  }

  private setStyle(style: MapStyle): void {
    if (!this.map1Container || !this.map2Container) return;
    this.map1Container.hidden = style == MapStyle.SATELLITE;
    this.map2Container.hidden = style == MapStyle.OUTDOOR;
  }

  private addTrailLayers(map: MapboxMap): void {
    map
      .addSource('gr10-tileset', {
        type: 'vector',
        url: 'mapbox://japsert-.cmolcxvbv061n1opdqvgpna20-33hp1',
      })
      .addSource('gr11-tileset', {
        type: 'vector',
        url: 'mapbox://japsert-.cmolcxw8e09v01mk0zoifowc7-4xu85',
      })
      .addLayer({
        id: 'gr10',
        type: 'line',
        source: 'gr10-tileset',
        'source-layer': 'GR10',
        paint: {
          'line-color': 'hsl(0, 100%, 50%)',
          'line-width': 3,
        },
        layout: {
          'line-join': 'round',
        },
      })
      .addLayer({
        id: 'gr11',
        type: 'line',
        source: 'gr11-tileset',
        'source-layer': 'GR11',
        paint: {
          'line-color': 'hsl(200, 100%, 50%)',
          'line-width': 3,
        },
        layout: {
          'line-join': 'round',
        },
      });
  }

  private addShelterLayer(map: MapboxMap): void {
    map
      .addSource('shelters-tileset', {
        type: 'vector',
        url: 'mapbox://japsert-.cmou6e96z02wp1mtif2jkcyz5-06exw',
      })
      .addLayer({
        id: 'shelters',
        type: 'circle',
        source: 'shelters-tileset',
        'source-layer': 'shelters',
        paint: {
          'circle-radius': 6,
          'circle-color': '#ffcc00',
          'circle-stroke-color': '#333',
          'circle-stroke-width': 1,
        },
      })
      .on('click', 'shelters', (e) => {
        const feature = e.features?.[0];
        if (!feature) return;

        const props = feature.properties;
        const coordinates = (feature.geometry as any).coordinates.slice() as [number, number];

        new Popup()
          .setLngLat(coordinates)
          .setHTML(
            `
          <strong>${props?.['name'] ?? 'Unknown'}</strong><br/>
          ${props?.['ele'] ? `Elevation: ${props['ele']}m<br/>` : ''}
          ${props?.['capacity'] ? `Capacity: ${props['capacity']}<br/>` : ''}
          ${props?.['website'] ? `<a href="${props['website']}" target="_blank">Website</a>` : ''}
        `,
          )
          .addTo(map);
      })
      .on('mouseenter', 'shelters', () => (map.getCanvas().style.cursor = 'pointer'))
      .on('mouseleave', 'shelters', () => (map.getCanvas().style.cursor = ''));
  }

  private addRouteLayer(map: MapboxMap): void {
    map
      .addSource('route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
        generateId: true,
      })
      .addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        filter: ['==', '$type', 'LineString'],
        paint: {
          'line-color': '#ff00ff',
          'line-width': 3,
        },
      })
      .addLayer({
        id: 'waypoints',
        type: 'circle',
        source: 'route',
        filter: ['==', '$type', 'Point'],
        paint: {
          'circle-radius': [
            'interpolate',
            ['linear'],
            ['coalesce', ['feature-state', 'hoverProgress'], 0],
            0,
            6,
            1,
            10,
          ],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['feature-state', 'deleteProgress'], 0],
            0,
            [
              'interpolate',
              ['linear'],
              ['coalesce', ['feature-state', 'hoverProgress'], 0],
              0,
              '#ff00ff',
              1,
              '#cc00cc',
            ],
            1,
            '#ff0000',
          ],
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      })
      .addLayer({
        id: 'waypoints-label',
        type: 'symbol',
        source: 'route',
        filter: ['==', '$type', 'Point'],
        layout: {
          'text-field': '×',
          'text-size': 43,
          'text-anchor': 'center',
        },
        paint: {
          'text-color': '#fff',
          'text-opacity': [
            'interpolate',
            ['linear'],
            ['coalesce', ['feature-state', 'deleteProgress'], 0],
            0,
            0,
            1,
            1,
          ],
        },
      });
  }

  private addSegmentEditingLayer(map: MapboxMap): void {
    map
      .addSource('segment-editing-lines', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })
      .addLayer({
        id: 'segment-editing-lines',
        type: 'line',
        source: 'segment-editing-lines',
        paint: {
          'line-color': '#ff00ff',
          'line-width': 3,
          'line-opacity': 0.5,
        },
      });
  }

  private updateEditingSegment(map: MapboxMap, newPos: LngLat): void {
    const source = map.getSource('segment-editing-lines') as GeoJSONSource | undefined;

    if (!source) return console.error("segment editing lines' source not found");
    if (!this.editingSegment) return console.error('this.editingSegment is null, somehow');

    source.setData({
      type: 'LineString',
      coordinates: [
        this.editingSegment.start.position,
        [newPos.lng, newPos.lat],
        this.editingSegment.end.position,
      ],
    });
  }

  private finishEditingSegment(map: MapboxMap, lngLat: LngLat): void {
    const source = map.getSource('segment-editing-lines') as GeoJSONSource | undefined;

    if (!source) return console.error("segment editing lines' source not found");
    if (!this.editingSegment) return console.error('this.editingSegment is null, somehow');

    const newPos: Position = [lngLat.lng, lngLat.lat];
    this.routePlannerService.splitSegment(this.editingSegment, newPos);

    this.isEditingSegment = false;
    this.editingSegment = null;
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
  }

  private cancelEditingSegment(map: MapboxMap): void {
    const source = map.getSource('segment-editing-lines') as GeoJSONSource | undefined;
    if (!source) return console.error("segment editing lines' source not found");
    this.isEditingSegment = false;
    this.editingSegment = null;
    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
  }

  private addRoutePlannerHandlers(map: MapboxMap): void {
    map
      // Adding waypoints
      .on('click', (e) => {
        if (!this.isEditingRoute()) return;
        const { lng, lat } = e.lngLat;
        this.routePlannerService.newWaypoint(lng, lat);
      })
      // Segment editing
      .on('mouseenter', 'route-line', () => {
        this.isOverLine = true;
        this.updateLineHover(map);
      })
      .on('mousedown', 'route-line', (e) => {
        e.preventDefault();
        this.isEditingSegment = true;
        const segmentIdx = (e.features!.at(0)!.properties! as SegmentProperties).idx;
        this.editingSegment = this.routePlannerService.route().segments.at(segmentIdx)!;
        this.updateEditingSegment(map, e.lngLat);
      })
      .on('mousemove', (e) => {
        if (!this.isEditingSegment) return;
        this.updateEditingSegment(map, e.lngLat);
      })
      .on('mouseup', (e) => {
        if (!this.isEditingSegment) return;
        this.finishEditingSegment(map, e.lngLat);
        this.updateLineHover(map);
      })
      .on('mouseleave', 'route-line', () => {
        this.isOverLine = false;
        if (!this.isEditingSegment) this.updateLineHover(map);
      })
      // Waypoint editing
      .on('mouseenter', 'waypoints', (e) => {
        this.isOverWaypoint = true;
        this.updateLineHover(map);

        const id = e.features!.at(0)!.id as number;
        if (id == undefined) return;
        this.hoveredWaypointId = id;

        if (!this.hoverProgress.has(id)) this.hoverProgress.set(id, 0);
        if (!this.deleteProgress.has(id)) this.deleteProgress.set(id, 0);

        this.animateHover(map, this.hoveredWaypointId, true);
        if (this.isShiftHeld) this.animateDelete(map, id, true);
      })
      .on('mouseleave', 'waypoints', () => {
        this.isOverWaypoint = false;
        this.updateLineHover(map);
        if (this.hoveredWaypointId == null) return;
        const id = this.hoveredWaypointId;
        this.animateHover(map, id, false);
        this.animateDelete(map, id, false);
        this.hoveredWaypointId = null;
      })
      .on('mousedown', 'waypoints', (e) => {
        e.preventDefault();
        if (this.hoveredWaypointId == null || !this.isShiftHeld) return;
        const waypointIdx = (e.features!.at(0)!.properties! as WaypointProperties).idx;
        this.routePlannerService.deleteWaypoint(waypointIdx);
        this.isOverWaypoint = false;
        this.hoveredWaypointId = null;
      });

    globalThis.addEventListener('keydown', (e) => {
      if (e.key == 'Shift') {
        this.isShiftHeld = true;
        if (this.hoveredWaypointId == null) return;
        this.animateDelete(map, this.hoveredWaypointId, true);
      } else if (e.key == 'Escape') {
        this.cancelEditingSegment(map);
      }
    });
    globalThis.addEventListener('keyup', (e) => {
      if (e.key != 'Shift') return;
      this.isShiftHeld = false;
      if (this.hoveredWaypointId == null) return;
      this.animateDelete(map, this.hoveredWaypointId, false);
    });
  }

  private updateLineHover(map: MapboxMap): void {
    if (this.isOverLine && !this.isOverWaypoint) {
      map.setPaintProperty('route-line', 'line-width', 6);
      this.setMapCursor('grab');
    } else {
      map.setPaintProperty('route-line', 'line-width', 3);
      if (!this.isOverWaypoint) this.setMapCursor('default');
    }
  }

  private animateHover(map: MapboxMap, id: number, enter: boolean) {
    this.animate(map, id, 'hoverProgress', this.hoverProgress, enter);
  }

  private animateDelete(map: MapboxMap, id: number, enter: boolean) {
    this.animate(map, id, 'deleteProgress', this.deleteProgress, enter);
  }

  private animate(
    map: MapboxMap,
    id: number,
    key: string,
    store: Map<number, number>,
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

  private clearHoverState(map: MapboxMap): void {
    this.hoverProgress.forEach((_, id) =>
      map.setFeatureState({ source: 'route', id }, { hoverProgress: 0, deleteProgress: 0 }),
    );
    this.hoverProgress.clear();
    this.deleteProgress.clear();
    this.hoveredWaypointId = null;
  }

  private syncIfActive(source: MapboxMap, target: MapboxMap) {
    if (source.getContainer().hidden) return;
    this.sync(source, target);
  }

  private sync(source: MapboxMap, target: MapboxMap) {
    console.debug(`Syncing ${source.getContainer().id} to ${target.getContainer().id}`);
    target.jumpTo({
      center: source.getCenter(),
      zoom: source.getZoom(),
      pitch: source.getPitch(),
      bearing: source.getBearing(),
    });
  }

  toggleEditingRoute(): void {
    this.isEditingRoute.update((bool) => !bool);
    // Change cursor while editing
    this.setMapCursor(this.isEditingRoute() ? 'crosshair' : 'grab');
  }

  private setMapCursor(style: Property.Cursor) {
    document.documentElement.style.setProperty('--map-cursor', style);
  }

  printDebugInfo(): void {
    console.debug(
      'rendered route:',
      this.map1?.queryRenderedFeatures({ layers: ['waypoints', 'waypoints-label', 'route-line'] }),
    );
    console.debug('isEditingSegment: ', this.isEditingSegment);
    console.debug('isEditingRoute: ', this.isEditingRoute());
    console.debug('editingSegment: ', this.editingSegment);
    console.debug('hoveredWaypointId: ', this.hoveredWaypointId);
    console.debug('hoverProgress: ', this.hoverProgress);
    console.debug('isShiftHeld: ', this.isShiftHeld);
  }
}
