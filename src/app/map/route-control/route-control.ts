import { IControl, Map } from 'mapbox-gl';

export class RoutePlannerControl implements IControl {
  private map?: Map;
  private container?: HTMLElement;
  private editRouteButtom?: HTMLButtonElement;
  private clearRouteButton?: HTMLButtonElement;

  onAdd(map: Map): HTMLElement {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

    this.editRouteButtom = document.createElement('button');
    this.editRouteButtom.title = 'Edit route';
    this.container.appendChild(this.editRouteButtom);

    this.clearRouteButton = document.createElement('button');
    this.clearRouteButton.title = 'Clear route';
    this.container.appendChild(this.clearRouteButton);

    return this.container;
  }

  onRemove(): void {
    if (this.container) {
      this.container.parentNode?.removeChild(this.container);
      this.map = undefined;
    }
  }
}
