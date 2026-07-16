import { Component, output, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-confirm-clear',
  imports: [],
  templateUrl: './confirm-clear.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
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
}
