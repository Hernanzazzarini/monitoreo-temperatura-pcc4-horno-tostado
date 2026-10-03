import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { NotificacionesService, calcularAlertas } from './notificaciones';
import { AuthService } from './auth';
import { RegistroHorno } from './google-drive';
import { RegistrosService } from './registros';

const AHORA = new Date(2026, 9, 3, 12, 0);

function registro(parcial: Partial<RegistroHorno>): RegistroHorno {
  return {
    fecha: '03/10/2026',
    horaSet: '08:00',
    horaControl: '08:10',
    quemadores: [70, 82, 85, 79, 81, 75],
    velocidadBanda: 0.5,
    alturaCamara: 6,
    observaciones: '',
    accionesCorrectivas: '',
    modificaciones: '',
    responsable: 'Juan',
    ...parcial,
  };
}

describe('calcularAlertas', () => {
  it('alerts only controls whose burners fail the PCC, newest first', () => {
    const alertas = calcularAlertas(
      [
        registro({}), // cumple (82-85)
        registro({ horaSet: '09:00', horaControl: '09:05', quemadores: [70, 85, 72, 90, 60, 75] }),
        registro({
          horaSet: '10:00',
          horaControl: '10:02',
          quemadores: [70, 79, 82, 78, 81, 75],
          accionesCorrectivas: 'Se subió la llama',
        }),
      ],
      AHORA,
    );

    expect(alertas.map((a) => a.titulo)).toEqual([
      'Quemadores bajo 80 °C · 03/10/2026 10:00',
      'Quemadores bajo 80 °C · 03/10/2026 09:00',
    ]);
    expect(alertas[0].detalle).toBe('Q1: 70 °C · Q2: 79 °C · Q4: 78 °C · Q6: 75 °C — Juan');
    expect(alertas[0].conAccion).toBe(true);
    expect(alertas[1].conAccion).toBe(false);
  });

  it('ignores controls older than 7 days', () => {
    const viejo = registro({ fecha: '20/09/2026', quemadores: [60, 60, 60, 60, 60, 60] });
    expect(calcularAlertas([viejo], AHORA)).toEqual([]);
  });
});

describe('NotificacionesService', () => {
  let registros$: BehaviorSubject<RegistroHorno[] | null>;
  let servicio: NotificacionesService;

  beforeEach(() => {
    localStorage.clear();
    registros$ = new BehaviorSubject<RegistroHorno[] | null>(null);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { tieneTokenGoogle: () => false } },
        {
          provide: RegistrosService,
          useValue: { registros$, puedeCargarSinClic: () => false, cargar: () => of([]) },
        },
      ],
    });
    servicio = TestBed.inject(NotificacionesService);
  });

  it('counts unread alerts until they are marked as read', () => {
    let noLeidas = -1;
    servicio.noLeidas$.subscribe((n) => (noLeidas = n));
    expect(noLeidas).toBe(0);

    const hoy = new Date();
    const fecha = `${String(hoy.getDate()).padStart(2, '0')}/${String(hoy.getMonth() + 1).padStart(2, '0')}/${hoy.getFullYear()}`;
    registros$.next([registro({ fecha, horaControl: '00:00', quemadores: [60, 60, 60, 60, 60, 60] })]);
    expect(noLeidas).toBe(1);

    let alertas: any[] = [];
    servicio.alertas$.subscribe((a) => (alertas = a ?? []));
    servicio.marcarLeidas(alertas);
    expect(noLeidas).toBe(0);
  });
});
