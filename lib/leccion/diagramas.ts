/**
 * Temas que tienen diagrama en la fase de Concepto.
 *
 * Vive en `lib/` y no dentro del componente para que la suite pueda consultarlo
 * sin montar React: la comprobación de que ninguna fase queda en blanco cuenta
 * con el diagrama, y si la lista estuviera duplicada podrían desincronizarse y
 * la prueba daría por bueno un concepto vacío.
 */
export const TEMAS_CON_DIAGRAMA = [
  "DERIVADAS",
  "FRACCIONES",
  "ECUACIONES_LINEALES",
] as const;

export function tieneDiagrama(tema: string): boolean {
  return (TEMAS_CON_DIAGRAMA as readonly string[]).includes(tema);
}
