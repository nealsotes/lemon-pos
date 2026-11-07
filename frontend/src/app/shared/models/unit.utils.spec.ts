import { DecimalPipe } from '@angular/common';
import { isWholeNumberUnit, stockQuantityDigits } from './unit.utils';

describe('case stock quantity display at existing stored precision', () => {
  const pipe = new DecimalPipe('en-US');
  it('omits unnecessary decimals for whole cases', () => {
    expect(pipe.transform(3, stockQuantityDigits('case'))).toBe('3');
  });
  it('shows partial case rows and movements without rounding them into whole cases', () => {
    expect(pipe.transform(2.75, stockQuantityDigits('case'))).toBe('2.75');
    expect(pipe.transform(-0.25, stockQuantityDigits('case'))).toBe('-0.25');
  });
  it('retains the existing lot scale instead of promising it for ingredient rows', () => {
    expect(pipe.transform(2.7525, stockQuantityDigits('case', true))).toBe('2.7525');
    expect(stockQuantityDigits('case')).toBe('1.0-2');
  });
  it('preserves pcs and kg/L formatting', () => {
    expect(stockQuantityDigits('pcs')).toBe('1.0-0');
    expect(stockQuantityDigits('kg')).toBe('1.2-2');
    expect(stockQuantityDigits('L')).toBe('1.2-2');
  });
});

describe('isWholeNumberUnit (piece family)', () => {
  it('allows partial cases for stock entries, edits, imports and thresholds', () => {
    expect(isWholeNumberUnit('case')).toBe(false);
    expect(isWholeNumberUnit('CASE')).toBe(false);
    expect(isWholeNumberUnit('Case')).toBe(false);
  });

  it('keeps the existing pcs family whole-number', () => {
    expect(isWholeNumberUnit('pcs')).toBe(true);
    expect(isWholeNumberUnit('piece')).toBe(true);
    expect(isWholeNumberUnit('pieces')).toBe(true);
    expect(isWholeNumberUnit('PCS')).toBe(true);
  });

  it('leaves fractional units fractional', () => {
    ['kg', 'g', 'L', 'ml', 'pack', 'bottle', 'can', ''].forEach(u =>
      expect(isWholeNumberUnit(u)).toBe(false));
  });

  it('survives null-ish input from the template', () => {
    expect(isWholeNumberUnit((undefined as unknown) as string)).toBe(false);
  });
});
