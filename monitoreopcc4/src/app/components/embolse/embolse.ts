import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { AuthService } from '../../services/auth';
import { describirErrorGoogle } from '../../services/google-drive';
import { TrazabilidadService } from '../../services/trazabilidad';
import { Lote, unicos } from '../../trazabilidad';

// Tiempo para confirmar el cierre con un segundo toque
const CONFIRMAR_MS = 4000;

/** Panel táctil de embolse: +1 por unidad y cierre del lote, que pasa al siguiente de la cola. */
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

  cola: Lote[] | null = null;
  sinRespaldo: Lote[] = [];
  puedeGenerarLotes = false;
  confirmando = false;
  cerrando = false;
  mensajeExito = '';
  mensajeError = '';
  // Lotes que se están enviando a la planilla en este momento
  private respaldando = new Set<string>();
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  get actual(): Lote | undefined {
    return this.cola?.[0];
  }

  get siguientes(): Lote[] {
    return this.cola?.slice(1) ?? [];
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

  async sumar(delta: 1 | -1): Promise<void> {
    const lote = this.actual;
    if (!lote) return;
    this.mensajeError = '';
    try {
      await this.trazabilidad.sumarUnidad(lote, delta);
    } catch (err) {
      console.error(err);
      this.mensajeError = 'No se pudo registrar la unidad. Revise la conexión.';
    }
  }

  // Primer toque: pide confirmación; segundo toque (dentro de 4 s): cierra
  async cerrar(): Promise<void> {
    const lote = this.actual;
    if (!lote || this.cerrando) return;
    if (!this.confirmando) {
      this.confirmando = true;
      this.temporizador = setTimeout(() => (this.confirmando = false), CONFIRMAR_MS);
      return;
    }
    clearTimeout(this.temporizador);
    this.confirmando = false;

    // El popup de Google se abre dentro del toque (Safari bloquea los que se abren después)
    const token = this.authService.obtenerTokenGoogle();
    token.catch(() => {});

    this.cerrando = true;
    this.mensajeExito = '';
    this.mensajeError = '';
    let cerrado: Lote;
    try {
      cerrado = await this.trazabilidad.cerrarLote(lote, this.siguientes[0]);
    } catch (err) {
      console.error(err);
      this.mensajeError = `No se pudo cerrar el lote ${lote.codigo}. Revise la conexión.`;
      return;
    } finally {
      this.cerrando = false;
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
        `Lote ${lote.codigo} cerrado con ${lote.unidades} unidades. ` +
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
