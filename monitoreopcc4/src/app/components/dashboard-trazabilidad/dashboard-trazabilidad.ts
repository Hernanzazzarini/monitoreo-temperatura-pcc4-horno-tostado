import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { GraficoLineaComponent, PuntoSerie } from '../graficos/grafico-linea';
import { RegistroHorno, describirErrorGoogle } from '../../services/google-drive';
import { RegistrosService } from '../../services/registros';
import { TrazabilidadService } from '../../services/trazabilidad';
import { LIMITES, fueraDeRango, mejorParConsecutivo } from '../../pcc4';
import {
  ControlDeLote,
  FiltroLotes,
  Inyeccion,
  Lote,
  controlesDeLote,
  filtrarLotes,
  unicos,
} from '../../trazabilidad';

/** Dashboard de trazabilidad: por lote, la materia prima que lo formó y los controles del horno. */
@Component({
  selector: 'app-dashboard-trazabilidad',
  standalone: true,
  imports: [CommonModule, FormsModule, EncabezadoComponent, GraficoLineaComponent],
  templateUrl: './dashboard-trazabilidad.html',
  styleUrls: ['../trazabilidad/trazabilidad.css', './dashboard-trazabilidad.css'],
})
export class DashboardTrazabilidadComponent implements OnInit {
  private trazabilidad = inject(TrazabilidadService);
  private registrosService = inject(RegistrosService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);

  readonly numerosQuemador = [1, 2, 3, 4, 5, 6];
  get limites() {
    return LIMITES;
  }

  lotes: Lote[] | null = null;
  registros: RegistroHorno[] | null = null;
  filtro: FiltroLotes = { texto: '', cliente: '', desde: '', hasta: '' };
  filtrados: Lote[] = [];
  clientes: string[] = [];

  seleccionado: Lote | null = null;
  materiaPrima: Inyeccion[] | null = null;
  controles: ControlDeLote[] = [];
  series: { par: PuntoSerie[]; velocidad: PuntoSerie[]; altura: PuntoSerie[] } = {
    par: [],
    velocidad: [],
    altura: [],
  };

  cargandoLotes = false;
  cargandoHorno = false;
  errorLotes = '';
  errorHorno = '';

  ngOnInit(): void {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((p) => {
        const lote = p.get('lote');
        if (lote && lote !== this.filtro.texto) {
          this.filtro.texto = lote;
          this.aplicarFiltro();
        }
      });

    this.registrosService.registros$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((r) => {
        this.registros = r;
        this.calcularHorno();
      });

    this.cargarLotes();
    // Sin token de Google vigente se espera el clic, para que el navegador no bloquee el popup
    if (!this.registros && this.registrosService.puedeCargarSinClic()) this.cargarHorno();
  }

  async cargarLotes(): Promise<void> {
    this.cargandoLotes = true;
    this.errorLotes = '';
    try {
      this.lotes = await this.trazabilidad.obtenerLotes();
      this.clientes = unicos(this.lotes.map((l) => l.cliente)).sort();
      this.aplicarFiltro();
    } catch (err) {
      console.error(err);
      this.errorLotes = 'No se pudieron leer los lotes. Revise la conexión y los permisos.';
    } finally {
      this.cargandoLotes = false;
    }
  }

  cargarHorno(): void {
    this.cargandoHorno = true;
    this.errorHorno = '';
    this.registrosService.cargar().subscribe({
      next: () => (this.cargandoHorno = false),
      error: (err) => {
        this.cargandoHorno = false;
        this.errorHorno = describirErrorGoogle(err, 'No se pudo leer la planilla de temperaturas.');
      },
    });
  }

  aplicarFiltro(): void {
    this.filtrados = filtrarLotes(this.lotes ?? [], this.filtro);
    // Si el lote elegido sigue en la lista se mantiene; si no, se muestra el primero
    const sigue = this.filtrados.find((l) => l.codigo === this.seleccionado?.codigo);
    this.seleccionar(sigue ?? this.filtrados[0] ?? null);
  }

  limpiarFiltro(): void {
    this.filtro = { texto: '', cliente: '', desde: '', hasta: '' };
    this.router.navigate([], { queryParams: {} });
    this.aplicarFiltro();
  }

  async seleccionar(lote: Lote | null): Promise<void> {
    if (lote === this.seleccionado) return;
    this.seleccionado = lote;
    this.calcularHorno();
    this.materiaPrima = lote?.materiaPrima ?? null;
    // Lote en curso (o cerrado sin la MP guardada): se calcula con las inyecciones registradas
    if (lote && !lote.materiaPrima) {
      try {
        const mp = await this.trazabilidad.materiaPrimaDe(lote.inicio!, lote.fin ?? new Date());
        if (this.seleccionado === lote) this.materiaPrima = mp;
      } catch (err) {
        console.error(err);
        if (this.seleccionado === lote) this.materiaPrima = [];
      }
    }
  }

  private calcularHorno(): void {
    const lote = this.seleccionado;
    this.controles = lote && this.registros ? controlesDeLote(lote, this.registros) : [];
    const par: PuntoSerie[] = [];
    const velocidad: PuntoSerie[] = [];
    const altura: PuntoSerie[] = [];
    for (const c of this.controles) {
      const detalle = `Q: ${c.quemadores.map((t) => t ?? '–').join(' · ')} — ${c.responsable}`;
      const p = mejorParConsecutivo(c.quemadores);
      if (p != null) {
        par.push({ fecha: c.cuando, valor: p, fuera: p < LIMITES.temperaturaMinQuemador, detalle });
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
    this.series = { par, velocidad, altura };
  }

  // ── Datos del lote elegido ──

  get duracion(): string {
    const l = this.seleccionado;
    if (!l?.inicio) return '–';
    const min = Math.round(((l.fin ?? new Date()).getTime() - l.inicio.getTime()) / 60000);
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  }

  get lotesMp(): string[] {
    return unicos((this.materiaPrima ?? []).map((i) => i.loteMp));
  }

  get desvios(): number {
    return this.controles.filter((c) => c.desvio).length;
  }

  quemadorBajo(t: number | null): boolean {
    return t != null && t < LIMITES.temperaturaMinQuemador;
  }

  velocidadFuera(c: ControlDeLote): boolean {
    return fueraDeRango(c.velocidadBanda, LIMITES.velocidad);
  }

  alturaFuera(c: ControlDeLote): boolean {
    return fueraDeRango(c.alturaCamara, LIMITES.altura);
  }

  generarPdf(): void {
    window.print();
  }
}
