import { RegistroHorno } from './services/google-drive';
import {
  Inyeccion,
  Lote,
  codigoLote,
  controlesDeLote,
  controlesDelLote,
  filtrarLotes,
  filaLoteTerminado,
  generarCodigos,
  inyeccionesDelLote,
  ordenarCola,
  parsearCodigo,
  siguienteNumero,
} from './trazabilidad';

const control = (hora: string, quemadores: number[]): RegistroHorno => ({
  fecha: '09/10/2026',
  horaSet: hora,
  horaControl: hora,
  quemadores,
  velocidadBanda: 0.5,
  alturaCamara: 6,
  observaciones: '',
  accionesCorrectivas: '',
  modificaciones: '',
  responsable: 'Juan',
});

const inyeccion = (hh: number, mm: number, envase: string, loteMp = 'MP1'): Inyeccion => ({
  fecha: new Date(2026, 9, 9, hh, mm),
  loteMp,
  envase,
  proveedor: 'Prov',
  loteEnCurso: '',
  responsable: 'op@x.com',
});

describe('trazabilidad', () => {
  it('builds correlative lot codes RT + cliente + nro + H + año', () => {
    expect(codigoLote('1', 1, 2026)).toBe('RT01001H26');
    expect(generarCodigos('01', 1, 3, 2026)).toEqual(['RT01001H26', 'RT01002H26', 'RT01003H26']);
    expect(parsearCodigo('RT07123H26')).toEqual({ cliente: '07', numero: 123, anio: 2026 });
    expect(parsearCodigo('XX')).toBeNull();
  });

  it('proposes the next free number of the year', () => {
    const lotes = [
      { numero: 4, anio: 2026 },
      { numero: 9, anio: 2025 },
    ];
    expect(siguienteNumero(lotes, 2026)).toBe(5);
    expect(siguienteNumero(lotes, 2027)).toBe(1);
  });

  it('orders the queue and leaves out closed lots', () => {
    const lote = (codigo: string, orden: number, estado: Lote['estado']) =>
      ({ codigo, orden, estado }) as Lote;
    const cola = ordenarCola([lote('B', 2, 'pendiente'), lote('X', 0, 'cerrado'), lote('A', 1, 'en_curso')]);
    expect(cola.map((l) => l.codigo)).toEqual(['A', 'B']);
  });

  it('associates MP in the window plus the last one still in the hopper', () => {
    const todas = [
      inyeccion(7, 0, '1'),
      inyeccion(7, 50, '2'),
      inyeccion(8, 30, '3'),
      inyeccion(9, 10, '4'),
    ];
    const asociadas = inyeccionesDelLote(todas, new Date(2026, 9, 9, 8, 0), new Date(2026, 9, 9, 9, 0));
    expect(asociadas.map((i) => i.envase)).toEqual(['2', '3']);
  });

  it('associates oven controls in the window plus the previous one', () => {
    const registros = [control('06:58', [90]), control('07:59', [91]), control('08:30', [92]), control('09:05', [93])];
    const asociados = controlesDelLote(registros, new Date(2026, 9, 9, 8, 0), new Date(2026, 9, 9, 9, 0));
    expect(asociados.map((c) => c.horaControl)).toEqual(['07:59', '08:30']);
  });

  it('builds the Lotes_Terminados row', () => {
    const lote: Lote = {
      codigo: 'RT01001H26',
      cliente: '01',
      numero: 1,
      anio: 2026,
      orden: 1,
      estado: 'cerrado',
      unidades: 42,
      inicio: new Date(2026, 9, 9, 8, 0),
      fin: new Date(2026, 9, 9, 9, 30),
      cerradoPor: 'op@x.com',
    };
    const fila = filaLoteTerminado(
      lote,
      [inyeccion(7, 50, '2'), inyeccion(8, 30, '3', 'MP2')],
      [control('08:00', [70, 85, 86, 90, 90, 75]), control('09:00', [70, 75, 79, 70, 70, 70])],
    );
    expect(fila).toEqual([
      'RT01001H26',
      '01',
      '09/10/2026 08:00',
      '09/10/2026 09:30',
      90,
      42,
      'MP1, MP2',
      'MP1 / 2, MP2 / 3',
      'Prov',
      2,
      '09/10/2026 08:00, 09/10/2026 09:00',
      75,
      1,
      'op@x.com',
    ]);
  });

  it('filters lots by code, client and overlapping dates, newest first', () => {
    const lote = (codigo: string, cliente: string, inicio: Date | null, fin: Date | null) =>
      ({ codigo, cliente, inicio, fin }) as Lote;
    const lotes = [
      lote('RT01001H26', '01', new Date(2026, 9, 1, 8), new Date(2026, 9, 1, 10)),
      lote('RT01002H26', '01', new Date(2026, 9, 5, 8), null), // en curso
      lote('RT02001H26', '02', new Date(2026, 9, 3, 8), new Date(2026, 9, 3, 9)),
      lote('RT01003H26', '01', null, null), // pendiente: no se muestra
    ];
    const codigos = (f: Partial<{ texto: string; cliente: string; desde: string; hasta: string }>) =>
      filtrarLotes(lotes, { texto: '', cliente: '', desde: '', hasta: '', ...f }).map((l) => l.codigo);

    expect(codigos({})).toEqual(['RT01002H26', 'RT02001H26', 'RT01001H26']);
    expect(codigos({ texto: 'rt01001' })).toEqual(['RT01001H26']);
    expect(codigos({ cliente: '02' })).toEqual(['RT02001H26']);
    expect(codigos({ desde: '2026-10-02', hasta: '2026-10-04' })).toEqual(['RT02001H26']);
    expect(codigos({ desde: '2026-10-06' })).toEqual(['RT01002H26']);
  });

  it('marks the control that was in force before the lot started', () => {
    const lote = { inicio: new Date(2026, 9, 9, 8, 0), fin: new Date(2026, 9, 9, 9, 0) } as Lote;
    const controles = controlesDeLote(lote, [
      control('07:59', [70, 70, 70, 70, 70, 70]),
      control('08:30', [90, 90, 90, 90, 90, 90]),
    ]);
    expect(controles.map((c) => [c.horaControl, c.previo, c.desvio])).toEqual([
      ['07:59', true, true],
      ['08:30', false, false],
    ]);
  });
});
