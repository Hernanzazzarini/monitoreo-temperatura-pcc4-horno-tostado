// Pantallas que el admin puede habilitar por usuario (users/{uid}.pantallas).
// "Gestión de Usuarios" no está acá: es siempre y solo del admin.

export type Rol = 'admin' | 'encargada' | 'operador';

export type Pantalla =
  | 'monitoreo'
  | 'historial'
  | 'dashboard'
  | 'lotes'
  | 'inyeccion-mp'
  | 'embolse'
  | 'trazabilidad';

export interface DefPantalla {
  id: Pantalla;
  texto: string;
  roles: Rol[]; // roles que la ven si el usuario no tiene permisos propios
}

export const PANTALLAS: DefPantalla[] = [
  { id: 'monitoreo', texto: 'Nuevo control', roles: ['admin', 'encargada', 'operador'] },
  { id: 'historial', texto: 'Historial', roles: ['admin', 'encargada', 'operador'] },
  { id: 'dashboard', texto: 'Dashboard', roles: ['admin', 'encargada', 'operador'] },
  { id: 'lotes', texto: 'Lotes', roles: ['admin', 'encargada'] },
  { id: 'inyeccion-mp', texto: 'Inyección MP', roles: ['admin', 'encargada', 'operador'] },
  { id: 'embolse', texto: 'Embolse', roles: ['admin', 'encargada', 'operador'] },
  { id: 'trazabilidad', texto: 'Dashboard Trazabilidad', roles: ['admin', 'encargada', 'operador'] },
];

export interface Perfil {
  rol: Rol;
  pantallas?: Pantalla[]; // sin definir: las de su rol
}

export function pantallasDeRol(rol: Rol): Pantalla[] {
  return PANTALLAS.filter((p) => p.roles.includes(rol)).map((p) => p.id);
}

/** Pantallas que puede abrir el usuario. El admin las ve todas. */
export function pantallasPermitidas(perfil: Perfil | null): Pantalla[] {
  if (!perfil) return [];
  if (perfil.rol === 'admin') return PANTALLAS.map((p) => p.id);
  const ids = PANTALLAS.map((p) => p.id);
  return perfil.pantallas
    ? perfil.pantallas.filter((p) => ids.includes(p))
    : pantallasDeRol(perfil.rol);
}

/** Primera ruta a la que mandar al usuario al entrar (null: no tiene ninguna). */
export function rutaInicial(perfil: Perfil | null): string | null {
  if (perfil?.rol === 'admin') return '/admin-usuarios';
  const [primera] = pantallasPermitidas(perfil);
  return primera ? '/' + primera : null;
}
