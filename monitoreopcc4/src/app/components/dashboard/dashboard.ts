import { Component, DestroyRef, inject, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { CommonModule, formatDate } from '@angular/common';
import { RouterLink } from '@angular/router';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { AuthService } from '../../services/auth';
import { RegistroHorno, describirErrorGoogle } from '../../services/google-drive';
import { RegistrosService } from '../../services/registros';
import {
  LIMITES,
  fechaAIso,
  fechaHoraDeControl,
  fueraDeRango,
  hayDesvio,
  mejorParConsecutivo,
} from '../../pcc4';
import { GraficoLineaComponent, PuntoSerie } from '../graficos/grafico-linea';
import {
  CategoriaColumnas,
  GraficoColumnasComponent,
  SerieColumnas,
} from '../graficos/grafico-columnas';

export interface Control extends RegistroHorno {
  cuando: Date;
  desvio: boolean;
}

// Fechas aaaa-mm-dd (formato del input type="date"); vacías = sin límite
export interface Periodo {
  desde: string;
  hasta: string;
}

export interface Resumen {
  controles: number;
  detalle: Control[]; // controles del período, del más viejo al más nuevo
  desvios: number;
  cumplimiento: number | null; // % de controles sin desvío
  ultimo: Control | null;
  linea: { par: PuntoSerie[]; velocidad: PuntoSerie[]; altura: PuntoSerie[] };
  porDia: CategoriaColumnas[];
  porQuemador: CategoriaColumnas[];
}

const DIA_MS = 86400_000;
const iso = (d: Date) => formatDate(d, 'yyyy-MM-dd', 'en-US');

// Período de los últimos N días contando hoy; 0 = todo
export function ultimosDias(dias: number, ahora = new Date()): Periodo {
  return dias > 0
    ? { desde: iso(new Date(ahora.getTime() - (dias - 1) * DIA_MS)), hasta: iso(ahora) }
    : { desde: '', hasta: '' };
}

// Arma todos los indicadores a partir de los controles del período
export function resumir(registros: RegistroHorno[], periodo: Periodo): Resumen {
  const controles: Control[] = registros
    .map((r) => ({
      ...r,
      cuando: fechaHoraDeControl(r.fecha, r.horaControl),
      desvio: hayDesvio(r),
    }))
    .filter((c): c is Control => {
      const dia = fechaAIso(c.fecha);
      return (
        c.cuando != null &&
        (!periodo.desde || dia >= periodo.desde) &&
        (!periodo.hasta || dia <= periodo.hasta)
      );
    })
    .sort((a, b) => a.cuando.getTime() - b.cuando.getTime());

  const desvios = controles.filter((c) => c.desvio).length;
  const detalle = (c: Control) =>
    `Q: ${c.quemadores.map((t) => t ?? '–').join(' · ')} — ${c.responsable}`;

  const par: PuntoSerie[] = [];
  const velocidad: PuntoSerie[] = [];
  const altura: PuntoSerie[] = [];
  for (const c of controles) {
    const p = mejorParConsecutivo(c.quemadores);
    if (p != null) {
      par.push({
        fecha: c.cuando,
        valor: p,
        fuera: p < LIMITES.temperaturaMinQuemador,
        detalle: detalle(c),
      });
    }
    if (c.velocidadBanda != null) {
      velocidad.push({
        fecha: c.cuando,
        valor: c.velocidadBanda,
        fuera: fueraDeRango(c.velocidadBanda, LIMITES.velocidad),
        detalle: c.responsable,
      });
    }
    if (c.alturaCamara != null) {
      altura.push({
        fecha: c.cuando,
        valor: c.alturaCamara,
        fuera: fueraDeRango(c.alturaCamara, LIMITES.altura),
        detalle: c.responsable,
      });
    }
  }

  // Controles por día: en rango vs con desvío
  const dias_ = new Map<string, { enRango: number; desvio: number; fecha: Date }>();
  for (const c of controles) {
    const clave = fechaAIso(c.fecha);
    const d = dias_.get(clave) ?? { enRango: 0, desvio: 0, fecha: c.cuando };
    if (c.desvio) d.desvio++;
    else d.enRango++;
    dias_.set(clave, d);
  }
  const porDia = [...dias_.values()].map((d) => ({
    etiqueta: formatDate(d.fecha, 'dd/MM', 'en-US'),
    valores: [d.enRango, d.desvio],
  }));

  // % de lecturas de cada quemador que alcanzaron la temperatura mínima
  const porQuemador = [0, 1, 2, 3, 4, 5].map((i) => {
    const vals = controles.map((c) => c.quemadores[i]).filter((t): t is number => t != null);
    const ok = vals.filter((t) => t >= LIMITES.temperaturaMinQuemador).length;
    const prom = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    return {
      etiqueta: `Q${i + 1}`,
      valores: [vals.length ? (ok / vals.length) * 100 : 0],
      detalle: vals.length
        ? `${ok} de ${vals.length} lecturas · promedio ${Math.round(prom)}°C (mín. ${Math.min(...vals)}, máx. ${Math.max(...vals)})`
        : 'Sin lecturas',
    };
  });

  return {
    controles: controles.length,
    detalle: controles,
    desvios,
    cumplimiento: controles.length ? ((controles.length - desvios) / controles.length) * 100 : null,
    ultimo: controles[controles.length - 1] ?? null,
    linea: { par, velocidad, altura },
    porDia,
    porQuemador,
  };
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, GraficoLineaComponent, GraficoColumnasComponent, RouterLink, EncabezadoComponent],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', './reporte.css'],
})
export class DashboardComponent implements OnInit {
  private registrosService = inject(RegistrosService);
  private authService = inject(AuthService);
  private destroyRef = inject(DestroyRef);

