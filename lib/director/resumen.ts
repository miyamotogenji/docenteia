import type { DificultadRecurrente } from "../docente/metricas.ts";

/**
 * El resumen institucional del director (HITO 3; sección 2.C del HITO 4 añade
 * el rendimiento por aula y el catálogo de errores del colegio).
 *
 * Misma frontera que `lib/docente/metricas.ts`: el cálculo vive separado de la
 * consulta, para poder comprobarlo con datos de mentira y sin base de datos.
 * `GET /api/director/resumen` sólo trae las filas en bruto y llama a
 * `calcularResumen`.
 */

/** Un aula del colegio, con lo que hace falta para su fila de la tabla. */
export interface AulaEnBruto {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
  docenteNombre: string;
  /** Alumnos matriculados en ella. */
  matriculas: number;
  /** Tareas que su docente ha programado. */
  tareasCreadas: number;
  /** Cuántas de las entregas esperadas (matrículas × tareas) ya están completas. */
  entregasCompletadas: number;
  /** Prácticas calificadas de sus alumnos matriculados, y cuántas acertaron. */
  intentosRegistrados?: number;
  aciertosRegistrados?: number;
}

/** Una fila de la tabla del panel: el aula más su tasa de entrega. */
export interface FilaAula extends AulaEnBruto {
  /**
   * Porcentaje de entregas completas sobre las esperadas, o `null` si el aula
   * no tiene ni alumnos ni tareas —dividir 0 entre 0 no es "0 % de entrega",
   * es "todavía no hay nada que entregar", y confundir las dos cosas pondría
   * en rojo un aula que simplemente acaba de crearse.
   */
  tasaEntrega: number | null;
  /** Porcentaje de aciertos de sus alumnos, o `null` si aún no han practicado nada. */
  tasaAciertos: number | null;
}

/** Las cifras macro de cabecera. */
export interface ResumenInstitucional {
  totalDocentes: number;
  totalAulas: number;
  totalAlumnos: number;
  /** Alumnos SIN repetir: uno matriculado en tres aulas cuenta una vez. */
  aulas: FilaAula[];
  /**
   * Catálogo de errores de TODO el colegio (HITO 4, 2.C: "identificación de
   * temas con mayor tasa de error"), no de un aula —el director compara
   * entre grados y secciones, así que necesita la vista completa—.
   */
  temasConMasErrores: DificultadRecurrente[];
}

/**
 * Calcula la tasa de entrega de un aula.
 *
 * El "esperado" es matrículas × tareas: cada alumno matriculado debe una
 * entrega por cada tarea de su aula. Sin matrículas o sin tareas no hay
 * esperado, y por tanto no hay tasa —ver el comentario de `tasaEntrega`—.
 */
export function tasaDeEntrega(aula: AulaEnBruto): number | null {
  const esperadas = aula.matriculas * aula.tareasCreadas;
  if (esperadas === 0) return null;
  return Math.round((aula.entregasCompletadas / esperadas) * 1000) / 10;
}

/**
 * Calcula la tasa de aciertos de un aula: de las prácticas calificadas de
 * sus alumnos matriculados, cuántas acertaron. Sin intentos registrados no
 * hay tasa —un aula recién creada no "va mal", todavía no ha practicado—.
 */
export function tasaDeAciertos(aula: AulaEnBruto): number | null {
  const intentos = aula.intentosRegistrados ?? 0;
  if (intentos === 0) return null;
  return Math.round(((aula.aciertosRegistrados ?? 0) / intentos) * 1000) / 10;
}

/**
 * Arma el resumen completo a partir de las aulas del colegio y de cuántos
 * alumnos distintos hay en total (que no es la suma de matrículas por aula: un
 * mismo alumno puede estar en más de una).
 *
 * `temasConMasErrores` llega ya calculado —`dificultadesRecurrentes`, de
 * `lib/docente/metricas.ts`, es la misma lógica que usa el panel docente,
 * sólo que aquí se le pasa el catálogo de errores de todo el colegio en vez
 * del de un grupo— y se acepta como parámetro en vez de recalcularse aquí
 * para no mezclar dos fuentes de errores (aula vs. colegio) en esta función.
 */
export function calcularResumen(
  aulas: readonly AulaEnBruto[],
  totalDocentes: number,
  totalAlumnosDistintos: number,
  temasConMasErrores: DificultadRecurrente[] = [],
): ResumenInstitucional {
  return {
    totalDocentes,
    totalAulas: aulas.length,
    totalAlumnos: totalAlumnosDistintos,
    aulas: aulas.map((a) => ({ ...a, tasaEntrega: tasaDeEntrega(a), tasaAciertos: tasaDeAciertos(a) })),
    temasConMasErrores,
  };
}
