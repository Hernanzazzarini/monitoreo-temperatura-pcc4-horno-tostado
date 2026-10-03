import { TURNOS, horaSetSugerida, horasSet, turnoActual } from './pcc4';

const turno = (id: string) => TURNOS.find((t) => t.id === id)!;
const a = (h: number, m = 0) => new Date(2026, 9, 3, h, m);

describe('horas set por turno', () => {
  it('lists every hour from start to end of the shift', () => {
    expect(horasSet(turno('manana'))).toEqual([
      '06:00', '07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00',
    ]);
    expect(horasSet(turno('noche'))[0]).toBe('22:00');
    expect(horasSet(turno('noche')).at(-1)).toBe('06:00');
    expect(horasSet(turno('doble')).length).toBe(17);
  });

  it('picks the 8-hour shift of the current time', () => {
    expect(turnoActual(a(6)).id).toBe('manana');
    expect(turnoActual(a(13, 59)).id).toBe('manana');
    expect(turnoActual(a(14)).id).toBe('tarde');
    expect(turnoActual(a(23)).id).toBe('noche');
    expect(turnoActual(a(3)).id).toBe('noche');
  });

  it('suggests the nearest hour set within the shift', () => {
    expect(horaSetSugerida(turno('manana'), a(8, 10))).toBe('08:00');
    expect(horaSetSugerida(turno('manana'), a(8, 45))).toBe('09:00');
    expect(horaSetSugerida(turno('noche'), a(1, 5))).toBe('01:00');
    expect(horaSetSugerida(turno('manana'), a(14, 20))).toBe('14:00');
    expect(horaSetSugerida(turno('manana'), a(18))).toBe('06:00');
  });
});
