import { Component, computed, inject } from '@angular/core';
import { MapService } from '../../map.service';
import { MapStyle } from '../../style.enum';

@Component({
  selector: 'app-style-switcher',
  imports: [],
  templateUrl: './style-switcher.html',
})
export class StyleSwitcher {
  private readonly mapService = inject(MapService);

  protected currentStyleColor = computed(() =>
    this.mapService.activeStyle() == MapStyle.OUTDOOR ? 'bg-amber-50' : 'bg-green-800',
  );

  switchStyle() {
    this.mapService.switchStyle();
  }
}
