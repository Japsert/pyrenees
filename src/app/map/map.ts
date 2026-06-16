import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
} from '@angular/core';
import { MapService } from '../services/map';
import { BottomBar } from "./bottom-bar/bottom-bar";

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  imports: [BottomBar],
})
export class Map implements OnInit, OnDestroy {
  @ViewChild('map1Container', { static: true }) private readonly map1Container!: ElementRef;
  @ViewChild('map2Container', { static: true }) private readonly map2Container!: ElementRef;

  private readonly mapService = inject(MapService);

  ngOnInit() {
    this.mapService.initMaps(this.map1Container.nativeElement, this.map2Container.nativeElement);
  }

  ngOnDestroy(): void {
    this.mapService.destroyMaps();
  }
}
