import { Component, signal } from '@angular/core';
import { Map } from './map/map';
import { TripBar } from './trip-bar/trip-bar';
import { BottomBar } from './bottom-bar/bottom-bar';
import { ContextMenu } from './context-menu/context-menu';

@Component({
  selector: 'app-root',
  imports: [Map, TripBar, BottomBar, ContextMenu],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('pyrenees');
}
