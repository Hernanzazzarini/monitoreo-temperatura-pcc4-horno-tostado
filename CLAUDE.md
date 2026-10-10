# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

"Monitoreo Horno PCC4" — an Angular 21 SPA for kiln (horno) operators to log temperature/pressure readings. Auth and user roles live in Firebase (Auth + Firestore); the readings themselves are appended to a Google Sheet through the Sheets REST API. UI text, identifiers, and comments are in Spanish — keep that convention.

## Repository layout

The actual Angular project is in `monitoreopcc4/`; run everything from there. The outer folder's `package.json` / `node_modules` (only `@angular/fire` and `firebase`) are a leftover from installing in the wrong directory and are not used. The app uses `@angular/fire@21.0.0-rc.1` (the stable 20.x line only supports Angular 20) and `zone.js` (registered as a polyfill in `angular.json`).

## Commands

Run from `monitoreopcc4/`:

- `npm start` (`ng serve`) — dev server at http://localhost:4200
- `npm run build` — production build to `dist/` (budgets: 1.1MB warn / 1.5MB error initial — Firebase alone is ~900kB; 4kB / 8kB per component style)
- `npm run watch` — dev build in watch mode
- `npm test` (`ng test`) — Vitest via `@angular/build:unit-test`, jsdom environment
- Single test file: `npx ng test --include src/app/services/auth.spec.ts`
- Format: `npx prettier --write <files>` (printWidth 100, single quotes, Angular parser for HTML)

TypeScript runs in strict mode with `strictTemplates`, `noPropertyAccessFromIndexSignature` (use `data['role']`, not `data.role`), and `noImplicitReturns`.

## Architecture

