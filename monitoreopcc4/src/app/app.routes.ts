import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { MonitoreoComponent } from './components/monitoreo/monitoreo';
import { AdminUsuariosComponent } from './components/admin-usuarios/admin-usuarios';
import { HistorialComponent } from './components/historial/historial';
import { DashboardComponent } from './components/dashboard/dashboard';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { encargadaGuard } from './guards/encargada-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'monitoreo', component: MonitoreoComponent, canActivate: [authGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'historial', component: HistorialComponent, canActivate: [authGuard] },
  // Trazabilidad del tostado: se cargan aparte para no agrandar el paquete inicial
  {
    path: 'lotes',
    loadComponent: () => import('./components/lotes/lotes').then((m) => m.LotesComponent),
    canActivate: [authGuard, encargadaGuard],
  },
  {
    path: 'inyeccion-mp',
    loadComponent: () =>
      import('./components/inyeccion-mp/inyeccion-mp').then((m) => m.InyeccionMpComponent),
    canActivate: [authGuard],
  },
  {
    path: 'embolse',
    loadComponent: () => import('./components/embolse/embolse').then((m) => m.EmbolseComponent),
    canActivate: [authGuard],
  },
  {
    path: 'trazabilidad',
    loadComponent: () =>
      import('./components/dashboard-trazabilidad/dashboard-trazabilidad').then(
        (m) => m.DashboardTrazabilidadComponent,
      ),
    canActivate: [authGuard],
  },
  { path: 'admin-usuarios', component: AdminUsuariosComponent, canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: 'login' }
];