import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-text-field',
  imports: [],
  templateUrl: './text-field.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
