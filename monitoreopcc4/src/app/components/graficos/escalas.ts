// Márgenes del área de trazado (el derecho deja lugar a la etiqueta del último valor)
export const MARGEN = { top: 12, right: 60, bottom: 28, left: 44 };

// Ticks "redondos" (1, 2, 5 × 10^n) que cubren [min, max]
export function ticksLindos(min: number, max: number, cantidad: number): number[] {
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const crudo = (max - min) / cantidad;
  const mag = Math.pow(10, Math.floor(Math.log10(crudo)));
  const norm = crudo / mag;
  const paso = (norm >= 5 ? 10 : norm >= 2 ? 5 : norm >= 1 ? 2 : 1) * mag;
  const desde = Math.floor(min / paso) * paso;
  const hasta = Math.ceil(max / paso) * paso;
  const ticks: number[] = [];
  for (let v = desde; v <= hasta + paso / 2; v += paso) {
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

export function formatoNumero(v: number, decimales: number): string {
  return v.toLocaleString('es-AR', {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  });
}