- **Bootstrap**: `src/main.ts` → standalone `App` with `appConfig` (router, HttpClient, Firebase app/Auth/Firestore from `environment.firebase`). No NgModules.
- **Routes** (`app.routes.ts`): `login` (public); `monitoreo`, `historial`, `dashboard` (`authGuard`); lazy-loaded traceability pages `lotes` (`authGuard` + `encargadaGuard`), `inyeccion-mp`, `embolse`, `trazabilidad` (`authGuard`); `admin-usuarios` (`authGuard` + `adminGuard`); everything else redirects to `login`.
- **AuthService** (`services/auth.ts`): wraps Firebase email/password sign-in; `user$` is the auth-state stream. Roles are **not** custom claims — `rol()` reads `users/{uid}.role` (`'admin' | 'encargada' | 'operador'`) from Firestore on every call; `isAdmin()` / `puedeGenerarLotes()` derive from it. `crearUsuarioAdmin()` exists to seed the first admin manually.
- **Guards** (`guards/`): functional `CanActivateFn`s that take one emission from `user$` / `isAdmin()`; non-admins are redirected to `/monitoreo`, unauthenticated users to `/login`.
- **GoogleDriveService** (`services/google-drive.ts`): appends/reads rows in range `Hoja 1!A:O` of `environment.spreadsheetId`, mirroring the paper form "TEMPERATURA DE HORNO – PCC N°4" (VR PR FO T 007): Fecha, Hora set, Hora control, Quemadores 1–6, Velocidad banda, Altura cámara, Observaciones, Acciones correctivas, Modificaciones, Responsable (`RegistroHorno`). Uses a Google OAuth bearer token.
- **RegistrosService** (`services/registros.ts`): shared read path for Historial and Dashboard — gets the Google token, reads the sheet, caches the last result in a `BehaviorSubject` (`registros$`, cleared on logout), shares an in-flight read between callers, clears the token on 401. The monitoreo form pushes each saved control into the cache with `agregarLocal()`.
- **Encabezado** (`components/encabezado`): shared header used by every page except login — title, signed-in email, nav links (hides the current route; "Gestión de Usuarios" only for admins), notification bell, logout. Pages no longer have their own nav/logout methods.
- **NotificacionesService** (`services/notificaciones.ts`): `calcularAlertas()` (pure) turns the cached rows into alerts for controls in the last 7 days whose burners fail the PCC (no consecutive pair ≥ 80°C). Read state is a set of alert ids in localStorage. Every 5 min, if a Google token is cached, it re-reads the sheet silently; alerts new since the last read raise a browser `Notification` if permission was granted. There is no server push — users only get alerts while their app is open with a valid token.
- **Dashboard** (`components/dashboard`, route `/dashboard`): `resumir(registros, periodo)` (pure, unit-tested) builds KPIs, series and the row detail for a desde–hasta `Periodo` (the 7/30/90/Todo buttons just fill it via `ultimosDias()`). The PDF report is the browser's print view (`generarPdf()` → `window.print()`): global `.no-imprimir` / `.solo-imprimir` classes and `@page` A4 landscape live in `src/styles.css`, report styles in `dashboard/reporte.css` (split out to stay under the per-file style budget), and chart SVGs carry a `viewBox` so they scale to the page; charts are hand-rolled SVG components in `components/graficos` (no chart library — keeps the bundle under budget). Colors are CSS variables set on `.dashboard`. Chart hover state must go through `marcar()` which calls `cdr.markForCheck()`: assigning `hover` directly from template events did not re-render the chart components.
- **Historial** (`components/historial`, route `/historial`): reads the sheet with `UNFORMATTED_VALUE` numbers, keeps only rows with numeric burner cells (skips the header block), shows newest first with desde–hasta date range / "solo desvíos" filters. Loads automatically only if a Google token is already cached; otherwise waits for a click so the OAuth popup isn't blocked.
- **Hora set / turnos** (`TURNOS`, `horasSet`, `horaSetSugerida` in `pcc4.ts`): hora set is a select of on-the-hour slots from shift start to end inclusive (8 h or 16 h shifts); the shift is remembered in localStorage, defaulting to the 8 h shift of the current time; after saving, the next slot is preselected. Hora control is the actual save time. The shift is a plain property, not a form control.
- **PCC limits** (`LIMITES` and helpers in `src/app/pcc4.ts`, shared by form and historial; components expose them via a getter — a plain `readonly limites = LIMITES` field came out `undefined` in the Vitest bundle): at least 2 *consecutive* burners ≥ 80°C, belt speed 0.40–0.7, chamber height 5–7 cm. Any deviation makes "Acciones correctivas" required (form-level validator).
- **Google token flow** (`AuthService.obtenerTokenGoogle`): users log in with email/password, then on first save a popup links their Google account (`linkWithPopup`) with the `spreadsheets` scope; later saves use `reauthenticateWithPopup`. The access token is cached in memory for 55 min and cleared on logout or a 401 from Sheets. Requires the Google provider enabled in Firebase Auth, the Sheets API enabled in the GCP project, and the sheet shared with each operator's Google account.
- **Trazabilidad del tostado** (`trazabilidad.ts` pure helpers + `services/trazabilidad.ts`): live shared state in Firestore — `lotes/{codigo}` (queue: `pendiente` → `en_curso` → `cerrado`, `orden`, `unidades`, `inicio`/`fin`, `respaldado`) and `inyecciones` (MP containers loaded into the hopper). Lot codes are `RT` + client (2 digits) + correlative (3) + `H` + year (2), generated in a transaction that fails if any code exists. Closing a lot (`embolse`) sets its `fin` and the next lot's `inicio` in one batch; then `respaldar()` associates the injections and oven controls in [inicio, fin] **plus the last one before inicio** (`enVentana`) and appends a row to the `Lotes_Terminados` tab; failures leave `respaldado: false` and show a retry list. Each injection is also copied to the `Inyeccion_MP` tab. `GoogleDriveService.agregarFila()` creates a missing tab with its header row. The Google token promise is started synchronously inside the click so Safari doesn't block the popup. Closed lots store their `materiaPrima` (the injections of their window) at close time, so it doesn't depend on the Sheets backup. `/trazabilidad` (`dashboard-trazabilidad`) loads all lots with `getDocs`, filters them with `filtrarLotes` (code/client/overlapping dates; `?lote=` query param preselects), and per lot shows its MP plus every oven control of its window (`controlesDeLote`, flags the one in force before the start) read from Sheets via `RegistrosService`. Firestore rules live in `monitoreopcc4/firestore.rules` (`firebase deploy --only firestore:rules`).
- **Components**: `login` (redirects admins to `admin-usuarios`, others to `monitoreo`), `monitoreo` (reading entry form), `admin-usuarios` (lists all docs in the Firestore `users` collection and creates users via `AuthService.crearUsuario`, which uses a throwaway secondary Firebase app so the admin's session isn't replaced, then writes `users/{uid}` with the admin's session).
- **Deploy**: from `monitoreopcc4/`, `npm run build` then `firebase deploy --only hosting` (site monitoreo-horno-pcc4.web.app; `index.html` is served no-cache).
- **Config**: `src/environments/environment.ts` holds the Firebase web config and spreadsheet ID; there is no separate production environment file or `fileReplacements` set up.

## Testing notes

Specs mock `AuthService`, `Firestore`, and `GoogleDriveService` via providers rather than hitting Firebase. Page specs render the shared header, so they spread `AUTH_ENCABEZADO` into the auth mock and add `PROVEEDOR_NOTIFICACIONES` (`src/app/testing/encabezado.ts`). Under zone.js, `fixture.whenStable()` alone does not run `ngOnInit` — call `fixture.detectChanges()` first.
