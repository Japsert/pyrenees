import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-text-field',
  imports: [],
  templateUrl: './text-field.html',
  styleUrl: './text-field.css',
})
export class TextField {
  text = input<string>('');
  placeholder = input<string>('');
  textChange = output<string>();

  onBlur(el: HTMLElement) {
    this.textChange.emit(el.innerText);
  }
}
