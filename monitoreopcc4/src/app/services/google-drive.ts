import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Observable, map, switchMap, tap } from 'rxjs';
import { environment } from '../../environments/environment';

// Planilla "TEMPERATURA DE HORNO - PCC N°4": columnas A (Fecha) a O (Responsable)
const RANGO_PLANILLA = 'Hoja 1!A:O';

export interface RegistroHorno {
  fecha: string; // dd/mm/aaaa
  horaSet: string; // HH:mm
  horaControl: string; // HH:mm
  quemadores: (number | null)[]; // 6 temperaturas en °C (null = celda vacía)
  velocidadBanda: number | null;
  alturaCamara: number | null;
  observaciones: string;
  accionesCorrectivas: string;
  modificaciones: string;
  responsable: string;
}

@Injectable({
  providedIn: 'root'
})
export class GoogleDriveService {
  private http = inject(HttpClient);
  private spreadsheetId = environment.spreadsheetId;

  /**
   * Agrega una fila de control del horno al Google Sheet.
   * @param accessToken Token de acceso OAuth de Google con scope de Sheets
   */
  agregarRegistro(accessToken: string, registro: RegistroHorno): Observable<any> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(RANGO_PLANILLA)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    });

    const body = {
      values: [
        [
          registro.fecha,
          registro.horaSet,
          registro.horaControl,
          ...registro.quemadores,
          registro.velocidadBanda,
          registro.alturaCamara,
          registro.observaciones,
          registro.accionesCorrectivas,
          registro.modificaciones,
          registro.responsable
        ]
      ]
    };

    return this.http.post(url, body, { headers });
  }

  /**
   * Lee los controles cargados en el Google Sheet (en el orden de la planilla).
   * Los números vienen sin formato (evita "0,5" vs "0.5") y las fechas/horas como texto.
   */
  obtenerRegistros(accessToken: string): Observable<RegistroHorno[]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}/values/${encodeURIComponent(RANGO_PLANILLA)}?valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=FORMATTED_STRING`;

    const headers = new HttpHeaders({
      'Authorization': `Bearer ${accessToken}`
    });

    return this.http
      .get<{ values?: unknown[][] }>(url, { headers })
      .pipe(map((res) => (res.values ?? []).filter(esFilaDeControl).map(filaARegistro)));
  }

  // Solapas que ya se sabe que existen en la planilla (para no consultarlo en cada fila)
  private solapasExistentes = new Set<string>();

  /**
   * Agrega una fila al final de una solapa de la misma planilla (Inyeccion_MP, Lotes_Terminados).
   * Si la solapa no existe, la crea con su fila de encabezado.
   */
  agregarFila(
    accessToken: string,
    solapa: string,
    encabezado: string[],
    fila: (string | number)[],
  ): Observable<any> {
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    const base = `https://sheets.googleapis.com/v4/spreadsheets/${this.spreadsheetId}`;
    const rango = encodeURIComponent(`'${solapa}'!A1`);
    const agregar = (values: (string | number)[][]) =>
      this.http.post(
        `${base}/values/${rango}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
        { values },
        { headers },
      );

    if (this.solapasExistentes.has(solapa)) return agregar([fila]);

    return this.http
      .get<{ sheets?: { properties: { title: string } }[] }>(
        `${base}?fields=sheets.properties.title`,
        { headers },
      )
      .pipe(
        switchMap((res) => {
          (res.sheets ?? []).forEach((s) => this.solapasExistentes.add(s.properties.title));
          if (this.solapasExistentes.has(solapa)) return agregar([fila]);
          return this.http
            .post(
              `${base}:batchUpdate`,
              { requests: [{ addSheet: { properties: { title: solapa } } }] },
              { headers },
            )
            .pipe(
              tap(() => this.solapasExistentes.add(solapa)),
              switchMap(() => agregar([encabezado, fila])),
            );
        }),
      );
  }
}

// Las filas de encabezado tienen texto en las columnas de quemadores; las de datos, números
function esFilaDeControl(fila: unknown[]): boolean {
  return fila.slice(3, 9).some((v) => typeof v === 'number');
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

// Si la columna de la planilla tiene formato "número", Sheets devuelve la fecha como
// número de serie (días desde el 30/12/1899) y la hora como fracción del día.
export function serieAFecha(serie: number): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serie) * 86400_000);
  return `${dosDigitos(d.getUTCDate())}/${dosDigitos(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

export function serieAHora(serie: number): string {
  const minutos = Math.round((serie - Math.floor(serie)) * 1440) % 1440;
  return `${dosDigitos(Math.floor(minutos / 60))}:${dosDigitos(minutos % 60)}`;
}

function filaARegistro(fila: unknown[]): RegistroHorno {
  const texto = (i: number) => (fila[i] == null ? '' : String(fila[i]));
  const numero = (i: number) => (typeof fila[i] === 'number' ? (fila[i] as number) : null);
  const fecha = (i: number) => (typeof fila[i] === 'number' ? serieAFecha(fila[i]) : texto(i));
  const hora = (i: number) => (typeof fila[i] === 'number' ? serieAHora(fila[i]) : texto(i));
  return {
    fecha: fecha(0),
    horaSet: hora(1),
    horaControl: hora(2),
    quemadores: [3, 4, 5, 6, 7, 8].map(numero),
    velocidadBanda: numero(9),
    alturaCamara: numero(10),
    observaciones: texto(11),
    accionesCorrectivas: texto(12),
    modificaciones: texto(13),
    responsable: texto(14)
  };
}

export function describirErrorGoogle(err: any, mensajePorDefecto: string): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 401) return 'La autorización de Google venció. Vuelva a intentar.';
    if (err.status === 403 || err.status === 404) {
      return 'Su cuenta de Google no tiene acceso a la planilla de monitoreo. Consulte al administrador.';
    }
  }
  switch (err?.code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Debe autorizar con su cuenta de Google para acceder a la planilla.';
    case 'auth/popup-blocked':
      return 'El navegador bloqueó la ventana de Google. Habilite las ventanas emergentes para este sitio.';
    case 'auth/credential-already-in-use':
      return 'Esa cuenta de Google ya está asociada a otro usuario del sistema.';
    case 'auth/user-mismatch':
      return 'Debe elegir la misma cuenta de Google que vinculó anteriormente.';
    case 'auth/operation-not-allowed':
      return 'El inicio con Google no está habilitado en Firebase. Consulte al administrador.';
  }
  return mensajePorDefecto;
}
