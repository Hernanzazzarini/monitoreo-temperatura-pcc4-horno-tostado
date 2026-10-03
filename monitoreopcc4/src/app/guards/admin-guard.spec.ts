import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router, provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';

import { adminGuard } from './admin-guard';
import { AuthService } from '../services/auth';

describe('adminGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) =>
    TestBed.runInInjectionContext(() => adminGuard(...guardParameters));

  function setup(isAdmin: boolean) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { isAdmin: () => of(isAdmin) } }],
    });
  }

  it('allows admins', async () => {
    setup(true);
    const result = executeGuard({} as any, {} as any) as Observable<boolean>;
    expect(await firstValueFrom(result)).toBe(true);
  });

  it('redirects non-admins to /monitoreo', async () => {
    setup(false);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const result = executeGuard({} as any, {} as any) as Observable<boolean>;
    expect(await firstValueFrom(result)).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/monitoreo']);
  });
});
