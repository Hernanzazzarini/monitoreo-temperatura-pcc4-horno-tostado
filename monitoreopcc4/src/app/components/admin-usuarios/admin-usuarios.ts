import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Firestore, collection, getDocs } from '@angular/fire/firestore';
import { AuthService } from '../../services/auth';
import { EncabezadoComponent } from '../encabezado/encabezado';

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

  ngOnInit(): void {
    this.cargarUsuarios();
  }

  async crearUsuario() {
    if (this.nuevoUsuarioForm.invalid) return;

    this.creando = true;
    this.mensajeExito = '';
    this.mensajeError = '';
    const { email, password, role } = this.nuevoUsuarioForm.value;

    try {
      await this.authService.crearUsuario(email.trim(), password, role);
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