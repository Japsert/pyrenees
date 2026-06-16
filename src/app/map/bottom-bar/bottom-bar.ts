import { Component, computed, inject } from '@angular/core';
import { StyleSwitcher } from "../style-switcher/style-switcher";
import { HeightMap } from "./height-map/height-map";
import { FlyoverService, PlannerService } from '../../services';

@Component({
  selector: 'app-bottom-bar',
  imports: [StyleSwitcher, HeightMap],
  templateUrl: './bottom-bar.html',
  styleUrl: './bottom-bar.css',
})
export class BottomBar {
  protected readonly planner = inject(PlannerService);
  private readonly flyover = inject(FlyoverService)

  protected isFlying = this.flyover.isFlying;
  
  private readonly selectedStage = this.planner.selectedStage;
  private readonly routeStats = computed(() => this.selectedStage?.getStats());
  protected readonly length = computed(() => ((this.routeStats()?.length ?? 0) / 1000).toFixed(2));
  protected readonly totalAscent = computed(() => this.routeStats()?.totalAscend);
  protected readonly netAscent = computed(() => this.routeStats()?.netAscend);
  protected readonly timeH = computed(() => Math.trunc((this.routeStats()?.time ?? 0) / 3600));
  protected readonly timeM = computed(() =>
    Math.trunc(((this.routeStats()?.time ?? 0) % 3600) / 60),
  );

  toggleFly(): void {
    if (this.isFlying()) this.flyover.cancel();
    else this.flyover.begin();
  }
}
