// Trazabilidad del proceso de tostado: lotes programados, inyección de MP y embolse
import { formatDate } from '@angular/common';
import { RegistroHorno } from './services/google-drive';
import { fechaHoraDeControl, hayDesvio, mejorParConsecutivo } from './pcc4';

export type EstadoLote = 'pendiente' | 'en_curso' | 'cerrado';

// Salidas de embolse: cada calibre tiene su propia fila de lotes y pueden embolsarse en paralelo
export const CALIBRES = ['Split', 'Recupero electrónica', 'Detector metales', 'Barrido'];

export interface Lote {
  codigo: string; // lo escribe la encargada (la lotificación varía según el producto)
  cliente: string; // a qué cliente va el lote
  calibre: string; // uno de CALIBRES
  envases: number; // envases programados para el lote
  kgPorEnvase: number;
  orden: number; // posición en la cola (menor = primero)
  estado: EstadoLote;
  unidades: number; // envases embolsados
  inicio: Date | null; // al cerrar el anterior del mismo calibre, al iniciarlo o con el primer +1
  fin: Date | null;
  respaldado?: boolean; // false: cerrado pero todavía no se envió a la planilla
  cerradoPor?: string;
  materiaPrima?: Inyeccion[]; // envases que formaron el lote, guardados al cerrarlo
  observacion?: string; // de la encargada, para el personal de inyección y embolse
  observacionPor?: string;
}

export interface Inyeccion {
  id?: string;
  fecha: Date;
  loteMp: string;
  envase: string;
  proveedor: string;
  loteEnCurso: string;
  responsable: string;
}

export const SOLAPA_INYECCION = 'Inyeccion_MP';
export const SOLAPA_LOTES = 'Lotes_Terminados';

export const ENCABEZADO_INYECCION = [
  'Fecha',
  'Hora',
  'N° Lote MP',
  'N° Envase',
  'Proveedor',
  'Lote en curso',
  'Responsable',
];

export const ENCABEZADO_LOTES = [
  'Lote',
  'Cliente',
  'Calibre',
  'Inicio',
  'Fin',
  'Duración (min)',
  'Envases programados',
  'Envases embolsados',
  'Kg por envase',
  'Kg totales',
  'Lotes MP',
  'Envases (lote MP / envase)',
  'Proveedores',
  'Controles de horno',
  'Horas de control',
  'Mejor par quemadores mín. (°C)',
  'Controles con desvío',
  'Cerrado por',
  'Observación encargada',
];

// El código es el id del documento en Firestore: sin "/" y en mayúsculas
export const PATRON_CODIGO = /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/;
export const normalizarCodigo = (codigo: string) => codigo.trim().toUpperCase();

/**
 * Correlativo siguiente: suma 1 al grupo de dígitos más largo, respetando sus ceros
 * (RT01001H26 → RT01002H26, 2610-07 → 2611-07). null si el código no tiene números.
 */
export function siguienteCodigo(codigo: string): string | null {
  const grupos = [...codigo.matchAll(/\d+/g)];
  if (!grupos.length) return null;
  const g = grupos.reduce((a, b) => (b[0].length > a[0].length ? b : a));
  const numero = String(Number(g[0]) + 1).padStart(g[0].length, '0');
  return codigo.slice(0, g.index) + numero + codigo.slice(g.index! + g[0].length);
}

// El primer código y sus correlativos; null si se piden varios de un código sin números
export function correlativos(primero: string, cantidad: number): string[] | null {
  const codigos = [primero];
  while (codigos.length < cantidad) {
    const siguiente = siguienteCodigo(codigos[codigos.length - 1]);
    if (!siguiente) return null;
    codigos.push(siguiente);
  }
  return codigos;
}

// Cola de embolse: pendientes y en curso, en el orden en que se generaron
export function ordenarCola(lotes: Lote[]): Lote[] {
  return lotes.filter((l) => l.estado !== 'cerrado').sort((a, b) => a.orden - b.orden);
}

// Al cerrar un lote sigue el próximo pendiente del mismo calibre (los otros calibres siguen solos)
export function siguienteDeCalibre(cola: Lote[], cerrado: Lote): Lote | undefined {
  return ordenarCola(cola).find(
    (l) => l.estado === 'pendiente' && l.codigo !== cerrado.codigo && l.calibre === cerrado.calibre,
  );
}

export const kgTotales = (lote: Pick<Lote, 'unidades' | 'kgPorEnvase'>) =>
  Math.round(lote.unidades * (lote.kgPorEnvase || 0) * 100) / 100;

/**
 * Lo que corresponde a la ventana [inicio, fin] de un lote: lo ocurrido dentro de la ventana
 * más lo último anterior al inicio (el envase que seguía en la tolva / el control vigente).
 */
