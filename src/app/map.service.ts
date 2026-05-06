import { Injectable, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { environment } from '../environments/environment';
import { Map, NavigationControl } from 'mapbox-gl';
import { Style } from './style.enum';

@Injectable({
  providedIn: 'root',
})
export class MapService {
  private platformId = inject(PLATFORM_ID);
  activeStyle: Style = Style.OUTDOOR;
  map1Container: HTMLElement | null = null;
  map2Container: HTMLElement | null = null;
  fadeContainer: HTMLElement | null = null;
  map1: Map | null = null;
  map2: Map | null = null;
  doFade: boolean = false;

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

    console.log('Adding map 1...');
    this.map1 = this.createMap(container1, 'mapbox://styles/japsert-/cmotu1b3x007o01s67wvi4hiv');
    this.map1.addControl(new NavigationControl({ visualizePitch: true }));

    this.map1.once('load', () => {
      console.debug('Load fired');
      this.addRouteLayers(this.map1!);
      console.log('Map 1 done!');

      console.log('Adding map 2...');
      container2.hidden = false;
      this.map2 = this.createMap(container2, 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo');
      container2.hidden = true;
      this.map2.addControl(new NavigationControl({ visualizePitch: true }));

      this.map2.once('load', () => {
        this.addRouteLayers(this.map2!);
        console.log('Map 2 done!');
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
      center: [-0.08138, 42.79418],
      zoom: 8,
      pitch: 60,
    });
  }

  switchStyle(): void {
    if (this.doFade)
      this.fadeContainer!.classList.add('fade-in');

    setTimeout(() => {
      this.activeStyle = this.activeStyle == Style.OUTDOOR ? Style.SATELLITE : Style.OUTDOOR;
      this.syncIfActive(this.map1!, this.map2!);
      this.syncIfActive(this.map2!, this.map1!);
      this.setStyle(this.activeStyle);

      this.fadeContainer!.classList.remove('fade-in');
    }, this.doFade ? 300 : 0);
  }

  private setStyle(style: Style): void {
    if (!this.map1Container || !this.map2Container) return;
    this.map1Container.hidden = style == Style.SATELLITE;
    this.map2Container.hidden = style == Style.OUTDOOR;
  }

  private addRouteLayers(map: Map) {
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
}
