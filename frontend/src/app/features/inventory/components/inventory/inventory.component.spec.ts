import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Ingredient } from '../../../pos/models/ingredient.model';
import { IngredientService } from '../../../pos/services/ingredient.service';
import { ConfirmDialogService } from '../../../../shared/ui/confirm-dialog/confirm-dialog.service';
import { ToastService } from '../../../../shared/ui/toast/toast.service';
import { InventoryComponent } from './inventory.component';

/**
 * Bulk-select and bulk-delete behaviour of the Inventory (Stocks) tab.
 * The backend soft-deletes and reports an honest deleted count; the UI must
 * show a confirm gate, send the exact selected ids, toast the ACTUAL count
 * from the API (not the selection count), and clear stale selection whenever
 * the rendered set could change.
 */
describe('InventoryComponent bulk delete', () => {
  let fixture: ComponentFixture<InventoryComponent>;
  let httpMock: HttpTestingController;
  let toast: jasmine.SpyObj<ToastService>;
  let confirmDialog: jasmine.SpyObj<ConfirmDialogService>;
  let component: InventoryComponent;
  let element: HTMLElement;

  const buildIngredient = (id: string, name: string): Ingredient => ({
    id, name, quantity: 3, unit: 'kg', lowStockThreshold: 1
  } as Ingredient);

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [InventoryComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ToastService, useValue: toast = jasmine.createSpyObj('ToastService', ['success', 'error']) },
        { provide: ConfirmDialogService, useValue: confirmDialog = jasmine.createSpyObj('ConfirmDialogService', ['confirm']) }
      ]
    });
    httpMock = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(InventoryComponent);
    component = fixture.componentInstance;
    element = fixture.nativeElement;
    fixture.detectChanges(); // triggers the initial ingredients GET
    httpMock.expectOne(request => request.url === '/api/ingredients' && request.method === 'GET')
      .flush([buildIngredient('a-1', 'Flour'), buildIngredient('b-2', 'Milk'), buildIngredient('c-3', 'Rice')]);
    fixture.detectChanges();
  });

  afterEach(() => httpMock.verify());

  it('keeps per-row delete intact and exposes selection state', () => {
    component.onSelectionChange([component.filteredIngredients[0], component.filteredIngredients[1]]);
    expect(component.selectedIngredients.map(i => i.id)).toEqual(['a-1', 'b-2']);
  });

  it('hides the bulk bar with zero selection and shows it with a count for 2+', () => {
    expect(element.querySelector('.bulk-action-bar')).toBeNull();
    component.onSelectionChange([component.filteredIngredients[0], component.filteredIngredients[2]]);
    fixture.detectChanges();
    const bar = element.querySelector('.bulk-action-bar') as HTMLElement;
    expect(bar).not.toBeNull();
    expect(bar.textContent).toContain('2 selected');
    expect(bar.textContent).toContain('Delete Selected');
  });

  it('clears stale selection when the search filter or sort changes', () => {
    component.onSelectionChange([component.filteredIngredients[0]]);
    expect(component.selectedIngredients.length).toBe(1);
    component.searchTerm = 'rice';
    component.applyFilter();
    expect(component.selectedIngredients.length).toBe(0);
    component.onSelectionChange([component.filteredIngredients[0]]);
    component.onSort({ key: 'name', direction: 'asc' });
    expect(component.selectedIngredients.length).toBe(0);
  });

  it('gates the delete on a confirm dialog: cancelling sends nothing', async () => {
    component.onSelectionChange([component.filteredIngredients[0], component.filteredIngredients[1]]);
    confirmDialog.confirm.and.resolveTo(false);
    await component.deleteSelectedIngredients();
    expect(confirmDialog.confirm).toHaveBeenCalled();
    httpMock.expectNone(request => request.method === 'DELETE');
    expect(toast.success).not.toHaveBeenCalled();
    expect(component.selectedIngredients.length).toBe(2);
  });

  it('deletes the exact selected ids and toasts the honest deleted count from the API', async () => {
    component.onSelectionChange([component.filteredIngredients[0], component.filteredIngredients[1]]);
    confirmDialog.confirm.and.resolveTo(true);
    const pending = component.deleteSelectedIngredients();
    // Two microtask hops let the confirm promise's continuation reach the http call.
    await Promise.resolve();
    await Promise.resolve();
    const deleteRequest = httpMock.expectOne(request => request.url === '/api/ingredients/bulk');
    expect(deleteRequest.request.method).toBe('DELETE');
    expect(deleteRequest.request.body).toEqual({ ids: ['a-1', 'b-2'] });
    // Backend answers one, even though two were selected: UI must report ONE.
    deleteRequest.flush({ deleted: 1 });
    await pending;
    fixture.detectChanges();
    const reload = httpMock.expectOne(request => request.url === '/api/ingredients' && request.method === 'GET');
    reload.flush([buildIngredient('a-1', 'Flour'), buildIngredient('c-3', 'Rice')]);
    await Promise.resolve();
    expect(toast.success).toHaveBeenCalledWith('1 item(s) deleted successfully');
    // Selection cleared and the list reloaded.
    expect(component.selectedIngredients.length).toBe(0);
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('still deletes a single row through its own confirm and endpoint', async () => {
    confirmDialog.confirm.and.resolveTo(true);
    const pending = component.deleteIngredient(component.filteredIngredients[2]);
    await Promise.resolve();
    await Promise.resolve();
    const single = httpMock.expectOne(request => request.url === '/api/ingredients/c-3');
    expect(single.request.method).toBe('DELETE');
    single.flush(null);
    await pending;
    fixture.detectChanges();
    const reload = httpMock.expectOne(request => request.url === '/api/ingredients' && request.method === 'GET');
    reload.flush([buildIngredient('a-1', 'Flour'), buildIngredient('b-2', 'Milk')]);
    await Promise.resolve();
    httpMock.expectNone(request => request.url === '/api/ingredients/bulk');
    expect(toast.success).toHaveBeenCalledWith('Ingredient deleted successfully');
  });
});
