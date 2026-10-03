import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  linkWithPopup,
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signOut,
  user,
  User
} from '@angular/fire/auth';
import { Firestore, doc, getDoc, setDoc } from '@angular/fire/firestore';
import { deleteApp, initializeApp } from 'firebase/app';
import { createUserWithEmailAndPassword, getAuth } from 'firebase/auth';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
// Los tokens de Google duran 1 hora; renovamos un poco antes
const GOOGLE_TOKEN_TTL_MS = 55 * 60 * 1000;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  private firestore: Firestore = inject(Firestore);

  // Observable que emite el usuario actual de Firebase Authentication
  user$: Observable<User | null> = user(this.auth);

  private googleToken: string | null = null;
  private googleTokenExpira = 0;

  constructor() {}

  // Iniciar sesión con correo y contraseña
  login(email: string, pass: string): Observable<any> {
    return from(signInWithEmailAndPassword(this.auth, email, pass));
  }

  // Cerrar sesión
  logout(): Observable<any> {
    this.limpiarTokenGoogle();
    return from(signOut(this.auth));
  }

  /**
   * Obtiene un token OAuth de Google con permiso sobre Google Sheets.
   * La primera vez vincula la cuenta de Google al usuario actual (popup);
   * después reautentica con esa misma cuenta. El token se cachea en memoria.
   */
  async obtenerTokenGoogle(): Promise<string> {
    if (this.googleToken && Date.now() < this.googleTokenExpira) {
      return this.googleToken;
    }

    const usuario = this.auth.currentUser;
    if (!usuario) throw new Error('No hay un usuario autenticado.');

    const provider = new GoogleAuthProvider();
    provider.addScope(SHEETS_SCOPE);
    if (usuario.email) provider.setCustomParameters({ login_hint: usuario.email });

    const yaVinculado = usuario.providerData.some((p) => p.providerId === GoogleAuthProvider.PROVIDER_ID);
    const resultado = yaVinculado
      ? await reauthenticateWithPopup(usuario, provider)
      : await linkWithPopup(usuario, provider);

    const token = GoogleAuthProvider.credentialFromResult(resultado)?.accessToken;
    if (!token) throw new Error('Google no devolvió un token de acceso.');

    this.googleToken = token;
    this.googleTokenExpira = Date.now() + GOOGLE_TOKEN_TTL_MS;
    return token;
  }

  // true si hay un token de Google vigente (se puede leer la planilla sin abrir el popup)
  tieneTokenGoogle(): boolean {
    return !!this.googleToken && Date.now() < this.googleTokenExpira;
  }

  // Descarta el token cacheado (por ejemplo, si Sheets respondió 401)
  limpiarTokenGoogle(): void {
    this.googleToken = null;
    this.googleTokenExpira = 0;
  }

  // Verificar si el usuario actual es administrador consultando Firestore
  isAdmin(): Observable<boolean> {
    return this.user$.pipe(
      switchMap(async (user) => {
        if (!user) return false;
        
        const userRef = doc(this.firestore, `users/${user.uid}`);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const data = userSnap.data();
          return data['role'] === 'admin';
        }
        return false;
      })
    );
  }

  /**
   * Crea un usuario nuevo (Authentication + documento en `users`) sin cerrar la sesión del admin.
   * createUserWithEmailAndPassword inicia sesión con la cuenta creada, así que se usa una
   * instancia secundaria de Firebase que se descarta al terminar.
   */
  async crearUsuario(email: string, pass: string, role: 'admin' | 'operador'): Promise<string> {
    const appSecundaria = initializeApp(environment.firebase, `alta-usuario-${Date.now()}`);
    try {
      const authSecundaria = getAuth(appSecundaria);
      const cred = await createUserWithEmailAndPassword(authSecundaria, email, pass);
      await signOut(authSecundaria);

      // El documento lo escribe la sesión del admin (las reglas solo permiten escribir a admins)
      await setDoc(doc(this.firestore, `users/${cred.user.uid}`), {
        email,
        role,
        createdAt: new Date()
      });
      return cred.user.uid;
    } finally {
      await deleteApp(appSecundaria);
    }
  }

  // Método auxiliar para crear el primer usuario administrador manualmente si hace falta
  async crearUsuarioAdmin(uid: string, email: string) {
    const userRef = doc(this.firestore, `users/${uid}`);
    await setDoc(userRef, {
      email: email,
      role: 'admin',
      createdAt: new Date()
    }, { merge: true });
  }
}