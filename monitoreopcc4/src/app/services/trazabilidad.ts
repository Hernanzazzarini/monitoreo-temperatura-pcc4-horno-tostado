import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  Timestamp,
  addDoc,
  collection,
  collectionData,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from '@angular/fire/firestore';
import { Observable, firstValueFrom, map } from 'rxjs';
import { AuthService } from './auth';
import { GoogleDriveService } from './google-drive';
import { RegistrosService } from './registros';
import {
  ENCABEZADO_INYECCION,
  ENCABEZADO_LOTES,
  Inyeccion,
  Lote,
  SOLAPA_INYECCION,
  SOLAPA_LOTES,
  controlesDelLote,
  filaInyeccion,
  filaLoteTerminado,
  inyeccionesDelLote,
  ordenarCola,
} from '../trazabilidad';

// Datos que la encargada programa para cada lote
export type DatosLote = Pick<Lote, 'cliente' | 'calibre' | 'envases' | 'kgPorEnvase' | 'observacion'>;

// Firestore devuelve las fechas como Timestamp
const aFecha = (v: any): Date | null => (v instanceof Timestamp ? v.toDate() : (v ?? null));

function docAInyeccion(d: any): Inyeccion {
  return { ...d, fecha: aFecha(d.fecha)! };
}

function docALote(d: any): Lote {
  return {
    calibre: '',
    envases: 0,
    kgPorEnvase: 0,
    ...d,
    inicio: aFecha(d.inicio),
    fin: aFecha(d.fin),
    materiaPrima: d.materiaPrima?.map(docAInyeccion),
  };
}

/**
 * Estado compartido de la trazabilidad (cola de lotes, embolse e inyección de MP) en Firestore,
 * para que la encargada, la tolva y el panel de embolse vean lo mismo en tiempo real.
 * Las solapas Inyeccion_MP y Lotes_Terminados de la planilla son el respaldo consolidado.
 */
@Injectable({
  providedIn: 'root',
})
export class TrazabilidadService {
  private firestore = inject(Firestore);
  private authService = inject(AuthService);
  private googleDriveService = inject(GoogleDriveService);
  private registrosService = inject(RegistrosService);

  private lotes = collection(this.firestore, 'lotes');
  private inyecciones = collection(this.firestore, 'inyecciones');

  // Lotes pendientes y en curso, en orden de embolse
  readonly cola$: Observable<Lote[]> = collectionData(
    query(this.lotes, where('estado', 'in', ['pendiente', 'en_curso'])),
  ).pipe(map((docs) => ordenarCola(docs.map(docALote))));

  // Lotes cerrados que todavía no se pudieron enviar a la planilla
  readonly sinRespaldo$: Observable<Lote[]> = collectionData(
    query(this.lotes, where('respaldado', '==', false)),
  ).pipe(map((docs) => docs.map(docALote).sort((a, b) => a.orden - b.orden)));

  // Últimos lotes cerrados, el más reciente primero (los no cerrados tienen fin null y quedan al final)
  readonly terminados$: Observable<Lote[]> = collectionData(
    query(this.lotes, orderBy('fin', 'desc'), limit(30)),
  ).pipe(map((docs) => docs.map(docALote).filter((l) => l.estado === 'cerrado')));

  readonly ultimasInyecciones$: Observable<Inyeccion[]> = collectionData(
    query(this.inyecciones, orderBy('fecha', 'desc'), limit(15)),
    { idField: 'id' },
  ).pipe(map((docs) => docs.map(docAInyeccion)));

  private get email(): string {
    return this.authService.emailActual();
  }

  // Todos los lotes (para el dashboard de trazabilidad)
  async obtenerLotes(): Promise<Lote[]> {
    const snap = await getDocs(this.lotes);
    return snap.docs.map((d) => docALote(d.data()));
  }

  // Códigos que ya están usados por algún lote (programado, en curso o cerrado)
  async codigosExistentes(codigos: string[]): Promise<string[]> {
    const snaps = await Promise.all(codigos.map((c) => getDoc(doc(this.lotes, c))));
    return snaps.filter((s) => s.exists()).map((s) => s.id);
  }

  /**
   * Agrega los lotes al final de la cola. Los lotes son únicos: el código es el id del documento
   * y la transacción falla si alguno ya existe (las reglas de Firestore tampoco dejan pisarlo).
   */
  async generarLotes(codigos: string[], datos: DatosLote): Promise<string[]> {
    if (new Set(codigos).size !== codigos.length) {
      throw new LotesExistentesError(codigos.filter((c, i) => codigos.indexOf(c) !== i));
    }
    const ordenBase = Date.now() * 1000;
    const { observacion, ...resto } = datos;
    const nuevos: Lote[] = codigos.map((codigo, i) => ({
      codigo,
      ...resto,
      ...(observacion ? { observacion, observacionPor: this.email } : {}),
      orden: ordenBase + i,
      estado: 'pendiente',
      unidades: 0,
      inicio: null,
      fin: null,
    }));

    await runTransaction(this.firestore, async (tx) => {
      const refs = nuevos.map((l) => doc(this.lotes, l.codigo));
      const existentes = (await Promise.all(refs.map((r) => tx.get(r)))).filter((s) => s.exists());
      if (existentes.length) {
        throw new LotesExistentesError(existentes.map((s) => s.id));
      }
      refs.forEach((r, i) =>
        tx.set(r, { ...nuevos[i], creadoPor: this.email, creadoEn: new Date() }),
      );
    });
    return nuevos.map((l) => l.codigo);
  }

