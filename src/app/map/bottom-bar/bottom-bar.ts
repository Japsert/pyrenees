import { Component, inject } from '@angular/core';
import { StyleSwitcher } from '../style-switcher/style-switcher';
import { HeightMap } from './height-map/height-map';
import { StageStats } from './stage-stats/stage-stats';
import { Flyover } from './flyover/flyover';
import { InteractionService } from '../../services';

@Component({
  selector: 'app-bottom-bar',
  imports: [StyleSwitcher, StageStats, HeightMap, Flyover],
  templateUrl: './bottom-bar.html',
})
export class BottomBar {
  //protected readonly interaction = inject(InteractionService);
}
