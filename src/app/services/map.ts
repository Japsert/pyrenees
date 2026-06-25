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
import { MapLayersService } from './layers';
import { InteractionService } from './interaction';
import { CursorService } from './cursor';
import { Trip } from '../model';
import { SourceIds } from '../ids.enum';
import { getGlobalStyleAsNumber } from '../util';

const BOTTOM_BAR_HEIGHT_PX = getGlobalStyleAsNumber('--bottom-bar-height');
const BOTTOM_BAR_MARGIN_PX = getGlobalStyleAsNumber('--bottom-bar-margin');
export const FLY_TO_BOTTOM_PADDING: PaddingOptions = {
  bottom: BOTTOM_BAR_HEIGHT_PX + 2 * BOTTOM_BAR_MARGIN_PX,
};
const STYLE_SWITCH_TRANSITION_DURATION_MS = getGlobalStyleAsNumber(
  '--style-switch-transition-duration',
);

@Injectable({
  providedIn: 'root',
})
export class MapService {
  activeStyle = signal<MapStyle>(MapStyle.OUTDOOR);

  private static readonly OUTDOOR_STYLE_URL = 'mapbox://styles/japsert-/cmotu1b3x007o01s67wvi4hiv';
  private static readonly SATELLITE_STYLE_URL =
    'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo';

  private readonly platformId = inject(PLATFORM_ID);
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  private readonly layers = inject(MapLayersService);
  private readonly interaction = inject(InteractionService);
  private readonly planner = inject(PlannerService);
  private readonly cursor = inject(CursorService);

  private readonly outdoorMap = signal<MapboxMap | null>(null);
  private readonly satelliteMap = signal<MapboxMap | null>(null);

  constructor() {
    effect(() => {
      const outdoorMap = this.outdoorMap();
      const satelliteMap = this.satelliteMap();
      const trip = this.planner.trip();
      //console.debug('either map, or trip updated. redrawing trip');
      if (outdoorMap !== null) this.redrawTrip(outdoorMap, trip);
      if (satelliteMap !== null) this.redrawTrip(satelliteMap, trip);
    });
  }

  private redrawTrip(map: MapboxMap, trip: Trip): void {
    map.getSource<GeoJSONSource>(SourceIds.TRIP)?.setData(trip.toGeoJson());
  }

  initMaps(outdoorContainer: HTMLElement, satelliteContainer: HTMLElement): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const outdoorMap = this.createMap(outdoorContainer, MapService.OUTDOOR_STYLE_URL);
    this.addControls(outdoorMap);
    this.addMapHandlers(outdoorMap);
    this.interaction.addPlannerHandlers(outdoorMap);

    console.debug(BOTTOM_BAR_HEIGHT_PX, BOTTOM_BAR_MARGIN_PX, STYLE_SWITCH_TRANSITION_DURATION_MS);

    outdoorMap.on('error', (e) => console.error('outdoor map error:', e.error));

    outdoorMap.once('load', () => {
      this.layers.addAllLayers(outdoorMap);
      this.outdoorMap.set(outdoorMap);

      satelliteContainer.hidden = false;
      const satelliteMap = this.createMap(satelliteContainer, MapService.SATELLITE_STYLE_URL);
      satelliteContainer.hidden = true;
      this.addControls(satelliteMap);
      this.addMapHandlers(satelliteMap);
      this.interaction.addPlannerHandlers(satelliteMap);

      satelliteMap.once('load', () => {
        this.layers.addAllLayers(satelliteMap);
        this.satelliteMap.set(satelliteMap);
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
    globalThis.addEventListener('mouseup', () => this.cursor.set('dragging', false));
  }

  getAllMaps(): MapboxMap[] {
    const outdoorMap = this.outdoorMap();
    const satelliteMap = this.satelliteMap();
    if (outdoorMap === null || satelliteMap === null)
      throw new Error('One of the maps is uninitialized!');
    return [outdoorMap, satelliteMap];
  }

  getActiveMap(): MapboxMap {
    if (!this.outdoorMap()?.getContainer().hidden) return this.outdoorMap()!;
    if (!this.satelliteMap()?.getContainer().hidden) return this.satelliteMap()!;
    throw new Error('No active map found!');
  }

  private getInactiveMap(): MapboxMap {
    if (this.outdoorMap()?.getContainer().hidden) return this.outdoorMap()!;
    if (this.satelliteMap()?.getContainer().hidden) return this.satelliteMap()!;
    throw new Error('No inactive map found!');
  }

  destroyMaps(): void {
    if (this.outdoorMap()) {
      this.outdoorMap()?.remove();
      this.outdoorMap.set(null);
    }
    if (this.satelliteMap()) {
      this.satelliteMap()?.remove();
      this.satelliteMap.set(null);
    }
  }

  switchStyle(): void {
    this.activeStyle.update((style) =>
      style === MapStyle.OUTDOOR ? MapStyle.SATELLITE : MapStyle.OUTDOOR,
    );
    this.sync();
    const activeMap = this.getActiveMap();
    const inactiveMap = this.getInactiveMap();
    activeMap.getContainer().style.zIndex = '0';
    inactiveMap.getContainer().style.zIndex = '-10';
    inactiveMap.getContainer().hidden = false;
    inactiveMap.resize();
    inactiveMap.getContainer().style.opacity = '1';
    activeMap.getContainer().style.opacity = '0';
    setTimeout(() => {
      activeMap.getContainer().hidden = true;
      activeMap.getContainer().style.zIndex = '-10';
      inactiveMap.getContainer().style.zIndex = '0';
    }, STYLE_SWITCH_TRANSITION_DURATION_MS);
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
