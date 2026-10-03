import { of } from 'rxjs';
import { NotificacionesService } from '../services/notificaciones';

// Lo que necesita el encabezado común en los specs de las pantallas
export const AUTH_ENCABEZADO = {
  user$: of({ email: 'op@x.com' }),
  isAdmin: () => of(false),
  logout: () => of(),
};

export const PROVEEDOR_NOTIFICACIONES = {
  provide: NotificacionesService,
  useValue: {
    alertas$: of(null),
    noLeidas$: of(0),
    revisarEnSilencio: () => {},
    permisoNavegador: () => 'no-soportado',
  },
};
