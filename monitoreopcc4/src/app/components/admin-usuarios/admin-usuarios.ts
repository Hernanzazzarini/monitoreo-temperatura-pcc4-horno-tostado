import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { AuthService } from '../../services/auth';
import { EncabezadoComponent } from '../encabezado/encabezado';
import {
  PANTALLAS,
  Pantalla,
  Rol,
  pantallasDeRol,
  pantallasPermitidas,
} from '../../permisos';

@Component({
  selector: 'app-admin-usuarios',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, EncabezadoComponent],
  templateUrl: './admin-usuarios.html',
  styleUrl: './admin-usuarios.css'
})
export class AdminUsuariosComponent implements OnInit {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);

  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);

  readonly pantallas = PANTALLAS;

  usuarios: any[] = [];
  loading: boolean = true;
  creando: boolean = false;
  mensajeExito: string = '';
  mensajeError: string = '';

  nuevoUsuarioForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    role: ['operador', [Validators.required]]
  });

  // Pantallas marcadas en el alta; se reinician con las del rol al cambiarlo
  pantallasNuevo = new Set<Pantalla>(pantallasDeRol('operador'));

  // Edición de permisos de un usuario existente
  editando: string | null = null;
  seleccion = new Set<Pantalla>();
  guardando = false;
  errorPermisos = '';

  ngOnInit(): void {
    this.nuevoUsuarioForm
      .get('role')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((rol: Rol) => (this.pantallasNuevo = new Set(pantallasDeRol(rol))));
    this.cargarUsuarios();
  }

  alternar(conjunto: Set<Pantalla>, id: Pantalla): void {
    conjunto.has(id) ? conjunto.delete(id) : conjunto.add(id);
  }

  // En el orden de PANTALLAS
  private ordenadas(conjunto: Set<Pantalla>): Pantalla[] {
    return PANTALLAS.map((p) => p.id).filter((id) => conjunto.has(id));
  }

  textosPantallas(u: any): string[] {
    const permitidas = pantallasPermitidas({ rol: u.role, pantallas: u.pantallas });
    return PANTALLAS.filter((p) => permitidas.includes(p.id)).map((p) => p.texto);
  }

  editar(u: any): void {
    this.editando = u.uid;
    this.errorPermisos = '';
    this.seleccion = new Set(pantallasPermitidas({ rol: u.role, pantallas: u.pantallas }));
  }

  cancelarEdicion(): void {
    this.editando = null;
  }

  async guardarPermisos(u: any): Promise<void> {
    this.guardando = true;
    this.errorPermisos = '';
    const pantallas = this.ordenadas(this.seleccion);
    try {
      await this.authService.guardarPantallas(u.uid, pantallas);
      u.pantallas = pantallas;
      this.editando = null;
    } catch (err) {
      console.error('Error al guardar permisos:', err);
      this.errorPermisos = 'No se pudieron guardar los permisos.';
    } finally {
      this.guardando = false;
    }
  }

  async crearUsuario() {
    if (this.nuevoUsuarioForm.invalid) return;

    this.creando = true;
    this.mensajeExito = '';
    this.mensajeError = '';
    const { email, password, role } = this.nuevoUsuarioForm.value;

    try {
      await this.authService.crearUsuario(
        email.trim(),
        password,
        role,
        this.ordenadas(this.pantallasNuevo),
      );
      this.mensajeExito = `Usuario ${email} creado correctamente.`;
      this.nuevoUsuarioForm.reset({ email: '', password: '', role: 'operador' });
      await this.cargarUsuarios();
    } catch (err: any) {
      console.error('Error al crear usuario:', err);
      this.mensajeError = this.describirError(err);
    } finally {
      this.creando = false;
    }
  }

  private describirError(err: any): string {
    switch (err?.code) {
      case 'auth/email-already-in-use':
        return 'Ya existe un usuario con ese correo.';
      case 'auth/invalid-email':
        return 'El correo no es válido.';
      case 'auth/weak-password':
        return 'La contraseña es muy débil (mínimo 6 caracteres).';
      case 'permission-denied':
        return 'La cuenta se creó, pero no se pudo guardar el rol: revise las reglas de Firestore.';
    }
    return `No se pudo crear el usuario (${err?.code ?? err?.message ?? 'error desconocido'}).`;
  }

  async cargarUsuarios() {
    this.loading = true;
    try {
      const querySnapshot = await getDocs(collection(this.firestore, 'users'));
      this.usuarios = querySnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
    } finally {
      this.loading = false;
    }
  }
}