export function enVentana<T>(
  items: T[],
  momento: (item: T) => Date | null,
  inicio: Date,
  fin: Date,
): T[] {
  const conFecha = items
    .map((item) => ({ item, t: momento(item) }))
    .filter((x): x is { item: T; t: Date } => x.t != null)
    .sort((a, b) => a.t.getTime() - b.t.getTime());
  const anteriores = conFecha.filter((x) => x.t < inicio);
  const dentro = conFecha.filter((x) => x.t >= inicio && x.t <= fin);
  return [...anteriores.slice(-1), ...dentro].map((x) => x.item);
}

export function controlesDelLote(registros: RegistroHorno[], inicio: Date, fin: Date) {
  return enVentana(registros, (r) => fechaHoraDeControl(r.fecha, r.horaControl), inicio, fin);
}

export function inyeccionesDelLote(inyecciones: Inyeccion[], inicio: Date, fin: Date) {
  return enVentana(inyecciones, (i) => i.fecha, inicio, fin);
}

const fechaHora = (d: Date) => formatDate(d, 'dd/MM/yyyy HH:mm', 'en-US');
export const unicos = (valores: string[]) => [...new Set(valores.filter((v) => v))];

export function filaInyeccion(i: Inyeccion): (string | number)[] {
  return [
    formatDate(i.fecha, 'dd/MM/yyyy', 'en-US'),
    formatDate(i.fecha, 'HH:mm', 'en-US'),
    i.loteMp,
    i.envase,
    i.proveedor,
    i.loteEnCurso,
    i.responsable,
  ];
}

export function filaLoteTerminado(
  lote: Lote,
  inyecciones: Inyeccion[],
  controles: RegistroHorno[],
): (string | number)[] {
  const inicio = lote.inicio ?? lote.fin!;
  const fin = lote.fin!;
  const pares = controles
    .map((c) => mejorParConsecutivo(c.quemadores))
    .filter((t): t is number => t != null);
  return [
    lote.codigo,
    lote.cliente,
    lote.calibre ?? '',
    fechaHora(inicio),
    fechaHora(fin),
    Math.round((fin.getTime() - inicio.getTime()) / 60000),
    lote.envases ?? '',
    lote.unidades,
    lote.kgPorEnvase ?? '',
    kgTotales(lote),
    unicos(inyecciones.map((i) => i.loteMp)).join(', '),
    inyecciones.map((i) => `${i.loteMp} / ${i.envase}`).join(', '),
    unicos(inyecciones.map((i) => i.proveedor)).join(', '),
    controles.length,
    controles.map((c) => `${c.fecha} ${c.horaControl}`).join(', '),
    pares.length ? Math.min(...pares) : '',
    controles.filter((c) => hayDesvio(c)).length,
    lote.cerradoPor ?? '',
    lote.observacion ?? '',
  ];
}

// ── Dashboard de trazabilidad ──

export interface ControlDeLote extends RegistroHorno {
  cuando: Date;
  desvio: boolean;
  previo: boolean; // control anterior al inicio, vigente cuando arrancó el lote
}

export interface FiltroLotes {
  texto: string; // parte del código de lote
  cliente: string; // '' = todos
  calibre: string; // '' = todos
  desde: string; // aaaa-mm-dd, '' = sin límite
  hasta: string;
}

export const FILTRO_VACIO: FiltroLotes = { texto: '', cliente: '', calibre: '', desde: '', hasta: '' };

// Lotes que empezaron (o están en curso) y coinciden con el filtro, el más reciente primero
export function filtrarLotes(lotes: Lote[], f: FiltroLotes): Lote[] {
  const texto = f.texto.trim().toUpperCase();
  const dia = (d: Date | null) => (d ? formatDate(d, 'yyyy-MM-dd', 'en-US') : '');
  return lotes
    .filter((l) => l.inicio != null)
    .filter(
      (l) =>
        (!texto || l.codigo.toUpperCase().includes(texto)) &&
        (!f.cliente || l.cliente === f.cliente) &&
        (!f.calibre || l.calibre === f.calibre) &&
        // Se superpone con el período: termina después de "desde" y empieza antes de "hasta"
        (!f.desde || !l.fin || dia(l.fin) >= f.desde) &&
        (!f.hasta || dia(l.inicio) <= f.hasta),
    )
    .sort((a, b) => b.inicio!.getTime() - a.inicio!.getTime());
}

/** Controles del horno de la ventana del lote (en curso: hasta ahora), con todos los parámetros. */
export function controlesDeLote(lote: Lote, registros: RegistroHorno[], ahora = new Date()): ControlDeLote[] {
  const inicio = lote.inicio!;
  return controlesDelLote(registros, inicio, lote.fin ?? ahora).map((r) => {
    const cuando = fechaHoraDeControl(r.fecha, r.horaControl)!;
    return { ...r, cuando, desvio: hayDesvio(r), previo: cuando < inicio };
  });
}
