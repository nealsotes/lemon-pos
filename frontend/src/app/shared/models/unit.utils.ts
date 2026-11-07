// Preserve the existing pcs family. Cases allow partial stock and thresholds;
// a unit label never implies a pack-size conversion.
export function isWholeNumberUnit(unit: string): boolean {
  const u = (unit ?? '').toLowerCase();
  return u === 'pcs' || u === 'piece' || u === 'pieces';
}

// Angular DecimalPipe digitsInfo: ingredient/movement quantities are (18,2),
// lot balances are (18,4). Case displays omit trailing zeroes at the actual scale.
export function stockQuantityDigits(unit: string, lotQuantity = false): string {
  if ((unit ?? '').toLowerCase() === 'case') {
    return lotQuantity ? '1.0-4' : '1.0-2';
  }
  return isWholeNumberUnit(unit) ? '1.0-0' : '1.2-2';
}
