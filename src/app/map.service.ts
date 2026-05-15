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
import { GeoJSONSource, LngLat, Map, NavigationControl, Popup } from 'mapbox-gl';
import { MapStyle } from './style.enum';
import { RouteControl } from './map/route-control/route-control';
import { RoutePlannerService } from './route-planner.service';
import { Route, Segment, SegmentProperties } from './route/route';
import { Property } from 'csstype';
import { Position } from 'geojson';

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
  private map1: Map | null = null;
  private map2: Map | null = null;
  private isEditingSegment: boolean = false;
  private editingSegment: Segment | null = null;

  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  constructor() {
    effect(() => {
      const route = this.routePlannerService.route();
      if (this.map1) this.updateRouteData(this.map1, route);
      if (this.map2) this.updateRouteData(this.map2, route);
    });
  }

  updateRouteData(map: Map, route: Route): void {
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
    this.addRoutePlannerHandlers(this.map1);

    this.map1.once('load', () => {
      this.addTrailLayers(this.map1!);
      //this.addShelterLayer(this.map1!);
      this.addRouteLayer(this.map1!);
      this.updateRouteData(this.map1!, this.routePlannerService.route());

      container2.hidden = false;
      this.map2 = this.createMap(container2, 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo');
      container2.hidden = true;
      this.map2.addControl(new NavigationControl({ visualizePitch: true }));
      this.map2.addControl(new RouteControl(this.appRef, this.injector));
      this.addRoutePlannerHandlers(this.map2);

      this.map2.once('load', () => {
        this.addTrailLayers(this.map2!);
        //this.addShelterLayer(this.map2!);
        this.addRouteLayer(this.map2!);
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

  private createMap(container: HTMLElement, style: string): Map {
    return new Map({
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

  private addTrailLayers(map: Map): void {
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

  private addShelterLayer(map: Map): void {
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

  private addRouteLayer(map: Map): void {
    map
      .addSource('route', {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
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
          'circle-radius': 6,
          'circle-color': '#ff00ff',
          'circle-stroke-color': '#fff',
          'circle-stroke-width': 2,
        },
      })
      // TODO: move to separate function. wtf is this one becoming
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
        },
      })
      .on('mouseenter', 'route-line', () => {
        map.setPaintProperty('route-line', 'line-width', 6);
        this.setMapCursor('grab');
      })
      .on('mousedown', 'route-line', (e) => {
        console.debug('starting to edit segment');
        e.preventDefault();
        this.isEditingSegment = true;
        const segmentIdx = (e.features!.at(0)!.properties! as SegmentProperties).idx;
        this.editingSegment = this.routePlannerService.route().segments.at(segmentIdx)!;
        this.updateEditingSegment(map, e.lngLat);
      })
      .on('mousemove', (e) => {
        if (!this.isEditingSegment) return;
        console.debug('mouse moved while editing segment');
        this.updateEditingSegment(map, e.lngLat);
      })
      .on('mouseup', (e) => {
        if (!this.isEditingSegment) return;
        console.debug('finishing editing segment');
        this.finishEditingSegment(map, e.lngLat);
        this.isEditingSegment = false;
        this.editingSegment = null;
        map.setPaintProperty('route-line', 'line-width', 3);
      })
      .on('mouseleave', 'route-line', () => {
        if (!this.isEditingSegment) map.setPaintProperty('route-line', 'line-width', 3);
      });
  }

  private updateEditingSegment(map: Map, newPos: LngLat): void {
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

  private finishEditingSegment(map: Map, lngLat: LngLat): void {
    const source = map.getSource('segment-editing-lines') as GeoJSONSource | undefined;

    if (!source) return console.error("segment editing lines' source not found");
    if (!this.editingSegment) return console.error('this.editingSegment is null, somehow');

    const newPos: Position = [lngLat.lng, lngLat.lat];
    this.routePlannerService.splitSegment(this.editingSegment, newPos);

    source.setData({
      type: 'FeatureCollection',
      features: [],
    });
  }

  private addRoutePlannerHandlers(map: Map): void {
    map.on('click', (e) => {
      console.debug(`Clicked at ${e.lngLat}`);
      if (!this.isEditingRoute) return;

      const { lng, lat } = e.lngLat;
      this.routePlannerService.newWaypoint(lng, lat);
    });
  }

  private syncIfActive(source: Map, target: Map) {
    if (source.getContainer().hidden) return;
    this.sync(source, target);
  }

  private sync(source: Map, target: Map) {
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
}
