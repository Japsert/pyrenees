import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  effect,
  inject,
} from '@angular/core';
import { StyleSwitcher } from './style-switcher/style-switcher';
import { MapService } from '../map.service';
import { RoutePlannerService } from '../route-planner.service';

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.html',
  styleUrls: ['./map.css'],
  imports: [StyleSwitcher],
})
export class Map implements OnInit, OnDestroy {
  @ViewChild('map1Container', { static: true }) private readonly map1Container!: ElementRef;
  @ViewChild('map2Container', { static: true }) private readonly map2Container!: ElementRef;

  private readonly mapService = inject(MapService);
  private readonly routePlannerService = inject(RoutePlannerService);

  private readonly route = this.routePlannerService.route;
  private readonly routeStats = computed(() => this.route().getStats());
  protected readonly length = computed(() => ((this.routeStats()?.length ?? 0) / 1000).toFixed(2));
  protected readonly totalAscent = computed(() => this.routeStats()?.totalAscend);
  protected readonly netAscent = computed(() => this.routeStats()?.netAscend);
  protected readonly time = computed(() => this.routeStats()?.time);
  protected readonly timeH = computed(() => Math.trunc((this.routeStats()?.time ?? 0) / 3600));
  protected readonly timeM = computed(() => Math.trunc(((this.routeStats()?.time ?? 0) % 3600) / 60));

  constructor() {
    effect(() => {
      console.debug(this.time());
    })
  }

  ngOnInit() {
    this.mapService.initMaps(this.map1Container.nativeElement, this.map2Container.nativeElement);
  }

  ngOnDestroy(): void {
    this.mapService.destroyMaps();
  }
}
