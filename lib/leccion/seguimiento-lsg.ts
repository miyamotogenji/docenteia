// Con extensión explícita: este módulo lo importa también la suite de qa/, que
// se ejecuta con Node a secas y exige la extensión en los imports relativos.
import { esFaseDeConcepto, esFaseDeReglas } from "./fases.ts";

/**
 * Cómo hay que presentar la respuesta a un seguimiento.
 *
 * El servidor responde tres cosas distintas según lo que pulse el alumno, y
 * confundirlas fue lo que dejó la pizarra descuadrada:
 *
 *   ACLARACIÓN      · unas pocas directivas sueltas. Se añade a lo que hay,
 *                     sin tocar la fase: el alumno sigue con su ejercicio.
 *   EJERCICIO NUEVO · sin módulos ("más difícil"). Es otro ejercicio dentro de
 *                     la MISMA fase: hay que sustituir lo que hubiera, o el
 *                     enunciado anterior se queda arriba y el nuevo aparece
 *                     abajo, como si fueran el mismo.
 *   LECCIÓN NUEVA   · con módulos ("dame otro ejemplo"). Es una lección
 *                     completa: se reinicia la pizarra, pero empezando por el
 *                     ejemplo y no por el concepto, que el alumno ya vio.
 */
export type PresentacionSeguimiento = "anexar" | "sustituir" | "reiniciar";

export interface Modulo {
  id?: string;
  directivas?: unknown[];
}

export interface LSGConModulos {
  modulos?: Modulo[];
  directivas?: unknown[];
  [clave: string]: unknown;
}

/** Decide cómo presentar una respuesta del servidor. */
export function presentacionDe(
  lsg: LSGConModulos | null | undefined,
  opciones: { esSeguimiento: boolean; soloExplicacion?: boolean },
): PresentacionSeguimiento {
  if (!opciones.esSeguimiento) return "reiniciar";
  if (opciones.soloExplicacion) return "anexar";
  return Array.isArray(lsg?.modulos) && lsg.modulos.length > 0 ? "reiniciar" : "sustituir";
}

/**
 * Recorta una lección de seguimiento para que empiece por el ejemplo.
 *
 * Cuando el alumno pide "otro ejemplo", el motor devuelve la lección entera:
 * concepto, reglas, ejemplo y práctica, con el concepto y las reglas
 * IDÉNTICOS a los que acaba de ver. Reproducirlos otra vez lo devuelve al
 * principio y le hace oír dos veces lo mismo.
 *
 * Se quedan fuera las fases de concepto y reglas, y sólo cuando queda algo
 * después: si el recorte dejara la lección vacía, se devuelve entera, porque
 * es preferible repetir una fase que no mostrar nada.
 */
export function recortarParaSeguimiento<T extends LSGConModulos>(lsg: T): T {
  if (!Array.isArray(lsg?.modulos) || lsg.modulos.length === 0) return lsg;

  const utiles = lsg.modulos.filter((m) => {
    const id = String(m?.id ?? "");
    return !esFaseDeConcepto(id) && !esFaseDeReglas(id);
  });

  if (utiles.length === 0) return lsg;
  return { ...lsg, modulos: utiles };
}
