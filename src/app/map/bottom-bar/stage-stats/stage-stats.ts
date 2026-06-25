import { Component, computed, inject } from '@angular/core';
import { PlannerService } from '../../../services';

@Component({
  selector: 'app-stage-stats',
  imports: [],
  templateUrl: './stage-stats.html',
  styleUrl: './stage-stats.css',
})
export class StageStats {
  private readonly planner = inject(PlannerService);

  private readonly selectedStage = this.planner.selectedStage;
  private readonly routeStats = computed(() => this.selectedStage()?.getStats());
  protected readonly length = computed(() => ((this.routeStats()?.length ?? 0) / 1000).toFixed(2));
  protected readonly totalAscent = computed(() => this.routeStats()?.totalAscend);
  protected readonly netAscent = computed(() => this.routeStats()?.netAscend);
  protected readonly timeH = computed(() => Math.trunc((this.routeStats()?.time ?? 0) / 3600));
  protected readonly timeM = computed(() =>
    Math.trunc(((this.routeStats()?.time ?? 0) % 3600) / 60),
  );
}
