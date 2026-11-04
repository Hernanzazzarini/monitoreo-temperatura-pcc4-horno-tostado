import { Component, DestroyRef, ElementRef, HostListener, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { PANTALLAS, Perfil, pantallasPermitidas } from '../../permisos';
import { describirErrorGoogle } from '../../services/google-drive';
import { Alerta, NotificacionesService } from '../../services/notificaciones';

interface Enlace {
  ruta: string;
  texto: string;
}

/** Encabezado común: título, usuario conectado, navegación, notificaciones y cierre de sesión. */
@Component({
  selector: 'app-encabezado',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './encabezado.html',
  styleUrl: './encabezado.css',
})
export class EncabezadoComponent implements OnInit {
  private authService = inject(AuthService);
  private notificaciones = inject(NotificacionesService);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private host = inject(ElementRef<HTMLElement>);

  @Input() titulo = '';

  email = '';
  perfil: Perfil | null = null;
  alertas: Alerta[] | null = null;
  noLeidas = 0;
  abierto = false;
  revisando = false;
  errorRevision = '';
  // Las no leídas al abrir el panel se siguen resaltando mientras está abierto
  private nuevasAlAbrir = new Set<string>();

  ngOnInit(): void {
    this.authService.user$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((user) => (this.email = user?.email ?? ''));
    this.authService.perfil().subscribe((perfil) => (this.perfil = perfil));
    this.notificaciones.alertas$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((alertas) => (this.alertas = alertas));
    this.notificaciones.noLeidas$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((n) => (this.noLeidas = n));

    if (!this.alertas) this.notificaciones.revisarEnSilencio();
  }

  get enlaces(): Enlace[] {
    const actual = this.router.url.split('?')[0];
    const permitidas = pantallasPermitidas(this.perfil);
    const enlaces: Enlace[] = PANTALLAS.filter((p) => permitidas.includes(p.id)).map((p) => ({
      ruta: '/' + p.id,
      texto: p.texto,
    }));
    if (this.perfil?.rol === 'admin') {
      enlaces.push({ ruta: '/admin-usuarios', texto: 'Gestión de Usuarios' });
    }
    return enlaces.filter((e) => e.ruta !== actual);
  }

  get permiso() {
    return this.notificaciones.permisoNavegador();
  }

  esNueva(a: Alerta): boolean {
    return this.nuevasAlAbrir.has(a.id);
  }

  alternar(): void {
    this.abierto ? this.cerrar() : this.abrir();
  }

  private abrir(): void {
    this.abierto = true;
    const alertas = this.alertas ?? [];
    this.nuevasAlAbrir = new Set(
      alertas.filter((a) => !this.notificaciones.esLeida(a)).map((a) => a.id),
    );
    this.notificaciones.marcarLeidas(alertas);
  }

  private cerrar(): void {
    this.abierto = false;
    this.nuevasAlAbrir.clear();
  }

  revisar(): void {
    this.revisando = true;
    this.errorRevision = '';
    this.notificaciones.revisar().subscribe({
      next: () => {
        this.revisando = false;
        // Lo que llegó con el panel abierto se considera visto, pero se resalta
        const alertas = this.alertas ?? [];
        alertas
          .filter((a) => !this.notificaciones.esLeida(a))
          .forEach((a) => this.nuevasAlAbrir.add(a.id));
        this.notificaciones.marcarLeidas(alertas);
      },
      error: (err) => {
        this.revisando = false;
        this.errorRevision = describirErrorGoogle(err, 'No se pudo leer la planilla.');
      },
    });
  }

  async activarNavegador(): Promise<void> {
    await this.notificaciones.activarNavegador();
  }

  verEnHistorial(): void {
    this.cerrar();
    this.router.navigate(['/historial']);
  }

  logout(): void {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }

  @HostListener('document:click', ['$event'])
  clicAfuera(e: MouseEvent): void {
    if (this.abierto && !this.host.nativeElement.contains(e.target as Node)) this.cerrar();
  }

  @HostListener('document:keydown.escape')
  escape(): void {
    if (this.abierto) this.cerrar();
  }
}
