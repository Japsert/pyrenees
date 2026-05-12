import { Component, signal } from '@angular/core';
import { Map } from './map/map';

@Component({
  selector: 'app-root',
  imports: [
    Map
],
  templateUrl: './app.html'
})
export class App {
  protected readonly title = signal('pyrenees');
}
