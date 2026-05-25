import { Component, computed, inject } from '@angular/core';
import { RoutePlannerService } from '../../route-planner.service';
import { StyleSwitcher } from "../style-switcher/style-switcher";
import { HeightMap } from "./height-map/height-map";
import { RouteInteractionService } from '../../route-interaction.service';

@Component({
  selector: 'app-bottom-bar',
  imports: [StyleSwitcher, HeightMap],
  templateUrl: './bottom-bar.html',
  styleUrl: './bottom-bar.css',
})
export class BottomBar {
  protected readonly routeInteraction = inject(RouteInteractionService);
  private readonly routePlanner = inject(RoutePlannerService);
  
  private readonly route = this.routePlanner.route;
  private readonly routeStats = computed(() => this.route().getStats());
  protected readonly length = computed(() => ((this.routeStats()?.length ?? 0) / 1000).toFixed(2));
  protected readonly totalAscent = computed(() => this.routeStats()?.totalAscend);
  protected readonly netAscent = computed(() => this.routeStats()?.netAscend);
  protected readonly timeH = computed(() => Math.trunc((this.routeStats()?.time ?? 0) / 3600));
  protected readonly timeM = computed(() =>
    Math.trunc(((this.routeStats()?.time ?? 0) % 3600) / 60),
  );
}
