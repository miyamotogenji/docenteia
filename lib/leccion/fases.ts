/**
 * Las cuatro fases pedagógicas obligatorias de una lección.
 *
 * El motor nombra sus módulos con claves propias (`ejemplo_guiado`,
 * `practica`…). Aquí se traducen al rótulo que ve el alumno, y cada una se
 * presenta como una ESCENA distinta de la pizarra en lugar de apilarse.
 *
 * Vive en `lib/` y no dentro del componente para que la suite pueda comprobar,
 * sin montar React, que los módulos que produce el motor caen todos en una fase
 * conocida: un módulo sin traducir se mostraría al alumno con su clave interna.
 */
export interface Fase {
  patron: RegExp;
  titulo: string;
}

export const FASES: readonly Fase[] = [
  { patron: /concepto/i, titulo: "Concepto" },
  { patron: /regla|propiedad/i, titulo: "Reglas y propiedades" },
  { patron: /ejemplo/i, titulo: "Ejemplo paso a paso" },
  { patron: /practica|práctica/i, titulo: "Práctica" },
];

/** Rótulo de una fase. Devuelve la clave tal cual si no la reconoce. */
export function tituloDeFase(id: string): string {
  const clave = String(id ?? "");
  return FASES.find((f) => f.patron.test(clave))?.titulo ?? clave;
}

/** ¿Esta clave de módulo corresponde a una de las cuatro fases conocidas? */
export function esFaseConocida(id: string): boolean {
  return FASES.some((f) => f.patron.test(String(id ?? "")));
}
