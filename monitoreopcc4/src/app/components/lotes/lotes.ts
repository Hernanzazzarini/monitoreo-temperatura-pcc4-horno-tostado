import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { LotesExistentesError, TrazabilidadService } from '../../services/trazabilidad';
import { Lote, generarCodigos, unicos } from '../../trazabilidad';

const MAX_LOTES = 50;

/** Encargada: genera en un paso la secuencia de lotes correlativos de un cliente. */
@Component({
  selector: 'app-lotes',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, EncabezadoComponent],
  templateUrl: './lotes.html',
  styleUrls: ['../trazabilidad/trazabilidad.css', './lotes.css'],
})
export class LotesComponent implements OnInit {
  private fb = inject(FormBuilder);
  private trazabilidad = inject(TrazabilidadService);
  private destroyRef = inject(DestroyRef);

  readonly maxLotes = MAX_LOTES;
  cola: Lote[] | null = null;
  terminados: Lote[] | null = null;
  generando = false;
  mensajeExito = '';
  mensajeError = '';

  form = this.fb.nonNullable.group({
    cliente: ['', [Validators.required, Validators.pattern(/^\d{1,2}$/)]],
    anio: [new Date().getFullYear(), [Validators.required, Validators.min(2000), Validators.max(2099)]],
    desde: [1, [Validators.required, Validators.min(1), Validators.max(999)]],
    cantidad: [1, [Validators.required, Validators.min(1), Validators.max(MAX_LOTES)]],
  });

  ngOnInit(): void {
    this.trazabilidad.cola$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cola) => (this.cola = cola));
    this.trazabilidad.terminados$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((t) => (this.terminados = t));

    // Al elegir cliente o año se propone el primer correlativo libre
    this.form.controls.cliente.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.proponerDesde());
    this.form.controls.anio.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.proponerDesde());
  }

  private get cliente(): string {
    return this.form.controls.cliente.value.padStart(2, '0');
  }

  // Vista previa de los códigos a generar
  get codigos(): string[] {
    const { desde, cantidad, anio } = this.form.getRawValue();
    if (this.form.invalid || desde + cantidad - 1 > 999) return [];
    return generarCodigos(this.cliente, desde, cantidad, anio);
  }

  get pasaDe999(): boolean {
    const { desde, cantidad } = this.form.getRawValue();
    return desde + cantidad - 1 > 999;
  }

  private async proponerDesde(): Promise<void> {
    const { cliente, anio } = this.form.controls;
    if (cliente.invalid || anio.invalid) return;
    try {
      const desde = await this.trazabilidad.siguienteNumero(this.cliente, anio.value);
      this.form.controls.desde.setValue(desde);
    } catch (err) {
      console.error('No se pudo consultar el último lote del cliente:', err);
    }
  }

  async generar(): Promise<void> {
    const codigos = this.codigos;
    if (!codigos.length) return;
    const { desde, cantidad, anio } = this.form.getRawValue();

    this.generando = true;
    this.mensajeExito = '';
    this.mensajeError = '';
    try {
      await this.trazabilidad.generarLotes(this.cliente, desde, cantidad, anio);
      this.mensajeExito =
        codigos.length === 1
          ? `Lote ${codigos[0]} agregado a la cola.`
          : `${codigos.length} lotes agregados a la cola: ${codigos[0]} a ${codigos[codigos.length - 1]}.`;
      this.form.controls.desde.setValue(desde + cantidad);
    } catch (err) {
      console.error(err);
      this.mensajeError =
        err instanceof LotesExistentesError
          ? `Ya existen: ${err.codigos.join(', ')}. Cambie el número inicial.`
          : 'No se pudieron generar los lotes. Revise la conexión y los permisos.';
    } finally {
      this.generando = false;
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
