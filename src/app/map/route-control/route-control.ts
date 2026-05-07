import { ApplicationRef, Component, ComponentRef, createComponent, EnvironmentInjector, inject } from '@angular/core';
import { MapService } from '../../map.service';
import { IControl } from 'mapbox-gl';
import { RoutePlannerService } from '../../route-planner.service';

@Component({
  selector: 'app-route-control',
  template: `
    <button [attr.aria-pressed]="isEditing" title="Edit route" (click)="edit()">✏️</button>
    <button title="Clear route" (click)="clear()">🗑️</button>
  `,
})
export class RouteControlComponent {
  isEditing = false;
  private mapService = inject(MapService);
  private routePlannerService = inject(RoutePlannerService);

  edit() {
    this.isEditing = !this.isEditing;
    this.mapService.toggleEditingRoute();
  }

  clear() {
    this.routePlannerService.clear();
  }
}

// Mapbox control. Needs appRef and injector to work as an Angular component
export class RouteControl implements IControl {
  private container!: HTMLElement;
  private componentRef!: ComponentRef<RouteControlComponent>;

  constructor(
    private appRef: ApplicationRef,
    private injector: EnvironmentInjector
  ) {}

  onAdd(): HTMLElement {
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    this.componentRef = createComponent(RouteControlComponent, {
      environmentInjector: this.injector,
      hostElement: this.container,
    });
    this.appRef.attachView(this.componentRef.hostView);

    return this.container;
  }

  onRemove(): void {
    this.appRef.detachView(this.componentRef.hostView);
    this.componentRef.destroy();
    this.container?.parentNode?.removeChild(this.container);
  }
}
