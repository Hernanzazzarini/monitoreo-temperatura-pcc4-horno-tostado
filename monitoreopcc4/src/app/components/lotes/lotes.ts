import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, merge, switchMap, tap } from 'rxjs';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { LotesExistentesError, TrazabilidadService } from '../../services/trazabilidad';
import {
  CALIBRES,
  Lote,
  PATRON_CODIGO,
  correlativos,
  kgTotales,
  normalizarCodigo,
  siguienteCodigo,
  unicos,
} from '../../trazabilidad';

const MAX_LOTES = 50;

/** Encargada: programa los lotes de embolse (uno o varios correlativos) con sus datos. */
@Component({
  selector: 'app-lotes',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterLink, EncabezadoComponent],
  templateUrl: './lotes.html',
  styleUrls: ['../trazabilidad/trazabilidad.css', './lotes.css'],
})
export class LotesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private trazabilidad = inject(TrazabilidadService);
  private destroyRef = inject(DestroyRef);

  readonly maxLotes = MAX_LOTES;
  readonly calibres = CALIBRES;
  readonly kgTotales = kgTotales;
  cola: Lote[] | null = null;
  terminados: Lote[] | null = null;
  generando = false;
  mensajeExito = '';
  mensajeError = '';
  // Códigos de la vista previa que ya existen (los lotes son únicos)
  repetidos: string[] = [];
  verificando = false;
  // Edición de la observación de un lote de la cola
  editando: string | null = null;
  textoObservacion = '';

  form = this.fb.nonNullable.group({
    codigo: ['', [Validators.required, Validators.pattern(PATRON_CODIGO), Validators.maxLength(40)]],
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(MAX_LOTES)]],
    calibre: ['', Validators.required],
    cliente: ['', Validators.required],
    envases: [null as number | null, [Validators.required, Validators.min(1)]],
    kgPorEnvase: [null as number | null, [Validators.required, Validators.min(0.01)]],
    observacion: ['', Validators.maxLength(500)],
  });

  ngOnInit(): void {
    this.trazabilidad.cola$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cola) => (this.cola = cola));
    this.trazabilidad.terminados$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => (this.terminados = t));

    // Mientras se escribe, avisa si algún código ya existe
    merge(this.form.controls.codigo.valueChanges, this.form.controls.cantidad.valueChanges)
      .pipe(
        tap(() => {
          this.repetidos = [];
          this.verificando = this.codigos.length > 0;
        }),
        debounceTime(400),
        switchMap(() => this.verificar()),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((repetidos) => {
        this.repetidos = repetidos;
        this.verificando = false;
      });
  }

  private async verificar(): Promise<string[]> {
    const codigos = this.codigos;
    if (!codigos.length) return [];
    try {
      return await this.trazabilidad.codigosExistentes(codigos);
    } catch (err) {
      console.error('No se pudo verificar si los lotes existen:', err);
      return []; // igual lo controla la transacción al generar
    }
  }

  // Correlativo del último lote programado, para cargarlo con un toque
  get sugerido(): string | null {
    const todos = [...(this.cola ?? []), ...(this.terminados ?? [])];
    if (!todos.length) return null;
    const ultimo = todos.reduce((a, b) => (b.orden > a.orden ? b : a));
    const siguiente = siguienteCodigo(ultimo.codigo);
    return siguiente && siguiente !== normalizarCodigo(this.form.controls.codigo.value)
      ? siguiente
      : null;
  }

  usarSugerido(): void {
    if (this.sugerido) this.form.controls.codigo.setValue(this.sugerido);
  }

  // Vista previa de los códigos a generar ([] si el código todavía no es válido)
  get codigos(): string[] {
    const { codigo, cantidad } = this.form.controls;
    if (codigo.invalid || cantidad.invalid) return [];
    return correlativos(normalizarCodigo(codigo.value), cantidad.value) ?? [];
  }

  get sinCorrelativo(): boolean {
    const { codigo, cantidad } = this.form.controls;
    return codigo.valid && cantidad.valid && !this.codigos.length;
  }

  get puedeGenerar(): boolean {
    return (
      this.codigos.length > 0 &&
      this.form.valid &&
      !this.repetidos.length &&
      !this.verificando &&
      !this.generando
    );
  }

  async generar(): Promise<void> {
    const codigos = this.codigos;
    if (!this.puedeGenerar) return;
    const v = this.form.getRawValue();

    this.generando = true;
    this.mensajeExito = '';
    this.mensajeError = '';
    try {
      await this.trazabilidad.generarLotes(codigos, {
        cliente: v.cliente.trim(),
        calibre: v.calibre,
        envases: v.envases!,
        kgPorEnvase: v.kgPorEnvase!,
        observacion: v.observacion.trim(),
      });
      this.mensajeExito =
        codigos.length === 1
          ? `Lote ${codigos[0]} agregado a la cola.`
          : `${codigos.length} lotes agregados a la cola: ${codigos[0]} a ${codigos[codigos.length - 1]}.`;
      // Se mantienen cliente, calibre, envases y kg para programar el siguiente
      this.form.patchValue({
        codigo: siguienteCodigo(codigos[codigos.length - 1]) ?? '',
        cantidad: 1,
        observacion: '',
      });
    } catch (err) {
      console.error(err);
      if (err instanceof LotesExistentesError) {
        this.repetidos = err.codigos;
        this.mensajeError = `No se generó nada: ya existen ${err.codigos.join(', ')}. Los lotes no se pueden repetir.`;
      } else {
        this.mensajeError = 'No se pudieron generar los lotes. Revise la conexión y los permisos.';
      }
    } finally {
      this.generando = false;
    }
  }

  editarObservacion(lote: Lote): void {
    this.editando = lote.codigo;
    this.textoObservacion = lote.observacion ?? '';
  }

  async guardarObservacion(lote: Lote): Promise<void> {
    try {
      await this.trazabilidad.guardarObservacion(lote, this.textoObservacion.trim().slice(0, 500));
      this.editando = null;
    } catch (err) {
      console.error(err);
      this.mensajeError = `No se pudo guardar la observación del lote ${lote.codigo}.`;
    }
  }

  // Lotes MP distintos con sus envases: "MP123 (env. 1, 2)"
  lotesMp(lote: Lote): string[] {
    const mp = lote.materiaPrima ?? [];
    return unicos(mp.map((i) => i.loteMp)).map((loteMp) => {
      const envases = mp.filter((i) => i.loteMp === loteMp).map((i) => i.envase);
      return `${loteMp} (env. ${envases.join(', ')})`;
    });
  }

  async quitar(lote: Lote): Promise<void> {
    if (!confirm(`¿Quitar el lote ${lote.codigo} de la cola?`)) return;
    try {
      await this.trazabilidad.quitarDeCola(lote);
    } catch (err) {
      console.error(err);
      this.mensajeError = `No se pudo quitar el lote ${lote.codigo}.`;
    }
  }
}
