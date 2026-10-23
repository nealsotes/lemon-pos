import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { UserAccount } from '../../../shared/models/user.model';
import { UserManagementService } from './user-management.service';

/**
 * Covers the four /api/users calls the Users admin page makes:
 * list, create, password reset and activate/deactivate — including the
 * exact request bodies the API contract expects.
 */
describe('UserManagementService', () => {
  let service: UserManagementService;
  let httpMock: HttpTestingController;

  const makeAccount = (overrides: Partial<UserAccount> = {}): UserAccount => ({
    id: 'u1',
    username: 'manager',
    role: 'Employee',
    createdAt: '2026-10-23T00:00:00Z',
    lastLoginAt: null,
    isActive: true,
    ...overrides
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    });
    service = TestBed.inject(UserManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('getUsers requests /api/users', () => {
    // Arrange
    const accounts = [makeAccount()];

    // Act
    let result: UserAccount[] | undefined;
    service.getUsers().subscribe(users => (result = users));
    const request = httpMock.expectOne('/api/users');

    // Assert
    expect(request.request.method).toBe('GET');
    request.flush(accounts);
    expect(result).toEqual(accounts);
  });

  it('createUser posts username, password and role', () => {
    let result: UserAccount | undefined;
    service.createUser({ username: 'manager', password: 'secret123', role: 'Employee' })
      .subscribe(account => (result = account));

    const request = httpMock.expectOne('/api/users');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      username: 'manager',
      password: 'secret123',
      role: 'Employee'
    });
    request.flush(makeAccount());
    expect(result?.username).toBe('manager');
  });

  it('setUserPassword puts the new password to the /password endpoint', () => {
    let completed = false;
    service.setUserPassword('u1', 'newpass123').subscribe(() => (completed = true));

    const request = httpMock.expectOne('/api/users/u1/password');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ password: 'newpass123' });
    request.flush(null);
    expect(completed).toBe(true);
  });

  it('setUserStatus puts the requested isActive value', () => {
    let completed = false;
    service.setUserStatus('u1', false).subscribe(() => (completed = true));

    const request = httpMock.expectOne('/api/users/u1/status');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ isActive: false });
    request.flush(null);
    expect(completed).toBe(true);
  });
});