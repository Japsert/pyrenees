import {
  afterNextRender,
  AnimationCallbackEvent,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { PlannerService } from '../../services';
import { BarRoute } from './route/bar-route';

@Component({
  selector: 'app-trip-bar',
  templateUrl: './trip-bar.html',
  styleUrl: './trip-bar.css',
  imports: [BarRoute],
})
export class TripBar implements OnInit {
  private readonly planner = inject(PlannerService);

  protected trip = this.planner.trip;

  // animate.enter also fires for elements already present on first render; skip
  // those so stages only animate in when actually added.
  protected renderedOnce = signal(false);

  constructor() {
    afterNextRender(() => this.renderedOnce.set(true));
  }

  ngOnInit(): void {
    document.addEventListener('mousemove', (e) => {
      const createRouteButton = document.getElementById('create-route-button');
      if (createRouteButton === null) return;

      const rect = createRouteButton.getBoundingClientRect();
      const buttonX = rect.left;
      const buttonY = rect.top + rect.height / 2;
      const distance = Math.hypot(e.clientX - buttonX, e.clientY - buttonY);
      createRouteButton.classList.toggle('mouse-is-near', distance < 50);
    });
  }

  protected onEmptyEnter(event: AnimationCallbackEvent): void {
    if (!this.renderedOnce()) return event.animationComplete();
    const element = event.target as HTMLElement;
    const target = element.offsetWidth;
    const leaving = element.parentElement!.querySelector<HTMLElement>('app-route');
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

  protected createRoute(): void {
    // manually update classlist instead of only after mousemove
    document.getElementById('create-route-button')?.classList.remove('mouse-is-near');
    this.planner.addRoute();
  }
}
