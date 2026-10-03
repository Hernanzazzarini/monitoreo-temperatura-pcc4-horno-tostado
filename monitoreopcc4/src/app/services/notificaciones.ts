import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Observable, combineLatest, interval, map, shareReplay } from 'rxjs';
import { AuthService } from './auth';
import { RegistroHorno } from './google-drive';
import { RegistrosService } from './registros';
import { fechaHoraDeControl, quemadoresBajos, quemadoresCumplen } from '../pcc4';

export interface Alerta {
  id: string;
  cuando: Date;
  titulo: string;
  detalle: string;
  conAccion: boolean; // se cargó una acción correctiva
}

const DIAS_ALERTAS = 7;
const MAX_ALERTAS = 30;
// Mientras haya token de Google vigente, se vuelve a leer la planilla cada 5 minutos
export const INTERVALO_REVISION_MS = 5 * 60 * 1000;
const CLAVE_VISTAS = 'notificaciones.vistas';

const idDe = (r: RegistroHorno) => [r.fecha, r.horaSet, r.horaControl, r.responsable].join('|');

/**
 * Controles de los últimos días en los que los quemadores no cumplieron el PCC
 * (ningún par consecutivo ≥ 80°C), del más reciente al más viejo.
 */
export function calcularAlertas(registros: RegistroHorno[], ahora: Date): Alerta[] {
  const desde = ahora.getTime() - DIAS_ALERTAS * 86400_000;
  return registros
    .flatMap((r) => {
      const cuando = fechaHoraDeControl(r.fecha, r.horaControl);
      const bajos = quemadoresBajos(r.quemadores);
      if (!cuando || cuando.getTime() < desde || !bajos.length || quemadoresCumplen(r.quemadores)) {
        return [];
      }
      return [
        {
          id: idDe(r),
          cuando,
          titulo: `Quemadores bajo 80 °C · ${r.fecha} ${r.horaSet || r.horaControl}`,
          detalle:
            bajos.map((b) => `Q${b.n}: ${b.t} °C`).join(' · ') +
            (r.responsable ? ` — ${r.responsable}` : ''),
          conAccion: !!r.accionesCorrectivas?.trim(),
        },
      ];
    })
    .sort((a, b) => b.cuando.getTime() - a.cuando.getTime())
    .slice(0, MAX_ALERTAS);
}

@Injectable({
  providedIn: 'root',
})
export class NotificacionesService {
  private authService = inject(AuthService);
  private registrosService = inject(RegistrosService);

  // null: todavía no se leyó la planilla
  readonly alertas$: Observable<Alerta[] | null> = this.registrosService.registros$.pipe(
    map((r) => (r ? calcularAlertas(r, new Date()) : null)),
    shareReplay({ bufferSize: 1, refCount: false }),
  );

  private vistas = new BehaviorSubject<Set<string>>(this.leerVistas());

  readonly noLeidas$: Observable<number> = combineLatest([this.alertas$, this.vistas]).pipe(
    map(([alertas, vistas]) => (alertas ?? []).filter((a) => !vistas.has(a.id)).length),
  );

  // Alertas ya conocidas en esta sesión: sólo las nuevas generan aviso del navegador
  private conocidas: Set<string> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.alertas$.pipe(takeUntilDestroyed(destroyRef)).subscribe((alertas) => {
      if (!alertas) {
        this.conocidas = null;
        return;
      }
      if (this.conocidas) {
        alertas.filter((a) => !this.conocidas!.has(a.id)).forEach((a) => this.avisarNavegador(a));
      }
      this.conocidas = new Set(alertas.map((a) => a.id));
    });

    interval(INTERVALO_REVISION_MS)
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(() => {
        if (this.authService.tieneTokenGoogle()) this.revisarEnSilencio();
      });
  }

  // Lee la planilla (puede abrir el popup de Google: llamar desde un clic)
  revisar(): Observable<RegistroHorno[]> {
    return this.registrosService.cargar();
  }

  // Lee sólo si se puede sin popup; los errores se ignoran (el próximo intento los reintenta)
  revisarEnSilencio(): void {
    if (this.registrosService.puedeCargarSinClic()) {
      this.registrosService.cargar().subscribe({ error: () => {} });
    }
  }

  marcarLeidas(alertas: Alerta[]): void {
    const vistas = new Set([...this.vistas.value, ...alertas.map((a) => a.id)]);
    // Guardamos sólo las más recientes para que no crezca sin límite
    const recortadas = new Set([...vistas].slice(-200));
    this.vistas.next(recortadas);
    try {
      localStorage.setItem(CLAVE_VISTAS, JSON.stringify([...recortadas]));
    } catch {}
  }

  esLeida(alerta: Alerta): boolean {
    return this.vistas.value.has(alerta.id);
  }

  permisoNavegador(): NotificationPermission | 'no-soportado' {
    return typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission;
  }

  async activarNavegador(): Promise<void> {
    if (typeof Notification !== 'undefined') await Notification.requestPermission();
  }

  private avisarNavegador(alerta: Alerta): void {
    if (this.permisoNavegador() !== 'granted') return;
    try {
      new Notification(alerta.titulo, { body: alerta.detalle, tag: alerta.id });
    } catch {}
  }

  private leerVistas(): Set<string> {
    try {
      return new Set(JSON.parse(localStorage.getItem(CLAVE_VISTAS) ?? '[]'));
    } catch {
      return new Set();
    }
  }
}
