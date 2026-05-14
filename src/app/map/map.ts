import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { StyleSwitcher } from './style-switcher/style-switcher';
import { MapService } from '../map.service';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  imports: [StyleSwitcher],
})
export class Map implements OnInit, OnDestroy {
  @ViewChild('map1Container', { static: true }) map1Container!: ElementRef;
  @ViewChild('map2Container', { static: true }) map2Container!: ElementRef;

  private readonly mapService = inject(MapService);

  ngOnInit() {
    this.mapService.initMaps(
      this.map1Container.nativeElement,
      this.map2Container.nativeElement,
    );
  }

  ngOnDestroy(): void {
    this.mapService.destroyMaps();
  }
}
