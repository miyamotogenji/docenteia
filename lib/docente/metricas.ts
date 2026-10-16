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

// ── Semáforo de riesgo académico (HITO 4 — cierre PMV2) ──────────────────────
//
// «Riesgo Alto (Badge Rojo): > 3 intentos fallidos consecutivos en un tema o
// ≥ 2 tareas vencidas sin entrega. En Observación (Badge Ámbar): Promedio de
// aciertos < 60% o 1 tarea vencida pendiente de entrega. Óptimo (Badge
// Verde): Tasa de acierto y cumplimiento ≥ 80% con entregas dentro del
// plazo.»
//
// Es UNA SEÑAL DISTINTA de `estadoDeAlumno`, no su reemplazo: aquél mide "qué
// tan bien responde" (una sola cifra, la tasa de aciertos); éste mide "¿hace
// falta intervenir YA?", y por eso mira también las TAREAS —vencidas sin
// entregar, entregadas tarde—, que `estadoDeAlumno` no conocía porque son del
// HITO 3 (aulas y tareas programadas), posterior a cuando se escribió.

export type NivelDeRiesgo = "alto" | "observacion" | "optimo" | "sin_datos";

export interface SenalesDeRiesgo {
  /**
   * La racha de fallos SEGUIDOS más larga que el alumno tiene AHORA MISMO en
   * cualquiera de sus temas —no un máximo histórico que ya dejó atrás: un
   * alumno que falló 5 seguidos el mes pasado y acierta desde entonces no
   * está en riesgo por eso—. `null` sin ningún intento registrado.
   */
  rachaMaximaDeFallos: number | null;
  /** 0-100, o `null` sin intentos de los que calcularla. */
  tasaAciertos: number | null;
  /** Tareas de sus aulas, vencidas, que nunca entregó. */
  tareasVencidasSinEntregar: number;
  /**
   * De las tareas que SÍ entregó, ¿todas antes de vencer? `null` si no tiene
   * ninguna entrega con la que juzgarlo —no es lo mismo que "sí, a tiempo"—.
   */
  todasEntregadasEnPlazo: boolean | null;
}

/**
 * El nivel de riesgo de un alumno, de la señal más grave a la más leve: un
 * ALTO por fallos consecutivos pesa más que un buen promedio general, porque
 * es la pregunta que de verdad le importa al docente —"¿hay alguien que
 * necesite ayuda ya mismo?"—, no un resumen estadístico.
 *
 * El hueco entre "no es Alto" y "no llega a Óptimo" (p. ej. 70% de aciertos,
 * sin tareas vencidas) cae en Observación por el mismo motivo que el pliego
 * sólo define tres franjas: el semáforo no deja a nadie sin color, y lo que
 * no es claramente bueno ni claramente malo es, por definición, "para
 * vigilar".
 */
export function riesgoAcademico(s: SenalesDeRiesgo): NivelDeRiesgo {
  const sinDatos =
    s.rachaMaximaDeFallos == null &&
    s.tasaAciertos == null &&
    s.tareasVencidasSinEntregar === 0 &&
    s.todasEntregadasEnPlazo == null;
  if (sinDatos) return "sin_datos";

  if ((s.rachaMaximaDeFallos ?? 0) > 3 || s.tareasVencidasSinEntregar >= 2) return "alto";
  if ((s.tasaAciertos ?? 100) < 60 || s.tareasVencidasSinEntregar === 1) return "observacion";
  if ((s.tasaAciertos ?? 0) >= 80 && s.todasEntregadasEnPlazo !== false) return "optimo";

  return "observacion";
}

export const ETIQUETA_RIESGO: Record<NivelDeRiesgo, string> = {
  alto: "Riesgo alto",
  observacion: "En observación",
  optimo: "Óptimo",
  sin_datos: "Sin datos",
};

/**
 * Para cada alumno, su racha de fallos SEGUIDOS más larga AHORA MISMO, en
 * cualquiera de sus temas —ver `SenalesDeRiesgo.rachaMaximaDeFallos`—.
 *
 * Pura y con los intentos ya en bruto, para que la suite de QA pueda armar
 * una secuencia de mentira y comprobar la racha sin tocar la base de datos.
 * Reordena por fecha ella misma: una racha calculada sobre intentos
 * desordenados sería un error silencioso, y reordenar unas filas sale más
 * barato que perseguir ese bug más tarde.
 */
