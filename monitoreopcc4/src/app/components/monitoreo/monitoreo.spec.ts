import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { MonitoreoComponent } from './monitoreo';
import { quemadoresCumplen } from '../../pcc4';
import { AuthService } from '../../services/auth';
import { GoogleDriveService } from '../../services/google-drive';
import { AUTH_ENCABEZADO, PROVEEDOR_NOTIFICACIONES } from '../../testing/encabezado';

const CONTROL_OK = {
  horaSet: '08:00',
  quemadores: [70, 82, 85, 79, 81, 75],
  velocidadBanda: 0.5,
  alturaCamara: 6,
  observaciones: '',
  accionesCorrectivas: '',
  modificaciones: '',
  responsable: 'Juan Pérez',
};

describe('quemadoresCumplen', () => {
  it('requires two consecutive burners at or above 80°C', () => {
    expect(quemadoresCumplen([70, 80, 80, 70, 70, 70])).toBe(true);
    expect(quemadoresCumplen([85, 70, 85, 70, 85, 70])).toBe(false);
    expect(quemadoresCumplen([70, 70, 70, 70, 81, 90])).toBe(true);
  });
});

describe('MonitoreoComponent', () => {
  let component: MonitoreoComponent;
  let fixture: ComponentFixture<MonitoreoComponent>;
  let authMock: any;
  let driveMock: any;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock = {
      ...AUTH_ENCABEZADO,
      obtenerTokenGoogle: vi.fn().mockResolvedValue('token-123'),
      limpiarTokenGoogle: vi.fn(),
    };
    driveMock = { agregarRegistro: vi.fn().mockReturnValue(of({})) };

    await TestBed.configureTestingModule({
      imports: [MonitoreoComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authMock },
        PROVEEDOR_NOTIFICACIONES,
        { provide: GoogleDriveService, useValue: driveMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MonitoreoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(fixture.nativeElement.textContent).toContain('op@x.com');
  });

  it('sends the control row to Sheets with the Google token', async () => {
    component.monitoreoForm.setValue(CONTROL_OK);
    component.onSubmit();
    await fixture.whenStable();

    const [token, registro] = driveMock.agregarRegistro.mock.calls[0];
    expect(token).toBe('token-123');
    expect(registro).toMatchObject({
      horaSet: '08:00',
      quemadores: [70, 82, 85, 79, 81, 75],
      velocidadBanda: 0.5,
      alturaCamara: 6,
      responsable: 'Juan Pérez',
    });
    expect(registro.fecha).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(registro.horaControl).toMatch(/^\d{2}:\d{2}$/);
    expect(component.mensajeExito).toContain('guardado');
  });

  it('requires a corrective action when a value is out of range', () => {
    component.monitoreoForm.setValue({ ...CONTROL_OK, velocidadBanda: 0.8 });
    expect(component.hayDesvio).toBe(true);
    expect(component.monitoreoForm.invalid).toBe(true);

    component.monitoreoForm.patchValue({ accionesCorrectivas: 'Se ajustó la velocidad' });
    expect(component.monitoreoForm.valid).toBe(true);
  });

  it('flags burners when no consecutive pair reaches 80°C', () => {
    component.monitoreoForm.setValue({ ...CONTROL_OK, quemadores: [85, 70, 85, 70, 85, 70] });
    expect(component.quemadoresCumplen).toBe(false);
    expect(component.monitoreoForm.invalid).toBe(true);
  });

  it('clears the cached token when Sheets returns 401', async () => {
    driveMock.agregarRegistro.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    component.monitoreoForm.setValue(CONTROL_OK);
    component.onSubmit();
    await fixture.whenStable();

    expect(authMock.limpiarTokenGoogle).toHaveBeenCalled();
    expect(component.mensajeError).toContain('venció');
  });
});
