import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { take } from 'rxjs';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  errorMessage: string = '';
  loading: boolean = false;

  onSubmit() {
    if (this.loginForm.invalid) return;

    this.loading = true;
    this.errorMessage = '';
    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: () => {
        // Al iniciar sesión con éxito, verificamos si es admin o redirigimos al monitoreo
        this.authService.isAdmin().pipe(take(1)).subscribe(isAdmin => {
          this.loading = false;
          if (isAdmin) {
            this.router.navigate(['/admin-usuarios']);
          } else {
            this.router.navigate(['/monitoreo']);
          }
        });
      },
      error: (err) => {
        this.loading = false;
        this.errorMessage = this.describirError(err);
        console.error(err);
      }
    });
  }

  private describirError(err: any): string {
    switch (err?.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
      case 'auth/invalid-email':
        return 'Correo o contraseña incorrectos. Por favor, verifique sus datos.';
      case 'auth/operation-not-allowed':
        return 'El acceso con correo y contraseña no está habilitado en Firebase.';
      case 'auth/user-disabled':
        return 'Esta cuenta está deshabilitada. Consulte al administrador.';
      case 'auth/too-many-requests':
        return 'Demasiados intentos fallidos. Espere unos minutos o restablezca la contraseña.';
      case 'auth/network-request-failed':
        return 'No hay conexión con el servidor. Verifique su conexión a internet.';
    }
    return `No se pudo iniciar sesión (${err?.code ?? err?.message ?? 'error desconocido'}).`;
  }
}