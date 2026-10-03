import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule, formatDate } from '@angular/common';
import { MARGEN, formatoNumero, ticksLindos } from './escalas';

export interface PuntoSerie {
  fecha: Date;
  valor: number;
  fuera?: boolean; // fuera de rango / no cumple
  detalle?: string;
}

interface PuntoVista extends PuntoSerie {
  x: number;
  y: number;
}

const ALTO = 220;

/** Línea de una serie en el tiempo, con franja de rango o umbral de referencia. */
@Component({
  selector: 'app-grafico-linea',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grafico-linea.html',
  styleUrl: './graficos.css',
})
export class GraficoLineaComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() puntos: PuntoSerie[] = [];
  @Input() unidad = '';
  @Input() decimales = 0;
  @Input() banda: { min: number; max: number } | null = null;
  @Input() etiquetaBanda = '';
  @Input() umbral: number | null = null;
  @Input() etiquetaUmbral = '';
  @Input() descripcion = '';

  @ViewChild('contenedor', { static: true }) contenedor!: ElementRef<HTMLDivElement>;

  private cdr = inject(ChangeDetectorRef);
  private observador?: ResizeObserver;

  readonly m = MARGEN;
  readonly alto = ALTO;
  ancho = 600;
  hover: number | null = null;

  w = 0;
  h = 0;
  vistaPuntos: PuntoVista[] = [];
  path = '';
  yTicks: { y: number; label: string }[] = [];
  xTicks: { x: number; label: string; anchor: string }[] = [];
  bandaY: { y: number; h: number } | null = null;
  umbralY: number | null = null;

  ngOnChanges(): void {
    this.calcular();
  }

  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    this.observador = new ResizeObserver(([entrada]) => {
      const nuevo = Math.floor(entrada.contentRect.width);
      if (nuevo > 0 && nuevo !== this.ancho) {
        this.ancho = nuevo;
        this.calcular();
        this.cdr.detectChanges();
      }
    });
    this.observador.observe(this.contenedor.nativeElement);
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
  }

  get activo(): PuntoVista | null {
    return this.hover == null ? null : (this.vistaPuntos[this.hover] ?? null);
  }

  get ultimo(): PuntoVista | null {
    return this.vistaPuntos[this.vistaPuntos.length - 1] ?? null;
  }

  get marcas(): PuntoVista[] {
    // Marcamos sólo lo que importa: los puntos fuera de rango
    return this.vistaPuntos.filter((p) => p.fuera);
  }

  formato(v: number): string {
    return formatoNumero(v, this.decimales) + this.unidad;
  }

  private calcular(): void {
    this.w = Math.max(this.ancho - MARGEN.left - MARGEN.right, 10);
    this.h = ALTO - MARGEN.top - MARGEN.bottom;
    this.hover = null;

    const datos = [...this.puntos].sort((a, b) => a.fecha.getTime() - b.fecha.getTime());
    if (!datos.length) {
      this.vistaPuntos = [];
      this.path = '';
      this.yTicks = [];
      this.xTicks = [];
      this.bandaY = null;
      this.umbralY = null;
      return;
    }

    // Dominio Y: datos + referencias, con un poco de aire
    const valores = datos.map((d) => d.valor);
    if (this.banda) valores.push(this.banda.min, this.banda.max);
    if (this.umbral != null) valores.push(this.umbral);
    let min = Math.min(...valores);
    let max = Math.max(...valores);
    const aire = (max - min || Math.abs(max) || 1) * 0.08;
    const ticks = ticksLindos(min - aire, max + aire, 4);
    min = ticks[0];
    max = ticks[ticks.length - 1];
    const y = (v: number) => this.h - ((v - min) / (max - min)) * this.h;

    // Dominio X: tiempo
    let t0 = datos[0].fecha.getTime();
    let t1 = datos[datos.length - 1].fecha.getTime();
    if (t0 === t1) {
      t0 -= 3600_000;
      t1 += 3600_000;
    }
    const x = (t: number) => ((t - t0) / (t1 - t0)) * this.w;

    this.vistaPuntos = datos.map((d) => ({ ...d, x: x(d.fecha.getTime()), y: y(d.valor) }));
    this.path = this.vistaPuntos
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join('');

    this.yTicks = ticks.map((v) => ({ y: y(v), label: formatoNumero(v, this.decimales) }));

    const n = Math.max(2, Math.min(5, Math.floor(this.w / 90)));
    const formatoX = t1 - t0 <= 2 * 86400_000 ? 'HH:mm' : 'dd/MM';
    this.xTicks = Array.from({ length: n }, (_, i) => {
      const t = t0 + ((t1 - t0) * i) / (n - 1);
      return {
        x: x(t),
        label: formatDate(t, formatoX, 'en-US'),
        anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      };
    });

    this.bandaY = this.banda
      ? { y: y(this.banda.max), h: y(this.banda.min) - y(this.banda.max) }
      : null;
    this.umbralY = this.umbral != null ? y(this.umbral) : null;
  }

  mover(e: PointerEvent): void {
    const rect = (e.currentTarget as Element).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let mejor = 0;
    for (let i = 1; i < this.vistaPuntos.length; i++) {
      if (Math.abs(this.vistaPuntos[i].x - px) < Math.abs(this.vistaPuntos[mejor].x - px))
        mejor = i;
    }
    this.marcar(this.vistaPuntos.length ? mejor : null);
  }

  marcar(i: number | null): void {
    this.hover = i;
    this.cdr.markForCheck();
  }

  teclado(e: KeyboardEvent): void {
    const n = this.vistaPuntos.length;
    if (!n) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const paso = e.key === 'ArrowRight' ? 1 : -1;
      this.marcar(this.hover == null ? n - 1 : Math.min(n - 1, Math.max(0, this.hover + paso)));
      e.preventDefault();
    } else if (e.key === 'Escape') {
      this.marcar(null);
    }
  }
}