  /** Observación de la encargada para el lote ('' la borra). */
  async guardarObservacion(lote: Lote, texto: string): Promise<void> {
    await updateDoc(doc(this.lotes, lote.codigo), {
      observacion: texto,
      observacionPor: texto ? this.email : '',
    });
  }

  async quitarDeCola(lote: Lote): Promise<void> {
    await deleteDoc(doc(this.lotes, lote.codigo));
  }

  /** Empieza a embolsar un lote programado (en paralelo con los que ya están en curso). */
  async iniciarLote(lote: Lote): Promise<void> {
    await updateDoc(doc(this.lotes, lote.codigo), { estado: 'en_curso', inicio: new Date() });
  }

  /** +1 / -1 envase embolsado. El primer envase de un lote pendiente abre su ventana. */
  async sumarUnidad(lote: Lote, delta: 1 | -1): Promise<void> {
    if (delta < 0 && lote.unidades <= 0) return;
    await updateDoc(doc(this.lotes, lote.codigo), {
      unidades: increment(delta),
      ...(lote.inicio ? {} : { inicio: new Date(), estado: 'en_curso' }),
    });
  }

  // Envases inyectados en la ventana del lote más el último anterior (el que seguía en la tolva)
  async materiaPrimaDe(inicio: Date, fin: Date): Promise<Inyeccion[]> {
    const [dentro, anterior] = await Promise.all([
      getDocs(query(this.inyecciones, where('fecha', '>=', inicio), where('fecha', '<=', fin))),
      getDocs(query(this.inyecciones, where('fecha', '<', inicio), orderBy('fecha', 'desc'), limit(1))),
    ]);
    return inyeccionesDelLote(
      [...anterior.docs, ...dentro.docs].map((d) => docAInyeccion(d.data())),
      inicio,
      fin,
    );
  }

  /**
   * Cierra el lote guardando la materia prima que lo formó, y abre en el mismo instante el
   * siguiente de su calibre (su ventana empieza ahora). El respaldo en la planilla va aparte.
   */
  async cerrarLote(lote: Lote, siguiente: Lote | undefined): Promise<Lote> {
    const ahora = new Date();
    const inicio = lote.inicio ?? ahora;
    const materiaPrima = await this.materiaPrimaDe(inicio, ahora);
    const cerrado: Lote = {
      ...lote,
      estado: 'cerrado',
      inicio,
      fin: ahora,
      respaldado: false,
      cerradoPor: this.email,
      materiaPrima,
    };
    const batch = writeBatch(this.firestore);
    batch.update(doc(this.lotes, lote.codigo), {
      estado: 'cerrado',
      inicio,
      fin: ahora,
      respaldado: false,
      cerradoPor: cerrado.cerradoPor,
      materiaPrima,
    });
    if (siguiente) {
      batch.update(doc(this.lotes, siguiente.codigo), { estado: 'en_curso', inicio: ahora });
    }
    await batch.commit();
    return cerrado;
  }

  /**
   * Consolida un lote cerrado: MP inyectada y controles del horno de su ventana de tiempo
   * (más lo anterior que seguía vigente), y lo agrega a la solapa Lotes_Terminados.
   */
  async respaldar(lote: Lote): Promise<void> {
    const inicio = lote.inicio!;
    const fin = lote.fin!;
    const token = await this.authService.obtenerTokenGoogle();

    const [inyecciones, registros] = await Promise.all([
      lote.materiaPrima ?? this.materiaPrimaDe(inicio, fin),
      firstValueFrom(this.registrosService.cargar()),
    ]);
    const controles = controlesDelLote(registros, inicio, fin);

    await firstValueFrom(
      this.googleDriveService.agregarFila(
        token,
        SOLAPA_LOTES,
        ENCABEZADO_LOTES,
        filaLoteTerminado(lote, inyecciones, controles),
      ),
    );
    await updateDoc(doc(this.lotes, lote.codigo), { respaldado: true });
  }

  /** Registra un envase cargado en la tolva (queda en Firestore para asociarlo a los lotes). */
  async registrarInyeccion(
    datos: Pick<Inyeccion, 'loteMp' | 'envase' | 'proveedor' | 'loteEnCurso'>,
  ): Promise<Inyeccion> {
    const inyeccion: Inyeccion = { ...datos, fecha: new Date(), responsable: this.email };
    await addDoc(this.inyecciones, inyeccion);
    return inyeccion;
  }

  // Copia de la inyección en la solapa Inyeccion_MP
  async respaldarInyeccion(inyeccion: Inyeccion, token: string): Promise<void> {
    await firstValueFrom(
      this.googleDriveService.agregarFila(
        token,
        SOLAPA_INYECCION,
        ENCABEZADO_INYECCION,
        filaInyeccion(inyeccion),
      ),
    );
  }
}

export class LotesExistentesError extends Error {
  constructor(readonly codigos: string[]) {
    super(`Ya existen los lotes ${codigos.join(', ')}`);
  }
}
