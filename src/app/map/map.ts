import { Component, ElementRef, OnDestroy, OnInit, inject, viewChild } from '@angular/core';
import { MapService } from '../services/map';

@Component({
  selector: 'app-map',
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
})
export class Map implements OnInit, OnDestroy {
  private readonly map1Container = viewChild.required<ElementRef>('map1Container');
  private readonly map2Container = viewChild.required<ElementRef>('map2Container');

  private readonly mapService = inject(MapService);

  ngOnInit() {
    this.mapService.initMaps(
      this.map1Container().nativeElement,
      this.map2Container().nativeElement,
    );
  }

  ngOnDestroy(): void {
    this.mapService.destroyMaps();
  }
}
