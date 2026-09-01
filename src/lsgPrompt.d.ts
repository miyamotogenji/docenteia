/**
 * Tipos del generador de lecciones heredado.
 *
 * El módulo es JavaScript a propósito —es la pedagogía validada del prototipo,
 * y reescribirla en TypeScript sería reescribirla— así que sus tipos se
 * declaran aquí. Sólo lo que consume la aplicación Next: el resto de su
 * superficie sigue siendo interna al motor.
 */

/** Un ejercicio del banco determinista. */
export interface EjercicioDelBanco {
  /** Tema, con la clave del enum de Prisma: ARITMETICA, DERIVADAS… */
  tema: string;
  /** Nivel académico: BASICO, INTERMEDIO o AVANZADO. */
  nivel: string;
  /** Escalón interno del motor: facil, normal, dificil, experto… */
  nivelMotor: string;
  enunciado: string;
}

/**
 * El banco de ejercicios deterministas, tal como lo usa la lección.
 *
 * No es una copia: sale de las mismas listas que el motor consulta al generar,
 * de modo que la base sembrada y las lecciones no pueden desincronizarse.
 */
export function bancoDeEjercicios(): EjercicioDelBanco[];

export function leccionBotonLSG(opciones?: {
  query?: string;
  seguimiento?: string;
  contexto?: string;
  currentTopic?: string;
  previo?: string;
  historial?: string[];
  cursores?: Record<string, number> | null;
  /** Escalón de partida que corresponde al nivel diagnosticado del alumno. */
  nivelDePartida?: string;
}): unknown;

export function mockLSG(query: string, intent: string, opciones?: unknown): unknown;
