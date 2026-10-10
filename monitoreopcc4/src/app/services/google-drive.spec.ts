import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { GoogleDriveService } from './google-drive';

describe('GoogleDriveService', () => {
  let service: GoogleDriveService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(GoogleDriveService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should append a row in columns A:O with the bearer token', () => {
    service
      .agregarRegistro('token-123', {
        fecha: '02/10/2026',
        horaSet: '08:00',
        horaControl: '08:15',
        quemadores: [70, 82, 85, 79, 81, 75],
        velocidadBanda: 0.5,
        alturaCamara: 6,
        observaciones: 'obs',
        accionesCorrectivas: '',
        modificaciones: '',
        responsable: 'Juan Pérez',
      })
      .subscribe();

    const req = httpMock.expectOne((r) => r.url.includes('A%3AO:append'));
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-123');
    expect(req.request.body.values[0]).toEqual([
      '02/10/2026', '08:00', '08:15', 70, 82, 85, 79, 81, 75, 0.5, 6, 'obs', '', '', 'Juan Pérez',
    ]);
    req.flush({});
  });

  it('parses data rows and skips header rows', () => {
    let resultado: any[] = [];
    service.obtenerRegistros('token-123').subscribe((r) => (resultado = r));

    const req = httpMock.expectOne((r) => r.url.includes('UNFORMATTED_VALUE'));
    req.flush({
      values: [
        ['TEMPERATURA DE HORNO'],
        ['FECHA', 'HORA SET', 'HORA CONTROL', 'QUEMADOR 1', 'QUEMADOR 2'],
        ['02/10/2026', '08:00', '08:15', 70, 82, 85, 79, 81, 75, 0.5, 6, 'obs', '', '', 'Juan'],
      ],
    });

    expect(resultado.length).toBe(1);
    expect(resultado[0]).toMatchObject({
      fecha: '02/10/2026',
      quemadores: [70, 82, 85, 79, 81, 75],
      velocidadBanda: 0.5,
      alturaCamara: 6,
      responsable: 'Juan',
    });
  });

  it('creates a missing tab with its header before appending', () => {
    service.agregarFila('t', 'Lotes_Terminados', ['Lote', 'Unidades'], ['RT01001H26', 5]).subscribe();

    httpMock
      .expectOne((r) => r.url.includes('fields=sheets.properties.title'))
      .flush({ sheets: [{ properties: { title: 'Hoja 1' } }] });
    const crear = httpMock.expectOne((r) => r.url.endsWith(':batchUpdate'));
    expect(crear.request.body.requests[0].addSheet.properties.title).toBe('Lotes_Terminados');
    crear.flush({});
    const agregar = httpMock.expectOne((r) => r.url.includes(':append'));
    expect(agregar.request.url).toContain(encodeURIComponent("'Lotes_Terminados'!A1"));
    expect(agregar.request.body.values).toEqual([
      ['Lote', 'Unidades'],
      ['RT01001H26', 5],
    ]);
    agregar.flush({});

    // La segunda vez ya se sabe que existe: solo agrega la fila
    service.agregarFila('t', 'Lotes_Terminados', ['Lote', 'Unidades'], ['RT01002H26', 3]).subscribe();
    expect(httpMock.expectOne((r) => r.url.includes(':append')).request.body.values).toEqual([
      ['RT01002H26', 3],
    ]);
  });

  it('converts date/time serial numbers from number-formatted columns', () => {
    let resultado: any[] = [];
    service.obtenerRegistros('token-123').subscribe((r) => (resultado = r));

    httpMock.expectOne((r) => r.url.includes('UNFORMATTED_VALUE')).flush({
      values: [[46298, 0.4583333333333333, 0.46597222222222223, 150, 155, 154, 156, 156, 80]],
    });

    expect(resultado[0]).toMatchObject({
      fecha: '03/10/2026',
      horaSet: '11:00',
      horaControl: '11:11',
    });
  });
});
