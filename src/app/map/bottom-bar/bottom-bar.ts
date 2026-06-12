import { Component, computed, inject } from '@angular/core';
import { RouteService } from '../../route.service';
import { StyleSwitcher } from "../style-switcher/style-switcher";
import { HeightMap } from "./height-map/height-map";
import { RouteInteractionService } from '../../route-interaction.service';
import { MapService } from '../../map.service';

@Component({
  selector: 'app-bottom-bar',
  imports: [StyleSwitcher, HeightMap],
  templateUrl: './bottom-bar.html',
  styleUrl: './bottom-bar.css',
})
export class BottomBar {
  private readonly map = inject(MapService);
  protected readonly routeInteraction = inject(RouteInteractionService);
  private readonly routePlanner = inject(RouteService);

  protected isFlying = false;
  
  private readonly route = this.routePlanner.route;
  private readonly routeStats = computed(() => this.route().getStats());
  protected readonly length = computed(() => ((this.routeStats()?.length ?? 0) / 1000).toFixed(2));
  protected readonly totalAscent = computed(() => this.routeStats()?.totalAscend);
  protected readonly netAscent = computed(() => this.routeStats()?.netAscend);
  protected readonly timeH = computed(() => Math.trunc((this.routeStats()?.time ?? 0) / 3600));
  protected readonly timeM = computed(() =>
    Math.trunc(((this.routeStats()?.time ?? 0) % 3600) / 60),
  );

  toggleFly(): void {
    if (this.isFlying) this.map.cancelFly();
    else this.map.fly();
    this.isFlying = !this.isFlying;
  }
}
