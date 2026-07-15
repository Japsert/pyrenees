import { Component, signal } from '@angular/core';
import { Map } from './map/map';
import { TripBar } from './trip-bar/trip-bar';
import { BottomBar } from "./bottom-bar/bottom-bar";

@Component({
  selector: 'app-root',
  imports: [Map, TripBar, BottomBar],
  templateUrl: './app.html',
})
export class App {
  protected readonly title = signal('pyrenees');
}
