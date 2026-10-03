import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';

import { authGuard } from './auth-guard';
import { AuthService } from '../services/auth';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  function setup(user: unknown) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { user$: of(user) } }],
    });
  }

  it('allows authenticated users', async () => {
    setup({ uid: '1' });
    const result = executeGuard({} as any, {} as any) as Observable<boolean>;
    expect(await firstValueFrom(result)).toBe(true);
  });

  it('redirects anonymous users to /login', async () => {
    setup(null);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const result = executeGuard({} as any, {} as any) as Observable<boolean>;
    expect(await firstValueFrom(result)).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
