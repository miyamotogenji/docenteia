/**
 * Sumas y restas en COLUMNA, como se enseñan en clase.
 *
 * En primaria una suma no se escribe "24 + 17": se escribe en vertical, con las
 * unidades bajo las unidades y las decenas bajo las decenas, la raya debajo y
 * la llevada encima. Escrita en horizontal, el alumno ve una expresión que
 * todavía no sabe leer y pierde justo lo que se le está enseñando: que las
 * cifras se alinean por su valor posicional.
 *
 * Aquí se compone esa disposición en LaTeX para que la pizarra la pinte con
 * KaTeX. Una columna por cifra —no el número entero en una celda—, que es lo
 * que permite poner la llevada exactamente encima de la columna que la genera.
 *
 * Vive en `lib/` y no dentro del componente para que la suite pueda comprobar
 * la disposición, y las llevadas, sin montar React.
 */

/** Una suma o resta de dos naturales, ya leída. */
export interface OperacionEnColumna {
  a: number;
  b: number;
  operador: "+" | "-";
  resultado: number;
}

/**
 * Lee "24 + 17", "19 + 45 = ?" o "52 - 27 = 25".
 *
 * Devuelve `null` en cuanto la línea no es exactamente eso. Un paso del
 * desarrollo como "unidades: 4 + 7 = 11" NO es la operación: es el relato de
 * una sola columna, y componerlo en vertical sería contar otra cosa.
 */
export function leerSumaOResta(texto: string): OperacionEnColumna | null {
  const limpio = String(texto ?? "")
    .replace(/[−–—]/g, "-") // menos unicode → guion normal
    .trim();

  const m = limpio.match(/^(\d{1,9})\s*([+-])\s*(\d{1,9})\s*(?:=\s*(\d{1,9}|\?))?$/);
  if (!m) return null;

  const a = Number(m[1]);
  const b = Number(m[3]);
  const operador = m[2] as "+" | "-";
  const resultado = operador === "+" ? a + b : a - b;

  // Una resta que da negativo no se dispone en columna: no es lo que se enseña
  // en este tema, y fingir una disposición sería enseñarla mal.
  if (resultado < 0) return null;

  // Si la línea trae el resultado, tiene que ser el correcto. Con uno que no
  // cuadra, no se compone nada: mejor la línea tal cual que una columna que
  // afirma algo falso.
  const declarado = m[4];
  if (declarado && declarado !== "?" && Number(declarado) !== resultado) return null;

  return { a, b, operador, resultado };
}

/** Las cifras de un número, alineadas a la derecha en `ancho` columnas. */
function cifras(n: number, ancho: number): string[] {
  const texto = String(n);
  return Array.from({ length: ancho }, (_, i) => {
    const desde = ancho - texto.length;
    return i < desde ? "" : texto[i - desde];
  });
}

/**
 * Las marcas que van ENCIMA de cada columna.
 *
 * En la suma son las llevadas: el 1 que pasa a la columna siguiente.
 *
 * En la resta son las cifras del minuendo ya rebajadas por el préstamo, que es
 * exactamente lo que el tutor narra al resolverla ("decenas: 4 - 2 = 2" cuando
 * el 5 de 52 se ha convertido en 4). Marca y locución cuentan lo mismo porque
 * salen del mismo cálculo.
 */
export function marcasDeColumna(op: OperacionEnColumna, ancho: number): string[] {
  const da = cifras(op.a, ancho).map((c) => (c === "" ? 0 : Number(c)));
  const db = cifras(op.b, ancho).map((c) => (c === "" ? 0 : Number(c)));
  const marcas = Array.from({ length: ancho }, () => "");

  if (op.operador === "+") {
    let llevada = 0;
    for (let i = ancho - 1; i >= 0; i--) {
      const suma = da[i] + db[i] + llevada;
      llevada = suma >= 10 ? 1 : 0;
      // La llevada se escribe sobre la columna a la que se suma, la de la izquierda.
      if (llevada && i - 1 >= 0) marcas[i - 1] = "1";
    }
    return marcas;
  }

  let prestamo = 0;
  for (let i = ancho - 1; i >= 0; i--) {
    const arriba = da[i] - prestamo;
    if (arriba < db[i]) {
      prestamo = 1;
      // La columna de la izquierda queda rebajada en uno: esa es su marca.
      if (i - 1 >= 0) marcas[i - 1] = String(da[i - 1] - 1);
    } else {
      prestamo = 0;
    }
  }
  return marcas;
}

/**
 * La operación dispuesta en columna, en LaTeX.
 *
 * Con `conResultado`, debajo de la raya va el total y encima las llevadas: es
 * la operación resuelta, la del desarrollo. Sin él queda el planteamiento —los
 * dos números, el signo y la raya— que es lo que el alumno tiene delante
 * cuando le toca resolverla.
 */
export function columnaVertical(
  op: OperacionEnColumna,
  opciones: { conResultado: boolean },
): string {
  const ancho = Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
  const celdas = (lista: string[]) => lista.join(" & ");
  const filas: string[] = [];

  if (opciones.conResultado) {
    const marcas = marcasDeColumna(op, ancho);
    if (marcas.some(Boolean)) {
      filas.push(celdas(["", ...marcas.map((m) => (m ? `\\scriptstyle ${m}` : ""))]));
    }
  }

  filas.push(celdas(["", ...cifras(op.a, ancho)]));
  filas.push(celdas([op.operador, ...cifras(op.b, ancho)]));

  // La raya de la operación. Va siempre, también en el planteamiento: es la
  // que dice al alumno dónde escribe él la respuesta.
  const cuerpo = filas.join(" \\\\ ") + " \\\\ \\hline";
  const total = opciones.conResultado
    ? " " + celdas(["", ...cifras(op.resultado, ancho)])
    : "";

  // Una columna por cifra, más la primera para el signo.
  const columnas = "r" + "c".repeat(ancho);
  return `\\begin{array}{${columnas}} ${cuerpo}${total} \\end{array}`;
}

/**
 * Cuántas columnas de cifras tiene la operación, o 0 si no es una de las que se
 * disponen así.
 *
 * El tutor narra el desarrollo columna a columna ("unidades: 4 + 7 = 11",
 * "decenas: 2 + 1 + 1 = 4"). La cuenta entera, con su total, es el resumen de
 * todas: componerla antes de que las haya contado todas adelanta el resultado.
 */
export function columnasDeOperacion(texto: string): number {
  const op = leerSumaOResta(texto);
  if (!op) return 0;
  return Math.max(String(op.a).length, String(op.b).length, String(op.resultado).length);
}

/**
 * La línea de pizarra compuesta en columna, o `null` si no es una suma ni una
 * resta de las que se disponen así.
 */
export function columnaDeLinea(
  texto: string,
  opciones: { conResultado: boolean },
): string | null {
  const op = leerSumaOResta(texto);
  return op ? columnaVertical(op, opciones) : null;
}
