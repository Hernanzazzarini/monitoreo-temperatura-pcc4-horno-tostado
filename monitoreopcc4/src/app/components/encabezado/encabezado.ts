import { Component, DestroyRef, ElementRef, HostListener, Input, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { describirErrorGoogle } from '../../services/google-drive';
import { Alerta, NotificacionesService } from '../../services/notificaciones';

interface Enlace {
  ruta: string;
  texto: string;
  soloAdmin?: boolean;
}

const ENLACES: Enlace[] = [
  { ruta: '/monitoreo', texto: 'Nuevo control' },
  { ruta: '/historial', texto: 'Historial' },
  { ruta: '/dashboard', texto: 'Dashboard' },
  { ruta: '/admin-usuarios', texto: 'Gestión de Usuarios', soloAdmin: true },
];

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
  isAdmin = false;
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
    this.authService.isAdmin().subscribe((admin) => (this.isAdmin = admin));
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
    return ENLACES.filter((e) => e.ruta !== actual && (!e.soloAdmin || this.isAdmin));
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
