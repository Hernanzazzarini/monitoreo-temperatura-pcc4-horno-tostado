import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { EncabezadoComponent } from './encabezado';
import { AuthService } from '../../services/auth';
import { Alerta, NotificacionesService } from '../../services/notificaciones';

const ALERTA: Alerta = {
  id: 'a1',
  cuando: new Date(),
  titulo: 'Quemadores bajo 80 °C · 03/10/2026 09:00',
  detalle: 'Q1: 70 °C — Juan',
  conAccion: false,
};

describe('EncabezadoComponent', () => {
  let fixture: ComponentFixture<EncabezadoComponent>;
  let notificacionesMock: any;

  async function crear(admin: boolean) {
    notificacionesMock = {
      alertas$: of([ALERTA]),
      noLeidas$: of(1),
      revisarEnSilencio: vi.fn(),
      esLeida: () => false,
      marcarLeidas: vi.fn(),
      permisoNavegador: () => 'default',
    };
    await TestBed.configureTestingModule({
      imports: [EncabezadoComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            user$: of({ email: 'admin@x.com' }),
            isAdmin: () => of(admin),
            logout: () => of(),
          },
        },
        { provide: NotificacionesService, useValue: notificacionesMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(EncabezadoComponent);
    fixture.componentInstance.titulo = 'Historial';
    fixture.detectChanges();
  }

  it('shows the signed-in email and the admin link only for admins', async () => {
    await crear(true);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('admin@x.com');
    expect(el.textContent).toContain('Gestión de Usuarios');
  });

  it('hides the admin link for operators', async () => {
    await crear(false);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Gestión de Usuarios');
  });

  it('shows the unread badge and marks alerts as read when opened', async () => {
    await crear(false);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.badge')?.textContent?.trim()).toBe('1');

    (el.querySelector('.campana') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(el.querySelector('.panel')?.textContent).toContain('Q1: 70 °C');
    expect(el.querySelector('.panel')?.textContent).toContain('Sin acción correctiva');
    expect(notificacionesMock.marcarLeidas).toHaveBeenCalledWith([ALERTA]);
  });
});
