import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { HistorialComponent } from './historial';
import { fechaAIso } from '../../pcc4';
import { AuthService } from '../../services/auth';
import { RegistroHorno } from '../../services/google-drive';
import { RegistrosService } from '../../services/registros';
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

describe('fechaAIso', () => {
  it('normalizes sheet dates to yyyy-mm-dd', () => {
    expect(fechaAIso('2/10/2026')).toBe('2026-10-02');
    expect(fechaAIso('02/10/2026')).toBe('2026-10-02');
    expect(fechaAIso('basura')).toBe('');
  });
});

describe('HistorialComponent', () => {
  let component: HistorialComponent;
  let fixture: ComponentFixture<HistorialComponent>;
  let authMock: any;
  let driveMock: any;

  beforeEach(async () => {
    authMock = AUTH_ENCABEZADO;
    driveMock = {
      ultimos: null,
      puedeCargarSinClic: () => false,
      cargar: vi.fn().mockReturnValue(
        of([
          registro({ horaControl: '08:15' }),
          registro({ fecha: '03/10/2026', horaControl: '09:00', velocidadBanda: 0.9 }),
        ])
      ),
    };

    await TestBed.configureTestingModule({
      imports: [HistorialComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        PROVEEDOR_NOTIFICACIONES,
        { provide: RegistrosService, useValue: driveMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HistorialComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('waits for a click when there is no Google token yet', () => {
    expect(driveMock.cargar).not.toHaveBeenCalled();
    expect(component.cargado).toBe(false);
  });

  it('loads newest first and filters by date and deviations', async () => {
    component.cargar();
    await fixture.whenStable();

    expect(component.registros.map((r) => r.horaControl)).toEqual(['09:00', '08:15']);
    expect(component.cantidadDesvios).toBe(1);

    component.soloDesvios = true;
    expect(component.registrosFiltrados.map((r) => r.horaControl)).toEqual(['09:00']);

    component.soloDesvios = false;
    component.filtroHasta = '2026-10-02';
    expect(component.registrosFiltrados.map((r) => r.horaControl)).toEqual(['08:15']);

    component.filtroHasta = '';
    component.filtroDesde = '2026-10-03';
    expect(component.registrosFiltrados.map((r) => r.horaControl)).toEqual(['09:00']);

    component.filtroDesde = '2026-10-02';
    component.filtroHasta = '2026-10-03';
    expect(component.registrosFiltrados.length).toBe(2);
  });
});
