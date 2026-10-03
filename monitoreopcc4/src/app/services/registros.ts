import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import {
  BehaviorSubject,
  Observable,
  catchError,
  finalize,
  from,
  shareReplay,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import { AuthService } from './auth';
import { GoogleDriveService, RegistroHorno } from './google-drive';

/**
 * Lectura de los controles de la planilla compartida por Historial y Dashboard.
 * Guarda la última lectura en memoria para no volver a pedirla al cambiar de pantalla.
 */
@Injectable({
  providedIn: 'root',
})
export class RegistrosService {
  private authService = inject(AuthService);
  private googleDriveService = inject(GoogleDriveService);

  // En el orden de la planilla (el más reciente al final); null si todavía no se leyó
  private registros = new BehaviorSubject<RegistroHorno[] | null>(null);
  readonly registros$ = this.registros.asObservable();

  get ultimos(): RegistroHorno[] | null {
    return this.registros.value;
  }

  constructor() {
    // Al cerrar sesión se descarta la lectura en memoria
    this.authService.user$.subscribe((user) => {
      if (!user) this.registros.next(null);
    });
  }

  // Suma a la lectura en memoria un control recién guardado (si ya se había leído la planilla)
  agregarLocal(registro: RegistroHorno): void {
    if (this.ultimos) this.registros.next([...this.ultimos, registro]);
  }

  // Se puede leer sin abrir el popup de Google (ya hay datos o token vigente)
  puedeCargarSinClic(): boolean {
    return this.ultimos != null || this.authService.tieneTokenGoogle();
  }

  // Lectura en curso: si dos pantallas (o la campana) piden a la vez, comparten la misma
  private enCurso: Observable<RegistroHorno[]> | null = null;

  cargar(): Observable<RegistroHorno[]> {
    this.enCurso ??= this.leer().pipe(
      finalize(() => (this.enCurso = null)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    return this.enCurso;
  }

  private leer(): Observable<RegistroHorno[]> {
    return from(this.authService.obtenerTokenGoogle()).pipe(
      switchMap((token) => this.googleDriveService.obtenerRegistros(token)),
      tap((registros) => this.registros.next(registros)),
      catchError((err) => {
        if (err instanceof HttpErrorResponse && err.status === 401) {
          this.authService.limpiarTokenGoogle();
        }
        return throwError(() => err);
      }),
    );
  }
}
