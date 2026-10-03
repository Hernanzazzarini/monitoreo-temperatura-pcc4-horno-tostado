import { Component, inject } from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import {
  AbstractControl,
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  Validators
} from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { from, switchMap } from 'rxjs';
import { AuthService } from '../../services/auth';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { GoogleDriveService, RegistroHorno, describirErrorGoogle } from '../../services/google-drive';
import { RegistrosService } from '../../services/registros';
import {
  LIMITES,
  TURNOS,
  Turno,
  fueraDeRango,
  hayDesvio,
  horaSetSugerida,
  horasSet,
  quemadoresCumplen,
  turnoActual
} from '../../pcc4';

const CLAVE_RESPONSABLE = 'monitoreo.responsable';
const CLAVE_TURNO = 'monitoreo.turno';

// Si hay un desvío, la acción correctiva es obligatoria
function accionCorrectivaSiFueraDeRango(group: AbstractControl): ValidationErrors | null {
  const v = group.value;
  return hayDesvio(v) && !v.accionesCorrectivas?.trim() ? { accionCorrectivaRequerida: true } : null;
}

@Component({
  selector: 'app-monitoreo',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, EncabezadoComponent],
  templateUrl: './monitoreo.html',
  styleUrl: './monitoreo.css'
})
export class MonitoreoComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private googleDriveService = inject(GoogleDriveService);
  private registrosService = inject(RegistrosService);

  get limites() {
    return LIMITES;
  }
  readonly numerosQuemador = [1, 2, 3, 4, 5, 6];
  readonly turnos = TURNOS;

  // El turno elegido se recuerda en este navegador; si no hay, el de 8 hs de la hora actual
  turno: Turno = this.leerTurnoGuardado() ?? turnoActual(new Date());
  horas: string[] = horasSet(this.turno);

  loading: boolean = false;
  mensajeExito: string = '';
  mensajeError: string = '';

  monitoreoForm: FormGroup = this.fb.group(
    {
      horaSet: [horaSetSugerida(this.turno, new Date()), [Validators.required]],
      quemadores: this.fb.array(
        this.numerosQuemador.map(() => this.fb.control<number | null>(null, Validators.required))
      ),
      velocidadBanda: [null, [Validators.required]],
      alturaCamara: [null, [Validators.required]],
      observaciones: [''],
      accionesCorrectivas: [''],
      modificaciones: [''],
      responsable: [this.leerResponsableGuardado(), [Validators.required]]
    },
    { validators: accionCorrectivaSiFueraDeRango }
  );

  get quemadores(): FormArray {
    return this.monitoreoForm.get('quemadores') as FormArray;
  }

  get quemadoresCumplen(): boolean {
    return quemadoresCumplen(this.quemadores.value);
  }

  get quemadoresCompletos(): boolean {
    return this.quemadores.valid;
  }

  get velocidadFueraDeRango(): boolean {
    return fueraDeRango(this.monitoreoForm.value.velocidadBanda, LIMITES.velocidad);
  }

  get alturaFueraDeRango(): boolean {
    return fueraDeRango(this.monitoreoForm.value.alturaCamara, LIMITES.altura);
  }

  quemadorBajo(i: number): boolean {
    const t = this.quemadores.at(i).value;
    return t != null && t !== '' && t < LIMITES.temperaturaMinQuemador;
  }

  get hayDesvio(): boolean {
    return hayDesvio(this.monitoreoForm.value);
  }

  onSubmit(): void {
    if (this.monitoreoForm.invalid) return;

    this.loading = true;
    this.mensajeExito = '';
    this.mensajeError = '';

    const v = this.monitoreoForm.value;
    const ahora = new Date();
    const registro: RegistroHorno = {
      fecha: formatDate(ahora, 'dd/MM/yyyy', 'en-US'),
      horaSet: v.horaSet,
      horaControl: formatDate(ahora, 'HH:mm', 'en-US'),
      quemadores: v.quemadores,
      velocidadBanda: v.velocidadBanda,
      alturaCamara: v.alturaCamara,
      observaciones: v.observaciones ?? '',
      accionesCorrectivas: v.accionesCorrectivas ?? '',
      modificaciones: v.modificaciones ?? '',
      responsable: v.responsable.trim()
    };

    // Pedimos (o reutilizamos) el token de Google y agregamos la fila al Sheet
    from(this.authService.obtenerTokenGoogle())
      .pipe(switchMap((token) => this.googleDriveService.agregarRegistro(token, registro)))
      .subscribe({
        next: () => {
          this.loading = false;
          this.mensajeExito = `Control de las ${registro.horaControl} guardado correctamente.`;
          this.guardarResponsable(registro.responsable);
          // Así Historial, Dashboard y las notificaciones lo ven sin volver a leer la planilla
          this.registrosService.agregarLocal(registro);
          this.monitoreoForm.reset({
            responsable: registro.responsable,
            horaSet: this.siguienteHora(registro.horaSet)
          });
        },
        error: (err) => {
          this.loading = false;
          console.error(err);
          this.mensajeError = this.describirError(err);
        }
      });
  }

  private describirError(err: any): string {
    if (err instanceof HttpErrorResponse && err.status === 401) {
      this.authService.limpiarTokenGoogle();
    }
    return describirErrorGoogle(err, 'Error al enviar el registro. Por favor, intente de nuevo.');
  }

  cambiarTurno(id: string): void {
    this.turno = TURNOS.find((t) => t.id === id) ?? this.turno;
    this.horas = horasSet(this.turno);
    this.monitoreoForm.patchValue({ horaSet: horaSetSugerida(this.turno, new Date()) });
    try {
      localStorage.setItem(CLAVE_TURNO, this.turno.id);
    } catch {}
  }

  // Después de guardar se propone el control de la hora siguiente del turno
  private siguienteHora(hora: string): string {
    const i = this.horas.indexOf(hora);
    return i >= 0 && i < this.horas.length - 1 ? this.horas[i + 1] : horaSetSugerida(this.turno, new Date());
  }

  private leerTurnoGuardado(): Turno | null {
    try {
      return TURNOS.find((t) => t.id === localStorage.getItem(CLAVE_TURNO)) ?? null;
    } catch {
      return null;
    }
  }

  // El nombre del responsable se recuerda en este navegador para no reescribirlo en cada control
  private leerResponsableGuardado(): string {
    try {
      return localStorage.getItem(CLAVE_RESPONSABLE) ?? '';
    } catch {
      return '';
    }
  }

  private guardarResponsable(nombre: string): void {
    try {
      localStorage.setItem(CLAVE_RESPONSABLE, nombre);
    } catch {}
  }




}