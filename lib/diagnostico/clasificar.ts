import { NivelAcademico } from "@prisma/client";

/**
 * Regla de corte del diagnóstico inicial, acordada con el cliente:
 *
 *   0 – 2 aciertos → BÁSICO
 *   3 – 4 aciertos → INTERMEDIO
 *       5 aciertos → AVANZADO
 *
 * Es determinista y no interviene la IA en ningún punto: se cuenta el número de
 * respuestas correctas y se aplica el tramo. La tabla vive aquí, en un único
 * sitio, para que cambiar la regla no obligue a tocar la API ni la interfaz.
 */
export const TOTAL_PREGUNTAS = 5;

export const TRAMOS: ReadonlyArray<{
  nivel: NivelAcademico;
  min: number;
  max: number;
}> = [
  { nivel: "BASICO", min: 0, max: 2 },
  { nivel: "INTERMEDIO", min: 3, max: 4 },
  { nivel: "AVANZADO", min: 5, max: 5 },
];

/**
 * Clasifica un número de aciertos en un nivel académico.
 *
 * Lanza si el número de aciertos cae fuera de [0, total]: un diagnóstico con un
 * recuento imposible es un fallo de programación, no un caso a redondear en
 * silencio hasta el tramo más cercano.
 */
export function clasificarNivel(
  aciertos: number,
  total: number = TOTAL_PREGUNTAS,
): NivelAcademico {
  if (!Number.isInteger(aciertos)) {
    throw new Error(`El número de aciertos debe ser entero, se recibió: ${aciertos}`);
  }
  if (aciertos < 0 || aciertos > total) {
    throw new Error(
      `Aciertos fuera de rango: ${aciertos} (esperado entre 0 y ${total}).`,
    );
  }

  // Los tramos están escritos sobre un total de 5. Si algún día el banco crece,
  // se escala proporcionalmente en lugar de fallar o de tratar 6/10 como 6/5.
  const escalado =
    total === TOTAL_PREGUNTAS
      ? aciertos
      : Math.round((aciertos / total) * TOTAL_PREGUNTAS);

  const tramo = TRAMOS.find((t) => escalado >= t.min && escalado <= t.max);
  if (!tramo) {
    throw new Error(`Ningún tramo cubre ${escalado} aciertos.`);
  }
  return tramo.nivel;
}

/** Etiqueta legible del nivel, para la interfaz. */
export const ETIQUETA_NIVEL: Record<NivelAcademico, string> = {
  BASICO: "Básico",
  INTERMEDIO: "Intermedio",
  AVANZADO: "Avanzado",
};

/** Descripción de lo que significa cada nivel, para la pantalla de resultado. */
export const DESCRIPCION_NIVEL: Record<NivelAcademico, string> = {
  BASICO:
    "Empezaremos por los fundamentos, con explicaciones más detalladas y ejemplos resueltos paso a paso antes de cada práctica.",
  INTERMEDIO:
    "Tienes la base asentada. Las lecciones irán al grano y la práctica tendrá algo más de exigencia.",
  AVANZADO:
    "Dominas los cinco temas del diagnóstico. Las lecciones serán más breves y los ejercicios, más difíciles.",
};
