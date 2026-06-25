import { Component, inject } from '@angular/core';
import { PlannerService, FlyoverService } from '../../../services';

@Component({
  selector: 'app-flyover',
  imports: [],
  templateUrl: './flyover.html',
})
export class Flyover {
  protected readonly planner = inject(PlannerService);
  private readonly flyover = inject(FlyoverService);

  protected isFlying = this.flyover.isFlying;

  toggleFly(): void {
    console.debug('selected stage:', this.planner.selectedStage());
    if (this.isFlying()) this.flyover.cancel();
    else this.flyover.begin();
  }
}
