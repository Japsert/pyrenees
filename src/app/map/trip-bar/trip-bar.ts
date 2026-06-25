import { Component, inject } from '@angular/core';
import { InteractionService, PlannerService } from '../../services';
import { Route, Stage } from '../../model';

@Component({
  selector: 'app-trip-bar',
  templateUrl: './trip-bar.html',
})
export class TripBar {
  private readonly planner = inject(PlannerService);
  private readonly interaction = inject(InteractionService);

  protected trip = this.planner.trip;

  protected isStageSelected(stage: Stage): boolean {
    return this.planner.selectedStage() === stage;
  }

  protected onRouteRightClick(route: Route, event: MouseEvent): void {
    event.preventDefault();
    // TODO: show context menu (and select) instead of deleting
    this.planner.deleteRoute(route);
  }

  protected onStageLeftClick(route: Route, stage: Stage): void {
    if (this.isStageSelected(stage)) {
      this.planner.deselectStage();
      return;
    }
    this.planner.selectStage(route, stage);
  }

  protected onStageRightClick(route: Route, stage: Stage, event: MouseEvent): void {
    event.preventDefault();
    // TODO: show context menu (and select) instead of deleting
    this.planner.deleteStage(route, stage);
  }

  protected setRouteName(route: Route, name: string): void {
    this.planner.updateRoute(route, (route) => route.withName(name));
  }

  protected setStageName(route: Route, stage: Stage, name: string): void {
    this.planner.updateStage(route, stage, (stage) => stage.withName(name));
  }

  protected createStage(route: Route): void {
    this.planner.addStage(route);
    this.interaction.turnAddingWaypointsOn();
  }

  protected createRoute(): void {
    this.planner.addRoute();
  }
}
