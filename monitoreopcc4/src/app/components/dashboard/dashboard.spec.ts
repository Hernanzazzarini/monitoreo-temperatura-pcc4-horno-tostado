import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { DashboardComponent, resumir, ultimosDias } from './dashboard';
import { AuthService } from '../../services/auth';
import { RegistroHorno } from '../../services/google-drive';
import { RegistrosService } from '../../services/registros';
import { mejorParConsecutivo } from '../../pcc4';
import { AUTH_ENCABEZADO, PROVEEDOR_NOTIFICACIONES } from '../../testing/encabezado';

function registro(parcial: Partial<RegistroHorno>): RegistroHorno {
  return {
    fecha: '02/10/2026',
    horaSet: '08:00',
    horaControl: '08:15',
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

const AHORA = new Date(2026, 9, 3, 12, 0);
const REGISTROS = [
  registro({}),
  registro({ horaControl: '10:00', velocidadBanda: 0.9, responsable: 'Ana' }),
  registro({ fecha: '03/10/2026', horaControl: '09:00', quemadores: [85, 70, 85, 70, 85, 70] }),
  registro({ fecha: '01/08/2026' }), // fuera de los últimos 30 días
];

describe('mejorParConsecutivo', () => {
  it('returns the best minimum of adjacent burners', () => {
    expect(mejorParConsecutivo([70, 82, 85, 79, 81, 75])).toBe(82);
    expect(mejorParConsecutivo([85, 70, 85, 70, 85, 70])).toBe(70);
    expect(mejorParConsecutivo([null, 90, null, 90, null, 90])).toBeNull();
  });
});

describe('resumir', () => {
  it('computes KPIs for the selected period', () => {
    const r = resumir(REGISTROS, ultimosDias(30, AHORA));
    expect(r.controles).toBe(3);
    expect(r.desvios).toBe(2);
    expect(Math.round(r.cumplimiento!)).toBe(33);
    expect(r.ultimo?.horaControl).toBe('09:00');
    expect(r.porDia.map((d) => d.valores)).toEqual([
      [1, 1],
      [0, 1],
    ]);
    expect(r.linea.par.filter((p) => p.fuera).length).toBe(1);
    expect(r.linea.velocidad.filter((p) => p.fuera).length).toBe(1);
  });

  it('includes everything with "Todo"', () => {
    expect(resumir(REGISTROS, ultimosDias(0, AHORA)).controles).toBe(4);
  });

  it('filters by a custom date range (inclusive)', () => {
    const r = resumir(REGISTROS, { desde: '2026-10-02', hasta: '2026-10-02' });
    expect(r.controles).toBe(2);
    expect(r.detalle.map((c) => c.horaControl)).toEqual(['08:15', '10:00']);
    expect(resumir(REGISTROS, { desde: '', hasta: '2026-09-30' }).controles).toBe(1);
  });

  it('handles an empty sheet', () => {
    const r = resumir([], ultimosDias(30, AHORA));
    expect(r.controles).toBe(0);
    expect(r.cumplimiento).toBeNull();
    expect(r.ultimo).toBeNull();
  });
});

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let registrosMock: any;

  beforeEach(async () => {
    registrosMock = {
      ultimos: REGISTROS,
      puedeCargarSinClic: () => true,
      cargar: vi.fn().mockReturnValue(of(REGISTROS)),
    };
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: AUTH_ENCABEZADO },
        PROVEEDOR_NOTIFICACIONES,
        { provide: RegistrosService, useValue: registrosMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();
  });

  it('renders KPIs and charts from cached data', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.cargado).toBe(true);
    expect(el.querySelectorAll('.kpi').length).toBe(4);
    expect(el.querySelectorAll('app-grafico-linea').length).toBe(3);
    expect(el.querySelectorAll('app-grafico-columnas').length).toBe(2);
    expect(el.querySelector('path.linea')?.getAttribute('d')).toMatch(/^M/);
  });
});
