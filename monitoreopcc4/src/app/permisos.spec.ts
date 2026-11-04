import { pantallasPermitidas, rutaInicial } from './permisos';

describe('permisos', () => {
  it('uses the role defaults when the user has no screens of their own', () => {
    expect(pantallasPermitidas({ rol: 'operador' })).not.toContain('lotes');
    expect(pantallasPermitidas({ rol: 'encargada' })).toContain('lotes');
  });

  it('uses the screens enabled by the admin', () => {
    expect(pantallasPermitidas({ rol: 'operador', pantallas: ['embolse', 'lotes'] })).toEqual([
      'embolse',
      'lotes',
    ]);
    expect(pantallasPermitidas({ rol: 'encargada', pantallas: [] })).toEqual([]);
  });

  it('gives the admin every screen', () => {
    expect(pantallasPermitidas({ rol: 'admin', pantallas: [] })).toContain('lotes');
    expect(rutaInicial({ rol: 'admin' })).toBe('/admin-usuarios');
  });

  it('sends users to their first enabled screen', () => {
    expect(rutaInicial({ rol: 'operador', pantallas: ['embolse'] })).toBe('/embolse');
    expect(rutaInicial({ rol: 'operador', pantallas: [] })).toBeNull();
    expect(rutaInicial(null)).toBeNull();
  });
});
