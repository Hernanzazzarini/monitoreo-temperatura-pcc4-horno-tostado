import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { MonitoreoComponent } from './components/monitoreo/monitoreo';
import { AdminUsuariosComponent } from './components/admin-usuarios/admin-usuarios';
import { HistorialComponent } from './components/historial/historial';
import { DashboardComponent } from './components/dashboard/dashboard';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { pantallaGuard } from './guards/pantalla-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  {
    path: 'monitoreo',
    component: MonitoreoComponent,
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'monitoreo' },
  },
  {
    path: 'dashboard',
    component: DashboardComponent,
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'dashboard' },
  },
  {
    path: 'historial',
    component: HistorialComponent,
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'historial' },
  },
  // Trazabilidad del tostado: se cargan aparte para no agrandar el paquete inicial
  {
    path: 'lotes',
    loadComponent: () => import('./components/lotes/lotes').then((m) => m.LotesComponent),
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'lotes' },
  },
  {
    path: 'inyeccion-mp',
    loadComponent: () =>
      import('./components/inyeccion-mp/inyeccion-mp').then((m) => m.InyeccionMpComponent),
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'inyeccion-mp' },
  },
  {
    path: 'embolse',
    loadComponent: () => import('./components/embolse/embolse').then((m) => m.EmbolseComponent),
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'embolse' },
  },
  {
    path: 'trazabilidad',
    loadComponent: () =>
      import('./components/dashboard-trazabilidad/dashboard-trazabilidad').then(
        (m) => m.DashboardTrazabilidadComponent,
      ),
    canActivate: [authGuard, pantallaGuard],
    data: { pantalla: 'trazabilidad' },
  },
  { path: 'admin-usuarios', component: AdminUsuariosComponent, canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: 'login' }
];