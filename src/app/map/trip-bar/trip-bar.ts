import { Component, inject, signal } from '@angular/core';
import { PlannerService } from '../../services';
import { Route } from '../../model';
import { TextField } from "../../text-field/text-field";

@Component({
  selector: 'app-trip-bar',
  imports: [TextField],
  templateUrl: './trip-bar.html',
  styleUrl: './trip-bar.css',
})
export class TripBar {
  private readonly planner = inject(PlannerService);

  //protected routes = this.planner.trip().routes;
  protected routes = signal<Route[]>([Route.create().withName('test')]);

  protected setSelectedRoute(route: Route): void {
    this.planner.selectedRoute = route;
  }

  protected setRouteName(route: Route, name: string): void {
    this.planner.updateRoute(route, (route) => route.withName(name));
  }
}
