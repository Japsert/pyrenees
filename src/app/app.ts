import { Component, signal } from '@angular/core';
//import { RouterOutlet } from '@angular/router';
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
