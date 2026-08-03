import { Component, inject, input, output, signal } from '@angular/core';
import { Color } from 'use-color';
import { ColorPickerService } from '../../../services/color-picker';

@Component({
  selector: 'app-color-picker',
  imports: [],
  templateUrl: './color-picker.html',
  styleUrl: './color-picker.css',
})
export class ColorPicker {
  currentColor = input.required<Color>();
  colorPicked = output<Color>();

  protected readonly colorService = inject(ColorPickerService);
  colors = this.colorService.COLORS;

  customColors = signal<Color[]>([]);

  pickColor(color: Color): void {
    this.colorPicked.emit(color);
  }

  addCustomColor(color: Color): void {
    this.colorService.addCustomColor(color);
  }
}
