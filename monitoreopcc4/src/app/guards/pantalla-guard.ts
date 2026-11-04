import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { map, take } from 'rxjs';
import { Pantalla, pantallasPermitidas, rutaInicial } from '../permisos';

// La ruta declara su pantalla en data.pantalla; si el usuario no la tiene habilitada
// se lo manda a su primera pantalla permitida (o al login si no tiene ninguna).
export const pantallaGuard: CanActivateFn = (route) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const pantalla = route.data['pantalla'] as Pantalla;

  return authService.perfil().pipe(
    take(1),
    map((perfil) => {
      if (pantallasPermitidas(perfil).includes(pantalla)) return true;
      return router.createUrlTree([rutaInicial(perfil) ?? '/login']);
    }),
  );
};