  readonly rangos = [
    { dias: 7, nombre: 'Últimos 7 días' },
    { dias: 30, nombre: 'Últimos 30 días' },
    { dias: 90, nombre: 'Últimos 90 días' },
    { dias: 0, nombre: 'Todo' },
  ];
  readonly seriesDia: SerieColumnas[] = [
    { nombre: 'En rango', clase: 'serie-1' },
    { nombre: 'Con desvío', clase: 'critico' },
  ];
  readonly seriesQuemador: SerieColumnas[] = [
    { nombre: 'Lecturas en temperatura', clase: 'serie-1' },
  ];

  get limites() {
    return LIMITES;
  }

  // Atajo elegido (null si se escribieron las fechas a mano)
  dias: number | null = 30;
  periodo: Periodo = ultimosDias(30);
  usuario = '';
  generadoEl: Date | null = null;
  registros: RegistroHorno[] = [];
  resumen: Resumen | null = null;
  cargado = false;
  loading = false;
  mensajeError = '';

  ngOnInit(): void {
    this.authService.user$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((u) => (this.usuario = u?.email ?? ''));
    if (this.registrosService.ultimos) {
      this.mostrar(this.registrosService.ultimos);
    }
    if (this.registrosService.puedeCargarSinClic()) {
      this.cargar();
    }
  }

  cargar(): void {
    this.loading = true;
    this.mensajeError = '';
    this.registrosService.cargar().subscribe({
      next: (registros) => {
        this.mostrar(registros);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        console.error(err);
        this.mensajeError = describirErrorGoogle(
          err,
          'No se pudieron leer los registros. Intente de nuevo.',
        );
      },
    });
  }

  elegirRango(dias: number): void {
    this.dias = dias;
    this.periodo = ultimosDias(dias);
    this.recalcular();
  }

  cambiarFechas(): void {
    this.dias = null;
    this.recalcular();
  }

  get textoPeriodo(): string {
    const f = (d: string) => d.split('-').reverse().join('/');
    const { desde, hasta } = this.periodo;
    if (desde && hasta) return `del ${f(desde)} al ${f(hasta)}`;
    if (desde) return `desde el ${f(desde)}`;
    if (hasta) return `hasta el ${f(hasta)}`;
    return 'todos los registros';
  }

  // El reporte es la vista de impresión de esta pantalla: el navegador ofrece "Guardar como PDF"
  generarPdf(): void {
    this.generadoEl = new Date();
    const titulo = document.title;
    // El navegador propone el título como nombre del archivo
    document.title = `Reporte PCC4 ${this.textoPeriodo}`;
    setTimeout(() => {
      window.print();
      document.title = titulo;
    });
  }

  private recalcular(): void {
    this.resumen = resumir(this.registros, this.periodo);
  }

  private mostrar(registros: RegistroHorno[]): void {
    this.registros = registros;
    this.recalcular();
    this.cargado = true;
  }

}
