import { Component, inject } from '@angular/core';
import { StyleSwitcher } from "../style-switcher/style-switcher";
import { HeightMap } from "./height-map/height-map";
import { FlyoverService, PlannerService } from '../../services';
import { StageStats } from "./stage-stats/stage-stats";

@Component({
  selector: 'app-bottom-bar',
  imports: [StyleSwitcher, StageStats, HeightMap],
  templateUrl: './bottom-bar.html',
})
export class BottomBar {
  protected readonly planner = inject(PlannerService);
  private readonly flyover = inject(FlyoverService)

  protected isFlying = this.flyover.isFlying;

  toggleFly(): void {
    console.debug('selected stage:', this.planner.selectedStage());
    if (this.isFlying()) this.flyover.cancel();
    else this.flyover.begin();
  }
}
