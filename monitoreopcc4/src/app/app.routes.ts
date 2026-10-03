import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login';
import { MonitoreoComponent } from './components/monitoreo/monitoreo';
import { AdminUsuariosComponent } from './components/admin-usuarios/admin-usuarios';
import { HistorialComponent } from './components/historial/historial';
import { DashboardComponent } from './components/dashboard/dashboard';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'monitoreo', component: MonitoreoComponent, canActivate: [authGuard] },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'historial', component: HistorialComponent, canActivate: [authGuard] },
  { path: 'admin-usuarios', component: AdminUsuariosComponent, canActivate: [authGuard, adminGuard] },
  { path: '**', redirectTo: 'login' }
];