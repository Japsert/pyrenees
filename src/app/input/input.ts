import { Component, input, model, output } from '@angular/core';

@Component({
  selector: 'app-input',
  imports: [],
  templateUrl: './input.html',
  styleUrl: './input.css',
})
export class Input {
  placeholder = input.required<string>();
  value = model.required<string>();
  nameChange = output<string>();
  cancel = output<void>();

  private prevValue = '';

  onFocus(): void {
    this.prevValue = this.value();
  }

  onInput(event: InputEvent): void {
    const element = event.target as HTMLInputElement;
    this.value.set(element.value);
  }

  onEnterDown(event: Event): void {
    //if (this.value().trim())
    // TODO
    this.nameChange.emit(this.value());
    const element = event.target as HTMLInputElement;
    element.blur();
  }

  onEscapeDown(event: Event): void {
    this.cancel.emit();
    event.stopPropagation();
    this.value.set(this.prevValue);
    const element = event.target as HTMLInputElement;
    element.blur();
  }
}
