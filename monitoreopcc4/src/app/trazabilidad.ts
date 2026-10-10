// Trazabilidad del proceso de tostado: lotes correlativos, inyección de MP y embolse
import { formatDate } from '@angular/common';
import { RegistroHorno } from './services/google-drive';
import { fechaHoraDeControl, hayDesvio, mejorParConsecutivo } from './pcc4';

export type EstadoLote = 'pendiente' | 'en_curso' | 'cerrado';

export interface Lote {
  codigo: string; // RT01001H26
  cliente: string; // "01"
  numero: number; // 1
  anio: number; // 2026
  orden: number; // posición en la cola (menor = primero)
  estado: EstadoLote;
  unidades: number;
  inicio: Date | null; // al cerrar el anterior, o con el primer +1 si es el primero de la cola
  fin: Date | null;
  respaldado?: boolean; // false: cerrado pero todavía no se envió a la planilla
  cerradoPor?: string;
  materiaPrima?: Inyeccion[]; // envases que formaron el lote, guardados al cerrarlo
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
  'Inicio',
  'Fin',
  'Duración (min)',
  'Unidades',
  'Lotes MP',
  'Envases (lote MP / envase)',
  'Proveedores',
  'Controles de horno',
  'Horas de control',
  'Mejor par quemadores mín. (°C)',
  'Controles con desvío',
  'Cerrado por',
];

const dosDigitos = (n: number) => String(n).padStart(2, '0');

// RT + cliente (2 dígitos) + correlativo (3 dígitos) + H + año (2 dígitos)
export function codigoLote(cliente: string, numero: number, anio: number): string {
  return `RT${cliente.padStart(2, '0')}${String(numero).padStart(3, '0')}H${dosDigitos(anio % 100)}`;
}

export function generarCodigos(
  cliente: string,
  desde: number,
  cantidad: number,
  anio: number,
): string[] {
  return Array.from({ length: cantidad }, (_, i) => codigoLote(cliente, desde + i, anio));
}

export function parsearCodigo(codigo: string): { cliente: string; numero: number; anio: number } | null {
  const m = codigo.match(/^RT(\d{2})(\d{3})H(\d{2})$/);
  return m ? { cliente: m[1], numero: Number(m[2]), anio: 2000 + Number(m[3]) } : null;
}

// Primer correlativo libre de un cliente en un año
export function siguienteNumero(lotes: Pick<Lote, 'numero' | 'anio'>[], anio: number): number {
  return Math.max(0, ...lotes.filter((l) => l.anio === anio).map((l) => l.numero)) + 1;
}

// Cola de embolse: pendientes y en curso, en el orden en que se generaron
export function ordenarCola(lotes: Lote[]): Lote[] {
  return lotes.filter((l) => l.estado !== 'cerrado').sort((a, b) => a.orden - b.orden);
}

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
    fechaHora(inicio),
    fechaHora(fin),
    Math.round((fin.getTime() - inicio.getTime()) / 60000),
    lote.unidades,
    unicos(inyecciones.map((i) => i.loteMp)).join(', '),
    inyecciones.map((i) => `${i.loteMp} / ${i.envase}`).join(', '),
    unicos(inyecciones.map((i) => i.proveedor)).join(', '),
    controles.length,
    controles.map((c) => `${c.fecha} ${c.horaControl}`).join(', '),
    pares.length ? Math.min(...pares) : '',
    controles.filter((c) => hayDesvio(c)).length,
    lote.cerradoPor ?? '',
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
  desde: string; // aaaa-mm-dd, '' = sin límite
  hasta: string;
}

// Lotes que empezaron (o están en curso) y coinciden con el filtro, el más reciente primero
export function filtrarLotes(lotes: Lote[], f: FiltroLotes): Lote[] {
  const texto = f.texto.trim().toUpperCase();
  const dia = (d: Date | null) => (d ? formatDate(d, 'yyyy-MM-dd', 'en-US') : '');
  return lotes
    .filter((l) => l.inicio != null)
    .filter(
      (l) =>
        (!texto || l.codigo.includes(texto)) &&
        (!f.cliente || l.cliente === f.cliente) &&
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
