import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, take } from 'rxjs';

// Generar lotes: solo encargada o admin
export const encargadaGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.puedeGenerarLotes().pipe(
    take(1),
    map((puede) => puede || router.createUrlTree(['/embolse'])),
  );
};
