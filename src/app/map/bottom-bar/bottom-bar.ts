import { Component, computed, inject } from '@angular/core';
import { RoutePlannerService } from '../../route-planner.service';
import { StyleSwitcher } from "../style-switcher/style-switcher";

@Component({
  selector: 'app-bottom-bar',
  imports: [StyleSwitcher],
  templateUrl: './bottom-bar.html',
  styleUrl: './bottom-bar.css',
})
export class BottomBar {
  private readonly routePlannerService = inject(RoutePlannerService);
  
  private readonly route = this.routePlannerService.route;
  private readonly routeStats = computed(() => this.route().getStats());
  protected readonly length = computed(() => ((this.routeStats()?.length ?? 0) / 1000).toFixed(2));
  protected readonly totalAscent = computed(() => this.routeStats()?.totalAscend);
  protected readonly netAscent = computed(() => this.routeStats()?.netAscend);
  protected readonly timeH = computed(() => Math.trunc((this.routeStats()?.time ?? 0) / 3600));
  protected readonly timeM = computed(() =>
    Math.trunc(((this.routeStats()?.time ?? 0) % 3600) / 60),
  );
}