export function rachasDeFallosPorAlumno(
  intentos: readonly { perfilId: string; tema: string; acierto: boolean; en: Date | string }[],
): Map<string, number> {
  const ordenados = [...intentos].sort(
    (a, b) => new Date(a.en).getTime() - new Date(b.en).getTime(),
  );

  // La racha ACTUAL de cada (alumno, tema) tras el último intento visto —se
  // va pisando con cada evento, en orden—.
  const rachaPorTema = new Map<string, number>();
  for (const i of ordenados) {
    const clave = `${i.perfilId}\u0000${i.tema}`;
    rachaPorTema.set(clave, i.acierto ? 0 : (rachaPorTema.get(clave) ?? 0) + 1);
  }

  // Y la PEOR racha del alumno es la mayor entre todos SUS temas —un acierto
  // en un tema no "cura" la racha que sigue abierta en otro—.
  const peorPorAlumno = new Map<string, number>();
  for (const [clave, racha] of rachaPorTema) {
    const perfilId = clave.slice(0, clave.indexOf("\u0000"));
    peorPorAlumno.set(perfilId, Math.max(peorPorAlumno.get(perfilId) ?? 0, racha));
  }
  return peorPorAlumno;
}

/** Una tarea, con quién la tiene asignada y quién ya la entregó —lo mínimo para juzgar plazos—. */
export interface TareaEnBruto {
  fechaVencimiento: Date | string;
  estudiantesMatriculados: readonly string[];
  entregas: readonly { estudianteId: string; completada: boolean; fechaEntrega: Date | string | null }[];
}

/** Lo que `riesgoAcademico` necesita del lado de las tareas, por estudiante. */
export interface RiesgoDeEntregas {
  tareasVencidasSinEntregar: number;
  todasEntregadasEnPlazo: boolean | null;
}

/**
 * Para cada estudiante matriculado en alguna de estas tareas: cuántas de las
 * vencidas se quedó sin entregar, y si las que sí entregó llegaron a tiempo.
 *
 * Pura, igual que `rachasDeFallosPorAlumno`: la ruta /docente arma
 * `TareaEnBruto[]` con una consulta de Prisma, y esto hace la cuenta sin
 * volver a tocar la base de datos.
 */
export function riesgoDeEntregas(
  tareas: readonly TareaEnBruto[],
  ahora: Date = new Date(),
): Map<string, RiesgoDeEntregas> {
  const resultado = new Map<string, RiesgoDeEntregas>();
  const asegurar = (estudianteId: string) => {
    let r = resultado.get(estudianteId);
    if (!r) {
      r = { tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: null };
      resultado.set(estudianteId, r);
    }
    return r;
  };

  for (const tarea of tareas) {
    const vencimiento = new Date(tarea.fechaVencimiento).getTime();
    const vencida = vencimiento < ahora.getTime();
    const entregaPorEstudiante = new Map(tarea.entregas.map((e) => [e.estudianteId, e]));

    for (const estudianteId of tarea.estudiantesMatriculados) {
      const entrega = entregaPorEstudiante.get(estudianteId);
      const r = asegurar(estudianteId);

      if (entrega?.completada) {
        const aTiempo = entrega.fechaEntrega != null && new Date(entrega.fechaEntrega).getTime() <= vencimiento;
        r.todasEntregadasEnPlazo = r.todasEntregadasEnPlazo === false ? false : aTiempo;
      } else if (vencida) {
        r.tareasVencidasSinEntregar++;
      }
    }
  }

  return resultado;
}

/**
 * Distribución de nivel del grupo (HITO 4, 2.B: "Promedio de notas y
 * distribución de nivel — Básico, Intermedio, Avanzado").
 *
 * `null` es "sin diagnosticar todavía", no un cuarto nivel académico: se
 * cuenta aparte porque mezclarlo con "Básico" haría parecer flojo a un grupo
 * que, en realidad, todavía no ha hecho el diagnóstico inicial.
 */
export interface DistribucionDeNivel {
  BASICO: number;
  INTERMEDIO: number;
  AVANZADO: number;
  sin_diagnosticar: number;
}

export function distribucionDeNivel(alumnos: readonly { nivel: string | null }[]): DistribucionDeNivel {
  const distribucion: DistribucionDeNivel = { BASICO: 0, INTERMEDIO: 0, AVANZADO: 0, sin_diagnosticar: 0 };
  for (const a of alumnos) {
    if (a.nivel === "BASICO" || a.nivel === "INTERMEDIO" || a.nivel === "AVANZADO") {
      distribucion[a.nivel]++;
    } else {
      distribucion.sin_diagnosticar++;
    }
  }
  return distribucion;
}
