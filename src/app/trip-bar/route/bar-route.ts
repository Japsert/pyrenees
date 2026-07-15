import { AnimationCallbackEvent, Component, inject, input, OnInit } from '@angular/core';
import { Route } from '../../../model';
import { InteractionService, PlannerService } from '../../../services';
import { BarStage } from '../stage/bar-stage';

@Component({
  selector: 'app-route',
  imports: [BarStage],
  templateUrl: './bar-route.html',
  styleUrl: './bar-route.css',
  host: {
    class: 'overflow-hidden',
    '(animate.enter)': 'onEnter($event)',
    '(animate.leave)': 'onLeave($event)',
  },
})
export class BarRoute implements OnInit {
  readonly route = input.required<Route>();
  readonly renderedOnce = input.required<boolean>();
  readonly isOnly = input.required<boolean>();

  private readonly planner = inject(PlannerService);
  private readonly interaction = inject(InteractionService);

  ngOnInit(): void {
    document.addEventListener('mousemove', (e) => {
      const createStageButtons = document.querySelectorAll<HTMLElement>('.create-stage-button');

      for (const button of createStageButtons) {
        const rect = button.getBoundingClientRect();
        const buttonX = rect.left;
        const buttonY = rect.top + rect.height / 2;
        const distance = Math.hypot(e.clientX - buttonX, e.clientY - buttonY);
        button.classList.toggle('mouse-is-near', distance < 50);
      }
    });
  }

  protected onEnter(event: AnimationCallbackEvent): void {
    if (!this.renderedOnce()) return event.animationComplete();
    const element = event.target as HTMLElement;
    const width = element.offsetWidth;
    const animation = this.isOnly()
      ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
      : element.animate(
          [
            { width: '0px', minWidth: '0px', opacity: 0 },
            { width: `${width}px`, minWidth: '0px', opacity: 1 },
          ],
          { duration: 200, easing: 'ease' },
        );
    animation.finished.then(() => event.animationComplete());
  }

  protected onLeave(event: AnimationCallbackEvent): void {
    const element = event.target as HTMLElement;
    const width = element.offsetWidth;
    let animation: Animation;
    if (this.isOnly()) {
      element.style.position = 'absolute';
      element.style.width = `${width}px`;
      animation = element.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 200,
        easing: 'ease',
      });
    } else {
      animation = element.animate(
        [
          { width: `${width}px`, minWidth: '0px', opacity: 1 },
          { width: '0px', minWidth: '0px', opacity: 0 },
        ],
        { duration: 200, easing: 'ease' },
      );
    }
    animation.finished.then(() => event.animationComplete());
  }

  protected createStage(route: Route): void {
    this.planner.addStage(route);
    this.interaction.turnAddingWaypointsOn();
    // manually update classlist instead of only after mousemove
    for (const button of document.getElementsByClassName('create-stage-button')) {
      button.classList.remove('mouse-is-near');
    }
  }

  protected isRouteSelected(route: Route): boolean {
    return this.planner.selectedRoute() === route;
  }

  protected onRouteLeftClick(route: Route): void {
    if (this.isRouteSelected(route)) {
      if (this.planner.selectedStage() !== null) {
        this.planner.deselectStage();
        return;
      }
      this.planner.deselectRoute();
      return;
    }
    this.planner.selectRoute(route);
  }

  protected onRouteRightClick(route: Route, event: MouseEvent): void {
    event.preventDefault();
    // TODO: show context menu (and select) instead of deleting
    this.planner.deleteRoute(route);
  }

  protected onEmptyEnter(event: AnimationCallbackEvent): void {
    if (!this.renderedOnce()) return event.animationComplete();
    const element = event.target as HTMLElement;
    const target = element.offsetWidth;
    const leaving = element.parentElement!.querySelector<HTMLElement>('app-stage');
    const from = leaving?.offsetWidth;
    const animation =
      from === undefined
        ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' })
        : element.animate(
            [
              { width: `${from}px`, minWidth: '0px', opacity: 0 },
              { width: `${target}px`, minWidth: '0px', opacity: 1 },
            ],
            { duration: 200, easing: 'ease' },
          );
    animation.finished.then(() => event.animationComplete());
  }

  protected setRouteName(route: Route, name: string): void {
    this.planner.updateRoute(route, (route) => route.withName(name));
  }
}
