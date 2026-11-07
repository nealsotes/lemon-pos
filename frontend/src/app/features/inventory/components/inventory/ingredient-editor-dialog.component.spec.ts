import { UntypedFormBuilder } from '@angular/forms';
import { MatDialogRef } from '@angular/material/dialog';
import { IngredientEditorDialogComponent, IngredientEditorDialogData } from './ingredient-editor-dialog.component';

describe('IngredientEditorDialogComponent - LPOS-UNIT-CASE unit system', () => {
  let component: IngredientEditorDialogComponent;

  beforeEach(() => {
    component = new IngredientEditorDialogComponent(
      {} as MatDialogRef<IngredientEditorDialogComponent>,
      { ingredient: null } as IngredientEditorDialogData,
      new UntypedFormBuilder());
  });

  it('accepts a new partial case and fractional threshold', () => {
    component.ngOnInit();
    component.ingredientForm.patchValue({ name: 'Case fixture', unit: 'case', quantity: 2.75, lowStockThreshold: 0.5 });
    expect(component.isPieceUnit).toBe(false);
    expect(component.ingredientForm.valid).toBe(true);
  });

  it('saves a metadata-only edit without truncating a partial case', () => {
    component.data.ingredient = { id: 'case-1', name: 'Case fixture', unit: 'case', quantity: 2.75, lowStockThreshold: 0.5, isActive: true } as any;
    const close = jasmine.createSpy('close');
    component.dialogRef.close = close;
    component.ngOnInit();
    component.ingredientForm.patchValue({ name: 'Renamed case' });
    component.save();
    expect(close).toHaveBeenCalledWith(jasmine.objectContaining({ quantity: 2.75, lowStockThreshold: 0.5 }));
  });

  it('retains integer validation for pcs after switching units', () => {
    component.ngOnInit();
    component.ingredientForm.patchValue({ unit: 'pcs', quantity: 2.75, lowStockThreshold: 0.5 });
    expect(component.ingredientForm.get('quantity')?.hasError('wholeNumber')).toBe(true);
    expect(component.ingredientForm.get('lowStockThreshold')?.hasError('wholeNumber')).toBe(true);
  });

  it("offers 'case' in the unit list", () => {
    expect(component.units).toContain('case');
  });

  it("resolves the icon for 'case'", () => {
    expect(component.getUnitIcon('case')).toBe('Cs');
  });
});
