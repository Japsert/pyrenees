import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.css']
})
export class Map implements OnInit, OnDestroy {
  @ViewChild('mapContainer', { static: true }) mapContainer!: ElementRef;
  map: any;
  private platformId = inject(PLATFORM_ID);

  async ngOnInit() {
    if (isPlatformBrowser(this.platformId)) { // SSR check to ensure this runs in the browser as GL JS requires a browser environment
      const mapboxgl = (await import('mapbox-gl')).default

      this.map = new mapboxgl.Map({
        accessToken: environment.MAPBOX_ACCESS_KEY,
        container: this.mapContainer.nativeElement,
        style: 'mapbox://styles/japsert-/cmog7wz6t000f01qwgqldfyeo',
        center: [-0.08138, 42.79418],
        zoom: 8,
        pitch: 60,
      });
    }
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
    }
  }
}
