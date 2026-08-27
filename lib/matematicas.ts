/**
 * Separación de prosa y fórmulas en un texto mixto.
 *
 * Vive en su propio módulo, y no dentro del componente que lo usa, para que la
 * suite de QA pueda ejercitarlo sin montar React: es la pieza que decide qué
 * parte de un enunciado se compone como matemática, y equivocarse ahí se ve
 * directamente en la pantalla del alumno.
 */

export type TipoParte = "texto" | "linea" | "bloque";

export interface Parte {
  tipo: TipoParte;
  contenido: string;
}

/**
 * Separa un texto en tramos de prosa y tramos de fórmula.
 *
 * Reconoce `$$…$$` (fórmula en bloque) y `$…$` (en línea). El bloque se busca
 * primero para que no se confunda con dos fórmulas en línea vacías.
 *
 * Un `$` suelto y sin pareja NO abre fórmula: se queda como carácter normal,
 * que es lo que espera quien escribe un precio. Y un texto sin ningún `$` se
 * devuelve entero como prosa, así que los enunciados sin matemáticas siguen
 * siendo válidos.
 */
export function separarFormulas(texto: string): Parte[] {
  const entrada = String(texto ?? "");
  const patron = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;
  const partes: Parte[] = [];
  let ultimo = 0;
  let m: RegExpExecArray | null;

  while ((m = patron.exec(entrada)) !== null) {
    if (m.index > ultimo) {
      partes.push({ tipo: "texto", contenido: entrada.slice(ultimo, m.index) });
    }
    if (m[1] !== undefined) {
      partes.push({ tipo: "bloque", contenido: m[1].trim() });
    } else {
      partes.push({ tipo: "linea", contenido: m[2].trim() });
    }
    ultimo = m.index + m[0].length;
  }

  if (ultimo < entrada.length) {
    partes.push({ tipo: "texto", contenido: entrada.slice(ultimo) });
  }

  return partes.length > 0 ? partes : [{ tipo: "texto", contenido: entrada }];
}
