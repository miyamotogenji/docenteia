/**
 * Carga y adaptación del banco oficial de preguntas del diagnóstico.
 *
 * El fichero `prisma/seed-data/preguntas-diagnostico.json` se conserva con el
 * formato ORIGINAL en que lo entrega el cliente, sin reescribirlo, para que
 * sustituirlo por una versión nueva sea copiar y pegar. Toda la adaptación al
 * esquema de la base de datos ocurre aquí.
 *
 * Este módulo lo usan tanto la semilla (prisma/seed.ts) como la batería de
 * validación (qa/diagnostico.mjs). Que sea el mismo código en ambos sitios es
 * deliberado: si la comprobación validara una copia de la transformación en
 * lugar de la transformación real, podría dar por bueno un banco que la semilla
 * carga de otra manera.
 */

export type TemaEnum =
  | "ECUACIONES_LINEALES"
  | "DERIVADAS"
  | "FACTORIZACION"
  | "FRACCIONES"
  | "ARITMETICA";

export const TEMAS: readonly TemaEnum[] = [
  "ECUACIONES_LINEALES",
  "DERIVADAS",
  "FACTORIZACION",
  "FRACCIONES",
  "ARITMETICA",
];

/** Estructura de cada pregunta tal como llega en el JSON oficial. */
export interface PreguntaOficial {
  id: string;
  tema: string;
  pregunta: string;
  opciones: string[];
  respuesta_correcta: string;
  tipo?: string;
}

/** Pregunta ya adaptada al esquema de `preguntas_diagnostico`. */
export interface PreguntaAdaptada {
  clave: string;
  orden: number;
  tema: TemaEnum;
  enunciado: string;
  opciones: Array<{ id: string; texto: string }>;
  /** Identificador de la opción correcta, no su texto. */
  respuestaCorrecta: string;
}

/**
 * Convierte una expresión escrita en LaTeX a la notación plana que entiende el
 * motor determinista (`src/preLight.js`).
 *
 * Por qué hace falta: el banco muestra la matemática con KaTeX —de otro modo
 * "2/3 + 5/6" se leería como texto corrido en lugar de como fracciones—, pero
 * el motor que verifica esas respuestas espera notación plana. En vez de
 * guardar el enunciado dos veces (una para mostrar y otra para validar, con el
 * riesgo de que se desincronicen), se guarda sólo la versión LaTeX y aquí se
 * traduce cuando hay que calcular.
 */
export function latexAPlano(texto: string): string {
  return String(texto ?? "")
    // Delimitadores de fórmula.
    .replace(/\$\$?/g, " ")
    // Fracciones: \frac{2}{3} → (2)/(3). Los paréntesis evitan que
    // "\frac{a+b}{c}" se convierta en "a+b/c", que significa otra cosa.
    .replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)")
    // Operadores.
    .replace(/\\times|\\cdot/g, "*")
    .replace(/\\div/g, "/")
    // Paréntesis escalables.
    .replace(/\\left\s*|\\right\s*/g, "")
    // Exponentes: x^{2} → x^2.
    .replace(/\^\s*\{\s*([^{}]*)\s*\}/g, "^$1")
    // Espaciado tipográfico de LaTeX.
    .replace(/\\[,;!:> ]/g, " ")
    // Un paréntesis que sólo envuelve un número no aporta nada y estorba a los
    // analizadores del motor: "(2)/(3)" → "2/3".
    .replace(/\((\s*-?\d+(?:\.\d+)?\s*)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** "ecuaciones_lineales" → "ECUACIONES_LINEALES", validando contra el enum. */
export function temaAEnum(tema: string): TemaEnum {
  const valor = String(tema).trim().toUpperCase();
  if (!(TEMAS as readonly string[]).includes(valor)) {
    throw new Error(
      `Tema desconocido en el banco de preguntas: "${tema}". Los válidos son: ${TEMAS.join(", ")}`,
    );
  }
  return valor as TemaEnum;
}

export const IDS_OPCION = ["a", "b", "c", "d", "e", "f"];

/**
 * Convierte una pregunta del formato oficial al del esquema.
 *
 * Las opciones pasan de ser una lista de textos a pares { id, texto }, y la
 * respuesta correcta pasa de ser el TEXTO a ser el ID de esa opción. Así, lo
 * que el navegador envía al corregir es un identificador opaco y no la propia
 * respuesta: la comparación deja de depender de espacios, de mayúsculas o de
 * cómo esté escrita la fórmula.
 */
export function adaptar(p: PreguntaOficial, indice: number): PreguntaAdaptada {
  if (!p || typeof p.id !== "string" || !p.id.trim()) {
    throw new Error(`La pregunta en la posición ${indice} no tiene identificador.`);
  }
  if (typeof p.pregunta !== "string" || !p.pregunta.trim()) {
    throw new Error(`La pregunta "${p.id}" no tiene enunciado.`);
  }
  if (!Array.isArray(p.opciones) || p.opciones.length < 2) {
    throw new Error(`La pregunta "${p.id}" no tiene al menos dos opciones.`);
  }
  if (p.opciones.length > IDS_OPCION.length) {
    throw new Error(
      `La pregunta "${p.id}" tiene ${p.opciones.length} opciones; el máximo contemplado es ${IDS_OPCION.length}.`,
    );
  }
  if (new Set(p.opciones).size !== p.opciones.length) {
    throw new Error(`La pregunta "${p.id}" tiene opciones repetidas.`);
  }

  const opciones = p.opciones.map((texto, i) => ({ id: IDS_OPCION[i], texto }));
  const correcta = opciones.find((o) => o.texto === p.respuesta_correcta);

  // Un banco cuya respuesta correcta no figura entre las opciones clasificaría
  // mal a TODOS los alumnos y no daría ningún síntoma visible. Se para aquí.
  if (!correcta) {
    throw new Error(
      `La respuesta correcta de "${p.id}" ("${p.respuesta_correcta}") no coincide con ninguna de sus opciones: ${p.opciones.join(" | ")}`,
    );
  }

  return {
    clave: p.id,
    orden: indice + 1,
    tema: temaAEnum(p.tema),
    enunciado: p.pregunta,
    opciones,
    respuestaCorrecta: correcta.id,
  };
}

/**
 * Adapta el banco completo, comprobando además lo que sólo se puede ver mirando
 * el conjunto: que no haya identificadores repetidos ni dos preguntas activas
 * para el mismo tema.
 */
export function adaptarBanco(oficial: PreguntaOficial[]): PreguntaAdaptada[] {
  if (!Array.isArray(oficial) || oficial.length === 0) {
    throw new Error("El banco de preguntas está vacío o no es una lista.");
  }

  const preguntas = oficial.map(adaptar);

  const claves = preguntas.map((p) => p.clave);
  if (new Set(claves).size !== claves.length) {
    throw new Error("Hay identificadores de pregunta repetidos en el banco.");
  }

  const temas = preguntas.map((p) => p.tema);
  if (new Set(temas).size !== temas.length) {
    throw new Error(
      "Hay más de una pregunta para el mismo tema. El diagnóstico asigna el nivel contando aciertos por tema, así que duplicar un tema desequilibraría la clasificación.",
    );
  }

  return preguntas;
}
