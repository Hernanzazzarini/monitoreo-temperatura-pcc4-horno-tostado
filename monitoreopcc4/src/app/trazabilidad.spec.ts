import { RegistroHorno } from './services/google-drive';
import {
  FILTRO_VACIO,
  Inyeccion,
  Lote,
  controlesDeLote,
  controlesDelLote,
  correlativos,
  filtrarLotes,
  filaLoteTerminado,
  inyeccionesDelLote,
  kgTotales,
  ordenarCola,
  siguienteCodigo,
  siguienteDeCalibre,
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
  it('builds correlatives from a free-form lot code', () => {
    expect(siguienteCodigo('RT01001H26')).toBe('RT01002H26');
    expect(siguienteCodigo('2610-07')).toBe('2611-07');
    expect(siguienteCodigo('A099')).toBe('A100');
    expect(siguienteCodigo('SPLIT')).toBeNull();
    expect(correlativos('RT01001H26', 3)).toEqual(['RT01001H26', 'RT01002H26', 'RT01003H26']);
    expect(correlativos('SPLIT', 1)).toEqual(['SPLIT']);
    expect(correlativos('SPLIT', 2)).toBeNull();
  });

  it('starts the next scheduled lot of the same calibre', () => {
    const lote = (codigo: string, orden: number, calibre: string, estado: Lote['estado']) =>
      ({ codigo, orden, calibre, estado }) as Lote;
    const split = lote('S1', 1, 'Split', 'en_curso');
    const cola = [
      split,
      lote('B1', 2, 'Barrido', 'en_curso'),
      lote('B2', 3, 'Barrido', 'pendiente'),
      lote('S2', 4, 'Split', 'pendiente'),
    ];
    expect(siguienteDeCalibre(cola, split)?.codigo).toBe('S2');
    expect(siguienteDeCalibre(cola.slice(0, 3), split)).toBeUndefined();
    expect(kgTotales({ unidades: 3, kgPorEnvase: 22.7 })).toBe(68.1);
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
      cliente: 'Arcor',
      calibre: 'Split',
      envases: 50,
      kgPorEnvase: 25,
      orden: 1,
      estado: 'cerrado',
      unidades: 42,
      inicio: new Date(2026, 9, 9, 8, 0),
      fin: new Date(2026, 9, 9, 9, 30),
      cerradoPor: 'op@x.com',
      observacion: 'Bolsa nueva',
    };
    const fila = filaLoteTerminado(
      lote,
      [inyeccion(7, 50, '2'), inyeccion(8, 30, '3', 'MP2')],
      [control('08:00', [70, 85, 86, 90, 90, 75]), control('09:00', [70, 75, 79, 70, 70, 70])],
    );
    expect(fila).toEqual([
      'RT01001H26',
      'Arcor',
      'Split',
      '09/10/2026 08:00',
      '09/10/2026 09:30',
      90,
      50,
      42,
      25,
      1050,
      'MP1, MP2',
      'MP1 / 2, MP2 / 3',
      'Prov',
      2,
      '09/10/2026 08:00, 09/10/2026 09:00',
      75,
      1,
      'op@x.com',
      'Bolsa nueva',
    ]);
  });

  it('filters lots by code, client, calibre and overlapping dates, newest first', () => {
    const lote = (codigo: string, cliente: string, inicio: Date | null, fin: Date | null, calibre = 'Split') =>
      ({ codigo, cliente, calibre, inicio, fin }) as Lote;
    const lotes = [
      lote('RT01001H26', '01', new Date(2026, 9, 1, 8), new Date(2026, 9, 1, 10)),
      lote('RT01002H26', '01', new Date(2026, 9, 5, 8), null, 'Barrido'), // en curso
      lote('RT02001H26', '02', new Date(2026, 9, 3, 8), new Date(2026, 9, 3, 9)),
      lote('RT01003H26', '01', null, null), // pendiente: no se muestra
    ];
    const codigos = (f: Partial<typeof FILTRO_VACIO>) =>
      filtrarLotes(lotes, { ...FILTRO_VACIO, ...f }).map((l) => l.codigo);

    expect(codigos({})).toEqual(['RT01002H26', 'RT02001H26', 'RT01001H26']);
    expect(codigos({ texto: 'rt01001' })).toEqual(['RT01001H26']);
    expect(codigos({ cliente: '02' })).toEqual(['RT02001H26']);
    expect(codigos({ calibre: 'Barrido' })).toEqual(['RT01002H26']);
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
