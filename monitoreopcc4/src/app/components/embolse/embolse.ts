import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { AuthService } from '../../services/auth';
import { describirErrorGoogle } from '../../services/google-drive';
import { TrazabilidadService } from '../../services/trazabilidad';
import { Lote, kgTotales, siguienteDeCalibre, unicos } from '../../trazabilidad';

// Tiempo para confirmar el cierre con un segundo toque
const CONFIRMAR_MS = 4000;

/**
 * Panel táctil de embolse: un contador +1 por cada lote en curso (pueden ir varios en paralelo,
 * uno por calibre). Al cerrar un lote empieza el siguiente programado del mismo calibre.
 */
@Component({
  selector: 'app-embolse',
  standalone: true,
  imports: [CommonModule, RouterLink, EncabezadoComponent],
  templateUrl: './embolse.html',
  styleUrls: ['../trazabilidad/trazabilidad.css', './embolse.css'],
})
export class EmbolseComponent implements OnInit {
  private authService = inject(AuthService);
  private trazabilidad = inject(TrazabilidadService);
  private destroyRef = inject(DestroyRef);

  readonly kgTotales = kgTotales;
  cola: Lote[] | null = null;
  sinRespaldo: Lote[] = [];
  puedeGenerarLotes = false;
  confirmando: string | null = null; // código del lote que espera el segundo toque
  cerrando: string | null = null;
  iniciando: string | null = null;
  mensajeExito = '';
  mensajeError = '';
  // Lotes que se están enviando a la planilla en este momento
  private respaldando = new Set<string>();
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  get enCurso(): Lote[] {
    return this.cola?.filter((l) => l.estado === 'en_curso') ?? [];
  }

  get programados(): Lote[] {
    return this.cola?.filter((l) => l.estado === 'pendiente') ?? [];
  }

  ngOnInit(): void {
    this.trazabilidad.cola$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cola) => (this.cola = cola));
    this.trazabilidad.sinRespaldo$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((lotes) => (this.sinRespaldo = lotes));
    this.authService
      .puedeGenerarLotes()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((puede) => (this.puedeGenerarLotes = puede));
    this.destroyRef.onDestroy(() => clearTimeout(this.temporizador));
  }

  estaRespaldando(lote: Lote): boolean {
    return this.respaldando.has(lote.codigo);
  }

  completo(lote: Lote): boolean {
    return lote.envases > 0 && lote.unidades >= lote.envases;
  }

  // Avance del lote en % (para la barra), tope 100
  avance(lote: Lote): number {
    return lote.envases > 0 ? Math.min(100, (lote.unidades / lote.envases) * 100) : 0;
  }

  async sumar(lote: Lote, delta: 1 | -1): Promise<void> {
    this.mensajeError = '';
    try {
      await this.trazabilidad.sumarUnidad(lote, delta);
    } catch (err) {
      console.error(err);
      this.mensajeError = `No se pudo registrar el envase del lote ${lote.codigo}. Revise la conexión.`;
    }
  }

  async iniciar(lote: Lote): Promise<void> {
    this.iniciando = lote.codigo;
    this.mensajeError = '';
    try {
      await this.trazabilidad.iniciarLote(lote);
    } catch (err) {
      console.error(err);
      this.mensajeError = `No se pudo iniciar el lote ${lote.codigo}. Revise la conexión.`;
    } finally {
      this.iniciando = null;
    }
  }

  // Primer toque: pide confirmación; segundo toque (dentro de 4 s): cierra
  async cerrar(lote: Lote): Promise<void> {
    if (this.cerrando) return;
    if (this.confirmando !== lote.codigo) {
      clearTimeout(this.temporizador);
      this.confirmando = lote.codigo;
      this.temporizador = setTimeout(() => (this.confirmando = null), CONFIRMAR_MS);
      return;
    }
    clearTimeout(this.temporizador);
    this.confirmando = null;

    // El popup de Google se abre dentro del toque (Safari bloquea los que se abren después)
    const token = this.authService.obtenerTokenGoogle();
    token.catch(() => {});

    this.cerrando = lote.codigo;
    this.mensajeExito = '';
    this.mensajeError = '';
    let cerrado: Lote;
    try {
      cerrado = await this.trazabilidad.cerrarLote(lote, siguienteDeCalibre(this.cola ?? [], lote));
    } catch (err) {
      console.error(err);
      this.mensajeError = `No se pudo cerrar el lote ${lote.codigo}. Revise la conexión.`;
      return;
    } finally {
      this.cerrando = null;
    }
    await this.respaldar(cerrado, token);
  }

  reintentar(lote: Lote): Promise<void> {
    return this.respaldar(lote, this.authService.obtenerTokenGoogle());
  }

  private async respaldar(lote: Lote, token: Promise<string>): Promise<void> {
    this.respaldando.add(lote.codigo);
    try {
      await token;
      await this.trazabilidad.respaldar(lote);
      const mp = unicos((lote.materiaPrima ?? []).map((i) => i.loteMp));
      this.mensajeExito =
        `Lote ${lote.codigo} cerrado con ${lote.unidades} envases (${kgTotales(lote)} kg). ` +
        (mp.length ? `Materia prima: ${mp.join(', ')}.` : 'Sin materia prima registrada.');
      this.mensajeError = '';
    } catch (err) {
      console.error(err);
      this.mensajeError =
        `Lote ${lote.codigo} cerrado, pero no se pudo enviar a la planilla. ` +
        describirErrorGoogle(err, 'Use "Reintentar" en Pendientes de respaldo.');
    } finally {
      this.respaldando.delete(lote.codigo);
    }
  }
}
