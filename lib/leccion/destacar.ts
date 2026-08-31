/**
 * Resaltado del coeficiente y del exponente en el ejemplo paso a paso.
 *
 * El tutor los nombra al hablar —"el coeficiente 5, la variable x, el exponente
 * 2"—, pero en la pizarra la expresión se veía plana y el alumno tenía que
 * adivinar a cuál de las tres cifras se refería. Aquí cada pieza se marca, de
 * modo que lo que oye y lo que ve señalen lo mismo.
 *
 * El marcado se hace con `\htmlClass`, no con un color escrito a mano: el color
 * vive en la hoja de estilos y así responde al tema claro y al oscuro. KaTeX
 * sólo aplica `\htmlClass` con la opción `trust`, y en la pizarra esa opción
 * está acotada EXACTAMENTE a ese comando: el contenido de la lección lo redacta
 * un modelo, y no puede colar un `\href` ni nada que salga de la fórmula.
 *
 * Vive en `lib/` para que la suite compruebe el marcado, y su composición con
 * KaTeX, sin montar React.
 */

/** Clases que la pizarra colorea. Las usa también la hoja de estilos. */
export const CLASE_COEFICIENTE = "pz-coeficiente";
export const CLASE_EXPONENTE = "pz-exponente";

const SUPERINDICES: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
  "⁻": "-", "⁺": "+", "ⁿ": "n",
};

/** Un término de un polinomio en una variable. */
interface Termino {
  signo: string;
  coeficiente: string;
  variable: string;
  exponente: string;
}

/**
 * Lee un polinomio en UNA variable: "5x²", "3x⁴ - 2x²", "10x", "x^{2}", "7".
 *
 * Devuelve `null` en cuanto aparece algo que no sea eso. Es deliberadamente
 * estricto: marcar de más deja una expresión con colores donde no tocan, y eso
 * confunde más que no marcar nada.
 */
function leerPolinomio(expresion: string): Termino[] | null {
  let s = String(expresion ?? "").replace(/[−–—]/g, "-").replace(/\s+/g, "");
  if (!s) return null;

  // Superíndices Unicode → "^n", para leerlo todo con el mismo patrón.
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻⁺ⁿ]+/g, (m) => {
    const exp = [...m].map((c) => SUPERINDICES[c] ?? "").join("");
    return exp ? `^${exp}` : "";
  });
  // Llaves del exponente ya escrito en LaTeX: "x^{2}" → "x^2".
  s = s.replace(/\^\{([^{}]*)\}/g, "^$1");

  const terminos: Termino[] = [];
  const patron = /([+-]?)(\d*)([a-zA-Z]?)(?:\^(-?\d+|n(?:-\d+)?))?/g;
  let consumido = 0;
  let m: RegExpExecArray | null;

  while ((m = patron.exec(s)) !== null) {
    if (m[0] === "") {
      patron.lastIndex++;
      continue;
    }
    if (m.index !== consumido) return null; // hay algo entre términos que no se entiende
    consumido = m.index + m[0].length;

    const [, signo, coeficiente, variable, exponente] = m;
    if (!coeficiente && !variable) return null; // un signo suelto no es un término
    if (exponente && !variable) return null; // un número no lleva exponente aquí

    terminos.push({
      signo,
      coeficiente,
      variable: variable ?? "",
      exponente: exponente ?? "",
    });
  }

  if (consumido !== s.length || terminos.length === 0) return null;
  // Una sola variable en toda la expresión: "xy" no es un polinomio de los que
  // se enseñan en esta fase.
  const variables = new Set(terminos.map((t) => t.variable).filter(Boolean));
  if (variables.size > 1) return null;
  return terminos;
}

/** Envuelve un trozo de LaTeX en una clase, para que la hoja de estilos lo pinte. */
function marcado(clase: string, contenido: string): string {
  return `\\htmlClass{${clase}}{${contenido}}`;
}

/**
 * El polinomio en LaTeX con el coeficiente y el exponente resaltados, o `null`
 * si la expresión no es un polinomio en una variable.
 *
 * El coeficiente implícito no se marca: en "x²" no hay un 1 escrito, y pintar
 * uno que no está sería enseñar algo que el alumno no ve.
 */
export function polinomioResaltado(expresion: string): string | null {
  const terminos = leerPolinomio(expresion);
  if (!terminos) return null;

  // Sin nada que resaltar no se toca la expresión: que pase por el camino de
  // siempre en lugar de reescribirla para dejarla igual.
  const hayQueResaltar = terminos.some((t) => (t.coeficiente && t.variable) || t.exponente);
  if (!hayQueResaltar) return null;

  return terminos
    .map((t, i) => {
      const signo = t.signo === "-" ? " - " : i > 0 ? " + " : "";
      const coeficiente = t.coeficiente && t.variable
        ? marcado(CLASE_COEFICIENTE, t.coeficiente)
        : t.coeficiente;
      const exponente = t.exponente
        ? `^{${marcado(CLASE_EXPONENTE, t.exponente)}}`
        : "";
      return `${signo}${coeficiente}${t.variable}${exponente}`;
    })
    .join("")
    .trim();
}

/**
 * La línea de pizarra con sus términos resaltados, o `null` si no procede.
 *
 * Acepta también una igualdad ("derivada de x² = 2x" ya reescrita como
 * "x^{2} = 2x"): se resaltan los dos lados, que es donde se ve qué le ha
 * pasado al coeficiente y al exponente al aplicar la regla.
 */
export function lineaResaltada(texto: string): string | null {
  const partes = String(texto ?? "").split("=");
  if (partes.length > 2) return null;

  const resaltadas = partes.map((p) => polinomioResaltado(p.trim()));
  // Basta con que un lado se deje resaltar; el otro se compone tal cual.
  if (!resaltadas.some(Boolean)) return null;

  const compuestas = resaltadas.map((r, i) => r ?? polinomioPlano(partes[i]));
  if (compuestas.some((c) => c == null)) return null;
  return compuestas.join(" = ");
}

/** El polinomio sin resaltar, para el lado de la igualdad que no lo necesita. */
function polinomioPlano(expresion: string): string | null {
  const terminos = leerPolinomio(expresion);
  if (!terminos) return null;
  return terminos
    .map((t, i) => {
      const signo = t.signo === "-" ? " - " : i > 0 ? " + " : "";
      const exponente = t.exponente ? `^{${t.exponente}}` : "";
      return `${signo}${t.coeficiente}${t.variable}${exponente}`;
    })
    .join("")
    .trim();
}
