import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { AuthService } from '../../services/auth';
import { describirErrorGoogle } from '../../services/google-drive';
import { TrazabilidadService } from '../../services/trazabilidad';
import { Inyeccion, Lote } from '../../trazabilidad';

const CLAVE_PROVEEDOR = 'inyeccion.proveedor';

/** Tolva: registra cada envase de materia prima que se carga. */
@Component({
  selector: 'app-inyeccion-mp',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, EncabezadoComponent],
  templateUrl: './inyeccion-mp.html',
  styleUrls: ['../trazabilidad/trazabilidad.css'],
})
export class InyeccionMpComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private trazabilidad = inject(TrazabilidadService);
  private destroyRef = inject(DestroyRef);

  loteEnCurso: Lote | null = null;
  ultimas: Inyeccion[] | null = null;
  guardando = false;
  mensajeExito = '';
  mensajeError = '';

  form = this.fb.nonNullable.group({
    loteMp: ['', Validators.required],
    envase: ['', Validators.required],
    proveedor: [this.leerProveedor()],
  });

  ngOnInit(): void {
    this.trazabilidad.cola$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((cola) => (this.loteEnCurso = cola[0] ?? null));
    this.trazabilidad.ultimasInyecciones$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((u) => (this.ultimas = u));
  }

  async registrar(): Promise<void> {
    if (this.form.invalid) return;
    // El popup de Google se abre dentro del clic (Safari bloquea los que se abren después)
    const token = this.authService.obtenerTokenGoogle();
    token.catch(() => {});

    const v = this.form.getRawValue();
    this.guardando = true;
    this.mensajeExito = '';
    this.mensajeError = '';

    let inyeccion: Inyeccion;
    try {
      inyeccion = await this.trazabilidad.registrarInyeccion({
        loteMp: v.loteMp.trim(),
        envase: v.envase.trim(),
        proveedor: v.proveedor.trim(),
        loteEnCurso: this.loteEnCurso?.codigo ?? '',
      });
    } catch (err) {
      console.error(err);
      this.guardando = false;
      this.mensajeError = 'No se pudo registrar el envase. Revise la conexión y vuelva a intentar.';
      return;
    }

    this.guardarProveedor(inyeccion.proveedor);
    // Queda listo para el próximo envase del mismo lote de MP
    this.form.reset({ loteMp: inyeccion.loteMp, envase: '', proveedor: inyeccion.proveedor });

    try {
      await this.trazabilidad.respaldarInyeccion(inyeccion, await token);
      this.mensajeExito = `Envase ${inyeccion.envase} (lote MP ${inyeccion.loteMp}) registrado.`;
    } catch (err) {
      console.error(err);
      this.mensajeError =
        `Envase ${inyeccion.envase} registrado, pero no se copió a la solapa Inyeccion_MP. ` +
        describirErrorGoogle(err, '') +
        ' Igual queda asociado al lote.';
    } finally {
      this.guardando = false;
    }
  }

  private leerProveedor(): string {
    try {
      return localStorage.getItem(CLAVE_PROVEEDOR) ?? '';
    } catch {
      return '';
    }
  }

  private guardarProveedor(proveedor: string): void {
    try {
      localStorage.setItem(CLAVE_PROVEEDOR, proveedor);
    } catch {}
  }
}
