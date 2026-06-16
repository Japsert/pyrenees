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
import { environment } from '../../environments/environment';
import {
  GeoJSONSource,
  Map as MapboxMap,
  NavigationControl,
  PaddingOptions,
  ScaleControl,
} from 'mapbox-gl';
import { MapStyle } from '../style.enum';
import { RouteControl } from '../map/route-control/route-control';
import { PlannerService } from './planner';
import { MapLayersService } from './map-layers';
import { InteractionService } from './interaction';
import { CursorService } from './cursor';
import { Route, Stage } from '../model';

export const BOTTOM_BAR_HEIGHT_PX = 128;
export const BOTTOM_BAR_PADDING_PX = 32;
export const FLY_TO_BOTTOM_PADDING: PaddingOptions = {
  bottom: BOTTOM_BAR_HEIGHT_PX + 2 * BOTTOM_BAR_PADDING_PX,
};

@Injectable({
  providedIn: 'root',
})
export class MapService {
  activeStyle = signal<MapStyle>(MapStyle.OUTDOOR);

  private readonly platformId = inject(PLATFORM_ID);
  private readonly layers = inject(MapLayersService);
  private readonly interaction = inject(InteractionService);
  private readonly planner = inject(PlannerService);
  private readonly cursor = inject(CursorService);

  private map1Container: HTMLElement | null = null;
  private map2Container: HTMLElement | null = null;
  private map1: MapboxMap | null = null;
  private map2: MapboxMap | null = null;

  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  constructor() {
    // Update rendered stage data when stage updates
    effect(() => {
      const routes = this.planner.trip().routes();
      routes.forEach((route) => this.watchRoute(route));
    });
  }

  private watchRoute(route: Route): void {
    effect(() => {
      const stages = route.stages();
      stages.forEach((stage) => this.updateStageData(stage));
    });
  }

  updateStageData(stage: Stage): void {
    this.getAllMaps().forEach((map) =>
      map.getSource<GeoJSONSource>(stage.sourceId)?.setData(stage.toGeoJson()),
    );
  }

  async initMaps(container1: HTMLElement, container2: HTMLElement): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    this.map1Container = container1;
    this.map2Container = container2;
    this.setStyle(MapStyle.OUTDOOR);

    this.map1 = this.createMap(container1, 'mapbox://styles/japsert-/cmotu1b3x007o01s67wvi4hiv');
    this.addControls(this.map1);
    this.addMapHandlers(this.map1);
    this.interaction.addPlannerHandlers(this.map1);

    this.map1.once('load', () => {
      this.layers.addAllLayers(this.map1!);
      // TODO: this.mapLayers.addStageLayer(...);

      container2.hidden = false;
      this.map2 = this.createMap(container2, 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo');
      container2.hidden = true;
      this.addControls(this.map2);
      this.addMapHandlers(this.map2);
      this.interaction.addPlannerHandlers(this.map2);

      this.map2.once('load', () => {
        this.layers.addAllLayers(this.map2!);
        // TODO: this.mapLayers.addStageLayer(...);

        this.interaction.addRoutePlannerKeyboardHandlers(() => this.getActiveMap());
      });
    });
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

  private getInactiveMap(): MapboxMap {
    if (this.map1Container?.hidden) return this.map1!;
    if (this.map2Container?.hidden) return this.map2!;
    throw new Error('No inactive map found!');
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

  switchStyle(): void {
    this.activeStyle.update((style) =>
      style === MapStyle.OUTDOOR ? MapStyle.SATELLITE : MapStyle.OUTDOOR,
    );
    this.sync();
    this.setStyle(this.activeStyle());
    this.getActiveMap().resize();
  }

  private setStyle(style: MapStyle): void {
    if (!this.map1Container || !this.map2Container)
      throw new Error('One of the maps not initialized yet!');

    this.map1Container.hidden = style === MapStyle.SATELLITE;
    this.map2Container.hidden = style === MapStyle.OUTDOOR;
  }

  private sync() {
    const source = this.getActiveMap();
    this.getInactiveMap().jumpTo({
      center: source.getCenter(),
      zoom: source.getZoom(),
      pitch: source.getPitch(),
      bearing: source.getBearing(),
    });
  }
}
