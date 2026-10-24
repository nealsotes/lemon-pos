import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment.prod';
import { ImportDialogComponent, ImportResultReport } from './import-dialog.component';

describe('ImportDialogComponent', () => {
  let component: ImportDialogComponent;
  let fixture: any;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImportDialogComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()]
    }).compileComponents();

    fixture = TestBed.createComponent(ImportDialogComponent);
    component = fixture.componentInstance;
    component.kind = 'products';
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('rejects unsupported file extensions before upload', () => {
    component.open();
    component.onFilePicked(fileInputEvent(new File(['x'], 'products.pdf', { type: 'application/pdf' })));

    expect(component.selectedFile).toBeNull();
    expect(component.fileError).toContain('.csv');
  });

  it('uploads the picked file as multipart form data and reports the result', () => {
    component.open();
    component.onFilePicked(fileInputEvent(new File(['Name,Price\nMilk,10\n'], 'products.csv')));
    expect(component.selectedFile).not.toBeNull();

    const emitted: ImportResultReport[] = [];
    component.imported.subscribe(report => emitted.push(report));

    component.upload();
    const request = httpMock.expectOne(`${environment.apiUrl}/products/import`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body instanceof FormData).toBeTrue();
    expect(request.request.body.get('file')?.name).toBe('products.csv');

    request.flush({ kind: 'Products', created: 1, updated: 0, skipped: 0, errors: [{ row: 2, message: 'Price is required.' }] });

    expect(component.state).toBe('result');
    expect(component.result?.created).toBe(1);
    expect(emitted.length).toBe(1);
  });

  it('surfaces an upload failure back to the pick state with the message', () => {
    component.open();
    component.onFilePicked(fileInputEvent(new File(['x'], 'products.csv')));

    component.upload();
    const request = httpMock.expectOne(`${environment.apiUrl}/products/import`);
    request.flush('Bad header row. Expected Name, Category, Price…', { status: 400, statusText: 'Bad Request' });

    expect(component.state).toBe('pick');
    expect(component.fileError).toContain('Bad header row');
  });

  function fileInputEvent(file: File): Event {
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });
    return { target: input } as unknown as Event;
  }
});