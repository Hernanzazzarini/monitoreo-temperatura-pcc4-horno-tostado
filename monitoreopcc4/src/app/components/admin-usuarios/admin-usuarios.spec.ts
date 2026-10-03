import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Firestore } from '@angular/fire/firestore';
import { of } from 'rxjs';

import { AdminUsuariosComponent } from './admin-usuarios';
import { AuthService } from '../../services/auth';
import { AUTH_ENCABEZADO, PROVEEDOR_NOTIFICACIONES } from '../../testing/encabezado';

describe('AdminUsuariosComponent', () => {
  let component: AdminUsuariosComponent;
  let fixture: ComponentFixture<AdminUsuariosComponent>;
  let authMock: any;

  beforeEach(async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    authMock = { ...AUTH_ENCABEZADO, crearUsuario: vi.fn().mockResolvedValue('uid-nuevo') };
    await TestBed.configureTestingModule({
      imports: [AdminUsuariosComponent],
      providers: [
        provideRouter([]),
        { provide: Firestore, useValue: {} },
        { provide: AuthService, useValue: authMock },
        PROVEEDOR_NOTIFICACIONES,
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminUsuariosComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('creates a user with the form data', async () => {
    component.nuevoUsuarioForm.setValue({ email: 'op@x.com', password: 'secreta1', role: 'operador' });
    await component.crearUsuario();

    expect(authMock.crearUsuario).toHaveBeenCalledWith('op@x.com', 'secreta1', 'operador');
    expect(component.mensajeExito).toContain('op@x.com');
  });

  it('shows a clear message when the email already exists', async () => {
    authMock.crearUsuario.mockRejectedValue({ code: 'auth/email-already-in-use' });
    component.nuevoUsuarioForm.setValue({ email: 'op@x.com', password: 'secreta1', role: 'operador' });
    await component.crearUsuario();

    expect(component.mensajeError).toBe('Ya existe un usuario con ese correo.');
  });
});
