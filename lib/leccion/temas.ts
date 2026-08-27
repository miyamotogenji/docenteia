import type { Tema } from "@prisma/client";

/**
 * Los cinco temas garantizados por el motor determinista.
 *
 * Confirmado con el cliente: el PMV 1 se limita a estos cinco. Cualquier otro
 * asunto lo atiende la IA como mejor esfuerzo y su aritmética no está
 * garantizada, así que la lección interactiva sólo ofrece éstos.
 *
 * `consulta` es la frase exacta con la que se abre el tema. No son textos
 * decorativos: son las que el motor reconoce como lección de botón —las mismas
 * que verifica `qa/aceptacion.mjs`—, de modo que la lección sale del camino
 * determinista y no consume cuota de IA.
 */
export interface TemaLeccion {
  clave: string;
  tema: Tema;
  titulo: string;
  descripcion: string;
  consulta: string;
}

export const TEMAS_LECCION: readonly TemaLeccion[] = [
  {
    clave: "aritmetica",
    tema: "ARITMETICA",
    titulo: "Aritmética",
    descripcion: "Las cuatro operaciones y su jerarquía.",
    consulta: "Enséñame a sumar",
  },
  {
    clave: "fracciones",
    tema: "FRACCIONES",
    titulo: "Fracciones",
    descripcion: "Operar y simplificar.",
    consulta: "Enséñame las fracciones",
  },
  {
    clave: "lineales",
    tema: "ECUACIONES_LINEALES",
    titulo: "Ecuaciones lineales",
    descripcion: "Despejar la incógnita.",
    consulta: "Enséñame ecuaciones lineales",
  },
  {
    clave: "factorizacion",
    tema: "FACTORIZACION",
    titulo: "Factorización",
    descripcion: "Diferencia de cuadrados y factor común.",
    consulta: "Explícame la factorización",
  },
  {
    clave: "derivadas",
    tema: "DERIVADAS",
    titulo: "Derivadas",
    descripcion: "Regla de la potencia.",
    consulta: "Enséñame derivadas",
  },
];

/** Búsqueda por clave, para traducir lo que envía la interfaz al enum de la base. */
export const TEMA_POR_CLAVE: Record<string, Tema> = Object.fromEntries(
  TEMAS_LECCION.map((t) => [t.clave, t.tema]),
);

export function temaPorClave(clave: string): TemaLeccion | undefined {
  return TEMAS_LECCION.find((t) => t.clave === clave);
}
