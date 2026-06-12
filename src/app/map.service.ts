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
  Map as MapboxMap,
  NavigationControl,
  PaddingOptions,
  ScaleControl,
} from 'mapbox-gl';
import { MapStyle } from './style.enum';
import { RouteControl } from './map/route-control/route-control';
import { RouteService } from './route.service';
import { Route } from './route/route';
import { MapLayersService } from './map-layers.service';
import { RouteInteractionService } from './route-interaction.service';
import { FlyoverService } from './flyover.service';
import { CursorService } from './cursor.service';

export const BOTTOM_BAR_HEIGHT_PX = 128;
export const BOTTOM_BAR_PADDING_PX = 32;
export const FLY_TO_BOTTOM_PADDING: PaddingOptions = {
  bottom: BOTTOM_BAR_HEIGHT_PX + 2 * BOTTOM_BAR_PADDING_PX,
};

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private readonly cursor = inject(CursorService);

  activeStyle = signal<MapStyle>(MapStyle.OUTDOOR);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly mapLayers = inject(MapLayersService);
  private readonly routeInteraction = inject(RouteInteractionService);
  private readonly routePlanner = inject(RouteService);

  private map1Container: HTMLElement | null = null;
  private map2Container: HTMLElement | null = null;
  private map1: MapboxMap | null = null;
  private map2: MapboxMap | null = null;

  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  constructor() {
    effect(() => {
      // Call updateRouteData when route changes
      const route = this.routePlanner.route();
      if (this.map1) this.updateRouteData(this.map1, route);
      if (this.map2) this.updateRouteData(this.map2, route);
    });
  }

  updateRouteData(map: MapboxMap, route: Route): void {
    map.getSource<GeoJSONSource>('route')?.setData(route.toGeoJSON());
  }

  async initMaps(container1: HTMLElement, container2: HTMLElement): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.map1Container = container1;
    this.map2Container = container2;
    this.setStyle(MapStyle.OUTDOOR);

    this.map1 = this.createMap(container1, 'mapbox://styles/japsert-/cmotu1b3x007o01s67wvi4hiv');
    this.addControls(this.map1);
    this.addMapHandlers(this.map1);
    this.routeInteraction.addRoutePlannerHandlers(this.map1);

    this.map1.once('load', () => {
      this.mapLayers.addAllLayers(this.map1!);
      this.updateRouteData(this.map1!, this.routePlanner.route());

      container2.hidden = false;
      this.map2 = this.createMap(container2, 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo');
      container2.hidden = true;
      this.addControls(this.map2);
      this.addMapHandlers(this.map2);
      this.routeInteraction.addRoutePlannerHandlers(this.map2);

      this.map2.once('load', () => {
        this.mapLayers.addAllLayers(this.map2!);
        this.updateRouteData(this.map2!, this.routePlanner.route());

        this.routeInteraction.addRoutePlannerKeyboardHandlers(() => this.getActiveMap());
      });
    });
  }

  private addControls(map: MapboxMap): void {
    map.addControl(new NavigationControl({ visualizePitch: true }));
    map.addControl(new RouteControl(this.appRef, this.injector));
    map.addControl(new ScaleControl(), 'top-left');
  }

  private addMapHandlers(map: MapboxMap): void {
    map.on('mousedown', () => this.cursor.set('dragging', true));
    map.on('mouseup', () => this.cursor.set('dragging', false));
  }

  getAllMaps(): MapboxMap[] {
    if (this.map1 === null || this.map2 === null)
      throw new Error('One of the maps is uninitialized!');
    return [this.map1, this.map2];
  }

  getActiveMap(): MapboxMap {
    if (!this.map1Container?.hidden) return this.map1!;
    if (!this.map2Container?.hidden) return this.map2!;
    throw new Error('No active map found!');
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
      logoPosition: 'top-right',
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
    this.getActiveMap().resize();
  }

  private setStyle(style: MapStyle): void {
  if (!this.map1Container || !this.map2Container)
    throw new Error('One of the maps not initialized yet!');

  this.map1Container.hidden = style == MapStyle.SATELLITE;
  this.map2Container.hidden = style == MapStyle.OUTDOOR;
}

  private syncIfActive(source: MapboxMap, target: MapboxMap) {
    if (source.getContainer().hidden) return;
    this.sync(source, target);
  }

  private sync(source: MapboxMap, target: MapboxMap) {
    target.jumpTo({
      center: source.getCenter(),
      zoom: source.getZoom(),
      pitch: source.getPitch(),
      bearing: source.getBearing(),
    });
  }
}
