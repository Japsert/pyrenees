import { Component, inject } from '@angular/core';
import { MapService } from '../../map.service';
import { Style } from '../../style.enum';

const STYLE_COLORS = new Map([
  [Style.OUTDOOR, 'bg-green-800'],
  [Style.SATELLITE, 'bg-amber-50'],
]);

@Component({
  selector: 'app-style-switcher',
  imports: [],
  templateUrl: './style-switcher.html',
})
export class StyleSwitcher {
  private mapService = inject(MapService);

  switchStyle() {
    this.mapService.switchStyle();
  }

  getCurrentStyleColor(): string {
    return STYLE_COLORS.get(this.mapService.activeStyle)!;
  }
}
