import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { IngredientService } from './ingredient.service';

describe('IngredientService bulk delete', () => {
  let service: IngredientService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [IngredientService, provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(IngredientService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('sends a DELETE /api/ingredients/bulk with the exact ids body', () => {
    let response: { deleted: number } | undefined;
    service.bulkDeleteIngredients(['a-1', 'b-2']).subscribe(result => response = result);

    const request = httpMock.expectOne(req => req.url === '/api/ingredients/bulk');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.body).toEqual({ ids: ['a-1', 'b-2'] });
    request.flush({ deleted: 2 });

    expect(response!.deleted).toBe(2);
  });
});
