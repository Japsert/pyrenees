import { ApplicationRef, Component, inject, OnInit, signal } from '@angular/core';
import { InteractionService, PlannerService } from '../../services';
import { Route, Stage } from '../../model';
import { Id } from '../../util';

@Component({
  selector: 'app-trip-bar',
  templateUrl: './trip-bar.html',
  styleUrl: './trip-bar.css',
})
export class TripBar implements OnInit {
  private appRef = inject(ApplicationRef);
  private readonly planner = inject(PlannerService);
  private readonly interaction = inject(InteractionService);

  protected trip = this.planner.trip;
  protected newStageId = signal<Id | null>(null);

  ngOnInit(): void {
    document.addEventListener('mousemove', (e) => {
      const button = document.getElementById('create-stage-button');
      if (button === null) return;

      const rect = button.getBoundingClientRect();
      const buttonX = rect.left;
      const buttonY = rect.top + rect.height / 2;

      const distance = Math.sqrt((e.clientX - buttonX) ** 2 + (e.clientY - buttonY) ** 2);

      if (distance < 75) {
        button.classList.add('mouse-is-near');
      } else {
        button.classList.remove('mouse-is-near');
      }
    });
  }

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
    if (!document.startViewTransition) {
      this._createStage(route);
      return;
    }
    const viewTransition = document.startViewTransition(() => {
      this._createStage(route);
      this.newStageId.set(this.planner.selectedStage()!.id);
      this.appRef.tick();
    });
    viewTransition.finished.finally(() => this.newStageId.set(null));
  }

  /** True while `route`'s create button is handing its view-transition-name to the new stage. */
  protected stageIsMorphing(route: Route): boolean {
    const newStageId = this.newStageId();
    return newStageId !== null && route.stages.some((stage) => stage.id === newStageId);
  }

  private _createStage(route: Route): void {
    this.planner.addStage(route);
    this.interaction.turnAddingWaypointsOn();
  }

  protected createRoute(): void {
    this.planner.addRoute();
  }
}
