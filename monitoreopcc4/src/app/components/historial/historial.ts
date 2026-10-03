import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EncabezadoComponent } from '../encabezado/encabezado';
import { RegistroHorno, describirErrorGoogle } from '../../services/google-drive';
import { RegistrosService } from '../../services/registros';
import { LIMITES, fechaAIso, fueraDeRango, hayDesvio, quemadoresCumplen } from '../../pcc4';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, EncabezadoComponent],
  templateUrl: './historial.html',
  styleUrl: './historial.css',
})
export class HistorialComponent implements OnInit {
  private registrosService = inject(RegistrosService);

  get limites() {
    return LIMITES;
  }

  registros: RegistroHorno[] = [];
  cargado: boolean = false;
  loading: boolean = false;
  mensajeError: string = '';

  // aaaa-mm-dd (formato del input type="date"); se comparan como texto
  filtroDesde: string = '';
  filtroHasta: string = '';
  soloDesvios: boolean = false;

  ngOnInit(): void {
    // Mostramos lo último leído y refrescamos si se puede sin popup (el popup necesita un clic)
    if (this.registrosService.ultimos) {
      this.mostrar(this.registrosService.ultimos);
    }
    if (this.registrosService.puedeCargarSinClic()) {
      this.cargar();
    }
  }

  get registrosFiltrados(): RegistroHorno[] {
    return this.registros.filter((r) => {
      const fecha = fechaAIso(r.fecha);
      return (
        (!this.filtroDesde || fecha >= this.filtroDesde) &&
        (!this.filtroHasta || fecha <= this.filtroHasta) &&
        (!this.soloDesvios || this.esDesvio(r))
      );
    });
  }

  get cantidadDesvios(): number {
    return this.registros.filter((r) => this.esDesvio(r)).length;
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

  private mostrar(registros: RegistroHorno[]): void {
    // Lo más reciente primero (copia: el arreglo cacheado se comparte con el dashboard)
    this.registros = [...registros].reverse();
    this.cargado = true;
  }

  limpiarFiltros(): void {
    this.filtroDesde = '';
    this.filtroHasta = '';
    this.soloDesvios = false;
  }

  esDesvio(r: RegistroHorno): boolean {
    return hayDesvio(r);
  }

  quemadoresOk(r: RegistroHorno): boolean {
    return quemadoresCumplen(r.quemadores);
  }

  velocidadMal(r: RegistroHorno): boolean {
    return fueraDeRango(r.velocidadBanda, LIMITES.velocidad);
  }

  alturaMal(r: RegistroHorno): boolean {
    return fueraDeRango(r.alturaCamara, LIMITES.altura);
  }




}
