/**
 * Las métricas del panel docente.
 *
 * El panel mostraba los estudiantes y su nivel, pero las métricas del grupo y
 * el mapa de dificultades eran una tarjeta vacía con un "corresponden al Paso
 * 4". Las tablas que las alimentan —sesiones, progreso y catálogo de errores—
 * llevan tiempo llenándose con lo que hacen los alumnos.
 *
 * El cálculo vive aquí, separado de las consultas: la suite lo comprueba con
 * datos de mentira y sin base de datos, que es la única forma de asegurar que
 * los porcentajes salen bien sin depender de que haya alumnos reales.
 */

/** Un intento de respuesta ya calificado. */
export interface IntentoCalificado {
  perfilId: string;
  tema: string;
  acierto: boolean;
}

/** Una debilidad acumulada del catálogo de errores. */
export interface ErrorAcumulado {
  tema: string;
  tipoError: string;
  ocurrencias: number;
}

/** Lo que se sabe de un alumno antes de calcular sus cifras. */
export interface AlumnoEnBruto {
  perfilId: string;
  nombre: string;
  email: string;
  nivel: string | null;
  /** Sesiones que el alumno ha terminado (con fecha de fin). */
  sesionesCompletadas: number;
  ultimaSesion: Date | null;
}

/** Un alumno, con sus cifras ya calculadas. */
export interface AlumnoDelPanel extends AlumnoEnBruto {
  intentos: number;
  aciertos: number;
  /** Porcentaje de aciertos, o null si aún no ha respondido nada. */
  tasaAciertos: number | null;
  estado: EstadoAlumno;
}

/**
 * Cómo va el alumno, de un vistazo.
 *
 *   sin_empezar → no ha hecho el diagnóstico
 *   al_dia      → responde bien la mayoría de las veces
 *   refuerzo    → falla más de lo que acierta
 */
export type EstadoAlumno = "sin_empezar" | "al_dia" | "refuerzo" | "optimo";

/** A partir de este porcentaje, el alumno va sobrado. */
export const UMBRAL_OPTIMO = 90;
/** Por debajo de este, necesita refuerzo. */
export const UMBRAL_REFUERZO = 70;

/**
 * El estado de un alumno según su tasa de aciertos.
 *
 * Sin diagnóstico no hay estado que dar: decir "necesita refuerzo" de alguien
 * que aún no ha empezado sería inventarse un diagnóstico.
 */
export function estadoDeAlumno(
  nivel: string | null,
  tasaAciertos: number | null,
): EstadoAlumno {
  if (!nivel) return "sin_empezar";
  if (tasaAciertos == null) return "al_dia";
  if (tasaAciertos >= UMBRAL_OPTIMO) return "optimo";
  if (tasaAciertos < UMBRAL_REFUERZO) return "refuerzo";
  return "al_dia";
}

/** Porcentaje entero, o null si no hay de qué calcularlo. */
function porcentaje(parte: number, total: number): number | null {
  if (!Number.isFinite(total) || total <= 0) return null;
  return Math.round((parte / total) * 100);
}

/** Los alumnos con sus cifras, del que más ha trabajado al que menos. */
export function alumnosDelPanel(
  alumnos: readonly AlumnoEnBruto[],
  intentos: readonly IntentoCalificado[],
): AlumnoDelPanel[] {
  const porAlumno = new Map<string, { intentos: number; aciertos: number }>();
  for (const i of intentos) {
    const acumulado = porAlumno.get(i.perfilId) ?? { intentos: 0, aciertos: 0 };
    acumulado.intentos++;
    if (i.acierto) acumulado.aciertos++;
    porAlumno.set(i.perfilId, acumulado);
  }

  return alumnos
    .map((a) => {
      const suyo = porAlumno.get(a.perfilId) ?? { intentos: 0, aciertos: 0 };
      const tasa = porcentaje(suyo.aciertos, suyo.intentos);
      return {
        ...a,
        intentos: suyo.intentos,
        aciertos: suyo.aciertos,
        tasaAciertos: tasa,
        estado: estadoDeAlumno(a.nivel, tasa),
      };
    })
    .sort((a, b) => b.intentos - a.intentos || a.nombre.localeCompare(b.nombre));
}

/** Las cifras del grupo. */
export interface MetricasDelGrupo {
  totalAlumnos: number;
  conDiagnostico: number;
  /** Porcentaje de alumnos que ya hicieron el diagnóstico. */
  diagnosticoCompletado: number | null;
  /** Aciertos sobre el total de intentos del grupo. */
  tasaAciertosGlobal: number | null;
  sesionesCompletadas: number;
  /** El tema con más errores acumulados, si hay alguno. */
  temaMasDificil: string | null;
}

export function metricasDelGrupo(
  alumnos: readonly AlumnoEnBruto[],
  intentos: readonly IntentoCalificado[],
  errores: readonly ErrorAcumulado[],
): MetricasDelGrupo {
  const conDiagnostico = alumnos.filter((a) => a.nivel).length;
  const aciertos = intentos.filter((i) => i.acierto).length;

  const porTema = new Map<string, number>();
  for (const e of errores) {
    porTema.set(e.tema, (porTema.get(e.tema) ?? 0) + (e.ocurrencias || 0));
  }
  const masDificil = [...porTema.entries()].sort((a, b) => b[1] - a[1])[0];

  return {
    totalAlumnos: alumnos.length,
    conDiagnostico,
    diagnosticoCompletado: porcentaje(conDiagnostico, alumnos.length),
    tasaAciertosGlobal: porcentaje(aciertos, intentos.length),
    sesionesCompletadas: alumnos.reduce((n, a) => n + a.sesionesCompletadas, 0),
    temaMasDificil: masDificil ? masDificil[0] : null,
  };
}

/** Una barra del mapa de dificultades. */
export interface DificultadRecurrente {
  tema: string;
  tipoError: string;
  ocurrencias: number;
  /** Peso sobre el total de errores del grupo, en porcentaje. */
  peso: number;
}

/**
 * El mapa de dificultades recurrentes, de la más frecuente a la menos.
 *
 * Se agrupa por tema y tipo de error: "en qué se atasca el grupo" es una
 * pregunta sobre el tipo de fallo, no sobre quién lo cometió.
 */
export function dificultadesRecurrentes(
  errores: readonly ErrorAcumulado[],
  cuantas = 5,
): DificultadRecurrente[] {
  const agrupados = new Map<string, DificultadRecurrente>();
  let total = 0;

  for (const e of errores) {
    const ocurrencias = Number(e.ocurrencias) || 0;
    if (ocurrencias <= 0) continue;
    total += ocurrencias;
    const clave = `${e.tema}|${e.tipoError}`;
    const previo = agrupados.get(clave);
    if (previo) previo.ocurrencias += ocurrencias;
    else agrupados.set(clave, { tema: e.tema, tipoError: e.tipoError, ocurrencias, peso: 0 });
  }

  if (total === 0) return [];

  return [...agrupados.values()]
    .map((d) => ({ ...d, peso: Math.round((d.ocurrencias / total) * 100) }))
    .sort((a, b) => b.ocurrencias - a.ocurrencias)
    .slice(0, cuantas);
}

/** Rótulo legible del estado, para la tabla. */
export const ETIQUETA_ESTADO: Record<EstadoAlumno, string> = {
  sin_empezar: "Sin empezar",
  al_dia: "Al día",
  refuerzo: "Refuerzo",
  optimo: "Óptimo",
};
