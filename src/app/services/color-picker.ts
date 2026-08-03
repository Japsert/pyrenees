import { Service, signal } from '@angular/core';
import { color, Color } from 'use-color';

@Service()
export class ColorPickerService {
  COLORS: Color[] = [
    color('crimson'),
    color('coral'),
    color('darkorange'),
    color('gold'),
    color('chartreuse'),
    color('forestgreen'),
    color('teal'),
    color('dodgerblue'),
    color('navy'),
    color('indigo'),
    color('darkorchid'),
    color('deeppink'),
  ];
  customColors = signal<Color[]>([]);

  addCustomColor(color: Color): void {
    this.customColors.update((colors) => [...colors, color]);
  }
}
