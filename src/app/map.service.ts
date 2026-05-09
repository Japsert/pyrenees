import {
  Injectable,
  inject,
  PLATFORM_ID,
  ApplicationRef,
  EnvironmentInjector,
  effect,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';
import { GeoJSONSource, Map, NavigationControl, Popup } from 'mapbox-gl';
import { Style } from './style.enum';
import { RouteControl } from './map/route-control/route-control';
import { RoutePlannerService } from './route-planner.service';
import { Route, Waypoint } from './route/route';
import { Property } from 'csstype';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  activeStyle: Style = Style.OUTDOOR;
  private platformId = inject(PLATFORM_ID);
  private routePlannerService = inject(RoutePlannerService);
  private map1Container: HTMLElement | null = null;
  private map2Container: HTMLElement | null = null;
  private fadeContainer: HTMLElement | null = null;
  private map1: Map | null = null;
  private map2: Map | null = null;
  private doFade: boolean = false;
  private isEditingRoute: boolean = false;

  private appRef = inject(ApplicationRef);
  private injector = inject(EnvironmentInjector);

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

  async initMaps(
    container1: HTMLElement,
    container2: HTMLElement,
    fadeContainer: HTMLElement,
  ): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.map1Container = container1;
    this.map2Container = container2;
    this.fadeContainer = fadeContainer;
    this.setStyle(Style.OUTDOOR);

    console.debug('Adding map 1...');
    this.map1 = this.createMap(container1, 'mapbox://styles/japsert-/cmotu1b3x007o01s67wvi4hiv');
    this.map1.addControl(new NavigationControl({ visualizePitch: true }));
    this.map1.addControl(new RouteControl(this.appRef, this.injector));
    this.addRoutePlannerHandlers(this.map1);

    this.map1.once('load', () => {
      this.addTrailLayers(this.map1!);
      //this.addShelterLayer(this.map1!);
      this.addRouteLayer(this.map1!);
      this.updateRouteData(this.map1!, this.routePlannerService.route());
      console.debug('Map 1 done!');

      console.debug('Adding map 2...');
      container2.hidden = false;
      this.map2 = this.createMap(container2, 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo');
      container2.hidden = true;
      this.map2.addControl(new NavigationControl({ visualizePitch: true }));

      this.map2.once('load', () => {
        this.addTrailLayers(this.map2!);
        //this.addShelterLayer(this.map2!);
        this.addRouteLayer(this.map2!);
        this.updateRouteData(this.map2!, this.routePlannerService.route());
        console.debug('Map 2 done!');
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
    if (this.doFade) this.fadeContainer!.classList.add('fade-in');

    setTimeout(
      () => {
        this.activeStyle = this.activeStyle == Style.OUTDOOR ? Style.SATELLITE : Style.OUTDOOR;
        this.syncIfActive(this.map1!, this.map2!);
        this.syncIfActive(this.map2!, this.map1!);
        this.setStyle(this.activeStyle);

        this.fadeContainer!.classList.remove('fade-in');
      },
      this.doFade ? 300 : 0,
    );
  }

  private setStyle(style: Style): void {
    if (!this.map1Container || !this.map2Container) return;
    this.map1Container.hidden = style == Style.SATELLITE;
    this.map2Container.hidden = style == Style.OUTDOOR;
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
      .on('mouseenter', 'route-line', () => {
        map.setPaintProperty('route-line', 'line-width', 6);
        this.setMapCursor('grab');
      })
      .on('mouseleave', 'route-line', () => map.setPaintProperty('route-line', 'line-width', 3));
  }

  private addRoutePlannerHandlers(map: Map) {
    map.on('click', (e) => {
      console.debug(`Clicked at ${e.lngLat}`);
      if (!this.isEditingRoute) return;

      const { lng, lat } = e.lngLat;
      this.routePlannerService.appendWaypoint(new Waypoint([lng, lat]));
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
    this.isEditingRoute = !this.isEditingRoute;
    // Change cursor while editing
    this.setMapCursor(this.isEditingRoute ? 'crosshair' : 'grab');
  }

  private setMapCursor(style: Property.Cursor) {
    document.documentElement.style.setProperty('--map-cursor', style);
  }
}
