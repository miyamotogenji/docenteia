/**
 * Los metadatos académicos del alumno, listos para el motor de consultas.
 *
 * El perfil guarda el ciclo, el nivel que le asignó el diagnóstico y el
 * historial de debilidades, pero nada de eso llegaba al motor: la lección se
 * generaba igual para un alumno de Básico recién diagnosticado que para uno
 * Avanzado con veinte fallos de factorización a la espalda.
 *
 * Aquí se traduce el perfil a lo que el motor entiende. Es una función pura:
 * la suite la comprueba sin base de datos y sin montar la aplicación.
 */

/** Nivel académico tal como lo guarda el diagnóstico. */
export type NivelAcademico = "BASICO" | "INTERMEDIO" | "AVANZADO";

/** Una debilidad observada: en qué tema, de qué tipo y cuántas veces. */
export interface Debilidad {
  tema: string;
  tipoError: string;
  ocurrencias: number;
}

/** El perfil, tal como sale de la base. */
export interface PerfilAcademico {
  ciclo?: string | null;
  grado?: string | null;
  nivelActual?: NivelAcademico | null;
  nivelAsignadoEn?: Date | string | null;
}

/** Lo que viaja al motor con cada consulta. */
export interface ContextoAlumno {
  ciclo: string | null;
  grado: string | null;
  nivel: NivelAcademico | null;
  /** Escalón de dificultad del motor, deducido del nivel académico. */
  nivelMotor: string | null;
  /** Debilidades, de la más repetida a la menos. */
  debilidades: Debilidad[];
}

/**
 * El escalón de dificultad que corresponde a un nivel académico.
 *
 * El motor trabaja con `facil` / `normal` / `dificil`; el diagnóstico asigna
 * BÁSICO / INTERMEDIO / AVANZADO. Sin esta traducción, un alumno diagnosticado
 * Avanzado empezaba igual que uno de Básico, y el diagnóstico no servía para
 * nada más que para mostrar una etiqueta.
 */
export function nivelDelMotor(nivel: NivelAcademico | null | undefined): string | null {
  switch (nivel) {
    case "BASICO":
      return "facil";
    case "INTERMEDIO":
      return "normal";
    case "AVANZADO":
      return "dificil";
    default:
      return null;
  }
}

/** Cuántas debilidades se le pasan al motor. Las más repetidas primero. */
export const MAX_DEBILIDADES = 5;

/**
 * Construye el contexto del alumno a partir de su perfil y sus errores.
 *
 * Devuelve `null` cuando no hay perfil: una consulta sin sesión —la de la
 * suite, o la de alguien que aún no ha entrado— sigue comportándose
 * exactamente igual que antes. Eso es deliberado: la lección determinista no
 * puede depender de quién la pida, o dejaría de ser reproducible.
 */
export function contextoDeAlumno(
  perfil: PerfilAcademico | null | undefined,
  errores: readonly Debilidad[] = [],
): ContextoAlumno | null {
  if (!perfil) return null;

  const debilidades = [...errores]
    .filter((e) => e && e.tema && e.tipoError)
    .sort((a, b) => (b.ocurrencias ?? 0) - (a.ocurrencias ?? 0))
    .slice(0, MAX_DEBILIDADES)
    .map((e) => ({
      tema: String(e.tema),
      tipoError: String(e.tipoError),
      ocurrencias: Number(e.ocurrencias) || 0,
    }));

  return {
    ciclo: perfil.ciclo ?? null,
    grado: perfil.grado ?? null,
    nivel: perfil.nivelActual ?? null,
    nivelMotor: nivelDelMotor(perfil.nivelActual),
    debilidades,
  };
}

/**
 * El contexto en una línea, para inyectarlo en el aviso del modelo.
 *
 * Vacío si no hay nada que decir: una frase con huecos —"Alumno de ciclo null"—
 * es peor que ninguna frase, porque el modelo la toma al pie de la letra.
 */
export function contextoParaElModelo(contexto: ContextoAlumno | null): string {
  if (!contexto) return "";

  const partes: string[] = [];
  if (contexto.ciclo) partes.push(`ciclo ${contexto.ciclo}`);
  if (contexto.grado) partes.push(`grado ${contexto.grado}`);
  if (contexto.nivel) partes.push(`nivel diagnosticado ${contexto.nivel.toLowerCase()}`);
  if (contexto.debilidades.length > 0) {
    const lista = contexto.debilidades
      .map((d) => `${d.tema.toLowerCase()} (${d.ocurrencias})`)
      .join(", ");
    partes.push(`suele fallar en: ${lista}`);
  }

  return partes.length > 0 ? `Alumno: ${partes.join("; ")}.` : "";
}
