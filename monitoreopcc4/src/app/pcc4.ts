// Límites del PCC N°4 (encabezado de la planilla VR PR FO T 007)
export const LIMITES = {
  temperaturaMinQuemador: 80,
  velocidad: { min: 0.4, max: 0.7 },
  altura: { min: 5, max: 7 },
};

// Turnos de producción: el control se hace a cada hora en punto, del inicio al fin del turno
export interface Turno {
  id: string;
  nombre: string;
  inicio: number; // hora del día (0–23)
  horas: number; // 8 o 16
}

export const TURNOS: Turno[] = [
  { id: 'manana', nombre: 'Mañana · 8 hs (06:00 a 14:00)', inicio: 6, horas: 8 },
  { id: 'tarde', nombre: 'Tarde · 8 hs (14:00 a 22:00)', inicio: 14, horas: 8 },
  { id: 'noche', nombre: 'Noche · 8 hs (22:00 a 06:00)', inicio: 22, horas: 8 },
  { id: 'doble', nombre: '16 hs (06:00 a 22:00)', inicio: 6, horas: 16 },
];

const dosDigitos = (n: number) => String(n).padStart(2, '0');

// Horas set del turno, de inicio a fin inclusive: 06:00, 07:00 … 14:00
export function horasSet(turno: Turno): string[] {
  return Array.from(
    { length: turno.horas + 1 },
    (_, i) => `${dosDigitos((turno.inicio + i) % 24)}:00`,
  );
}

// Turno de 8 hs que corresponde a la hora actual
export function turnoActual(ahora: Date): Turno {
  const h = ahora.getHours();
  return TURNOS.find((t) => t.horas === 8 && (h - t.inicio + 24) % 24 < 8)!;
}

// Hora set que toca controlar ahora: la hora en punto más cercana dentro del turno
export function horaSetSugerida(turno: Turno, ahora: Date): string {
  const minutos = ((ahora.getHours() - turno.inicio + 24) % 24) * 60 + ahora.getMinutes();
  const paso = Math.min(turno.horas, Math.round(minutos / 60));
  // Fuera del turno (minutos más allá del fin) se propone la primera hora
  return horasSet(turno)[minutos > turno.horas * 60 + 59 ? 0 : paso];
}

export function fueraDeRango(
  valor: number | null | undefined,
  rango: { min: number; max: number },
): boolean {
  return valor != null && (valor < rango.min || valor > rango.max);
}

// "Verificar en 2 quemadores consecutivos Temperaturas >= 80°C"
export function quemadoresCumplen(temps: (number | null)[]): boolean {
  return temps.some(
    (t, i) =>
      i < temps.length - 1 &&
      t != null &&
      temps[i + 1] != null &&
      t >= LIMITES.temperaturaMinQuemador &&
      temps[i + 1]! >= LIMITES.temperaturaMinQuemador,
  );
}

// Quemadores con temperatura cargada por debajo de 80°C, numerados desde 1
export function quemadoresBajos(temps: (number | null)[]): { n: number; t: number }[] {
  return temps.flatMap((t, i) =>
    t != null && t < LIMITES.temperaturaMinQuemador ? [{ n: i + 1, t }] : [],
  );
}

export function hayDesvio(v: {
  quemadores?: (number | null)[];
  velocidadBanda?: number | null;
  alturaCamara?: number | null;
}): boolean {
  const temps = v.quemadores ?? [];
  const completos = temps.length > 0 && temps.every((t) => t != null);
  return (
    (completos && !quemadoresCumplen(temps)) ||
    fueraDeRango(v.velocidadBanda, LIMITES.velocidad) ||
    fueraDeRango(v.alturaCamara, LIMITES.altura)
  );
}

// Convierte "2/10/2026" o "02/10/2026" a "2026-10-02" (formato del input type="date")
export function fechaAIso(fecha: string): string {
  const m = fecha.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return '';
  return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Fecha + hora de control de la planilla ("02/10/2026", "08:15") como Date local
export function fechaHoraDeControl(fecha: string, hora: string): Date | null {
  const iso = fechaAIso(fecha);
  if (!iso) return null;
  const [a, m, d] = iso.split('-').map(Number);
  const h = hora.trim().match(/^(\d{1,2}):(\d{2})/);
  return new Date(a, m - 1, d, h ? Number(h[1]) : 0, h ? Number(h[2]) : 0);
}

// Temperatura del mejor par de quemadores consecutivos: el PCC cumple si es >= 80°C
export function mejorParConsecutivo(temps: (number | null)[]): number | null {
  let mejor: number | null = null;
  for (let i = 0; i < temps.length - 1; i++) {
    const a = temps[i];
    const b = temps[i + 1];
    if (a == null || b == null) continue;
    const par = Math.min(a, b);
    if (mejor == null || par > mejor) mejor = par;
  }
  return mejor;
}
