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
import { CommonModule } from '@angular/common';
import { MARGEN, formatoNumero, ticksLindos } from './escalas';

export interface SerieColumnas {
  nombre: string;
  clase: string; // clase CSS que define el color (serie-1, critico...)
}

export interface CategoriaColumnas {
  etiqueta: string;
  valores: number[]; // uno por serie, en el mismo orden
  detalle?: string;
}

interface Segmento {
  clase: string;
  d: string;
}

interface ColumnaVista {
  cat: CategoriaColumnas;
  total: number;
  x: number; // centro
  topeY: number;
  segmentos: Segmento[];
  mostrarEtiqueta: boolean;
}

const ALTO = 220;
const GROSOR_MAX = 24;
const RADIO = 4;
const SEPARACION = 2;

/** Columnas (apiladas si hay más de una serie), desde una única línea de base. */
@Component({
  selector: 'app-grafico-columnas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './grafico-columnas.html',
  styleUrl: './graficos.css',
})
export class GraficoColumnasComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() series: SerieColumnas[] = [];
  @Input() categorias: CategoriaColumnas[] = [];
  @Input() unidad = '';
  @Input() decimales = 0;
  @Input() umbral: number | null = null;
  @Input() etiquetaUmbral = '';
  @Input() maximo: number | null = null; // tope fijo del eje (ej. 100 para %)
  @Input() valorEnTope = false; // número sobre cada columna (sólo con pocas columnas)
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
  banda = 0;
  columnas: ColumnaVista[] = [];
  yTicks: { y: number; label: string }[] = [];
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

  get activa(): ColumnaVista | null {
    return this.hover == null ? null : (this.columnas[this.hover] ?? null);
  }

  formato(v: number): string {
    return formatoNumero(v, this.decimales) + this.unidad;
  }

  private calcular(): void {
    this.w = Math.max(this.ancho - MARGEN.left - MARGEN.right, 10);
    this.h = ALTO - MARGEN.top - MARGEN.bottom;
    this.hover = null;

    const n = this.categorias.length;
    if (!n) {
      this.columnas = [];
      this.yTicks = [];
      this.umbralY = null;
      return;
    }

    const totales = this.categorias.map((c) => c.valores.reduce((a, b) => a + b, 0));
    const ticks = ticksLindos(0, this.maximo ?? Math.max(...totales, this.umbral ?? 0, 1), 4);
    const max = ticks[ticks.length - 1];
    const y = (v: number) => this.h - (v / max) * this.h;

    this.banda = this.w / n;
    const grosor = Math.min(GROSOR_MAX, this.banda * 0.6);
    const cadaCuanto = Math.ceil(n / Math.max(1, Math.floor(this.w / 48))); // etiquetas X sin pisarse

    this.columnas = this.categorias.map((cat, i) => {
      const cx = this.banda * (i + 0.5);
      const x0 = cx - grosor / 2;
      const segmentos: Segmento[] = [];
      const visibles = cat.valores.map((v, s) => ({ v, s })).filter((p) => p.v > 0);
      let acumulado = 0;
      visibles.forEach(({ v, s }, k) => {
        const yBase = y(acumulado);
        acumulado += v;
        const esTope = k === visibles.length - 1;
        // 2px de separación entre segmentos apilados; extremo superior redondeado
        const yTope = y(acumulado) + (esTope ? 0 : SEPARACION);
        const alto = Math.max(yBase - yTope, 0);
        segmentos.push({
          clase: this.series[s]?.clase ?? 'serie-1',
          d: esTope
            ? rectRedondeadoArriba(x0, yTope, grosor, alto)
            : `M${x0},${yBase}V${yTope}H${x0 + grosor}V${yBase}Z`,
        });
      });
      return {
        cat,
        total: totales[i],
        x: cx,
        topeY: y(totales[i]),
        segmentos,
        mostrarEtiqueta: i === n - 1 || (i % cadaCuanto === 0 && n - 1 - i >= cadaCuanto),
      };
    });

    this.yTicks = ticks.map((v) => ({ y: y(v), label: formatoNumero(v, this.decimales) }));
    this.umbralY = this.umbral != null ? y(this.umbral) : null;
  }

  marcar(i: number | null): void {
    this.hover = i;
    this.cdr.markForCheck();
  }

  teclado(e: KeyboardEvent): void {
    const n = this.columnas.length;
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

function rectRedondeadoArriba(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIO, w / 2, h);
  return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
}
