import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MapService } from '../../services/map';
import { MapStyle } from '../../style.enum';

@Component({
  selector: 'app-style-switcher',
  imports: [],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './style-switcher.html',
})
export class StyleSwitcher {
  private readonly mapService = inject(MapService);

  protected isStyleOutdoor(): boolean {
    return this.mapService.activeStyle() === MapStyle.OUTDOOR;
  }

  switchStyle() {
    this.mapService.switchStyle();
  }
}
