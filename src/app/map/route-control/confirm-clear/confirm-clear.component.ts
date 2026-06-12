import { Component, HostListener, output } from '@angular/core';

@Component({
  selector: 'app-confirm-clear',
  imports: [],
  templateUrl: './confirm-clear.component.html',
  styleUrl: './confirm-clear.component.css',
})
export class ConfirmClearComponent {
  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  protected clear(): void {
    this.confirmed.emit();
  }

  protected cancel(): void {
    this.cancelled.emit();
  }

  @HostListener('document:mousedown')
  onMousedownOutside() {
    this.cancelled.emit();
  }
}
