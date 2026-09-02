import type { NivelAcademico } from "@prisma/client";

/**
 * DEL GRADO ESCOLAR AL NIVEL DE CONTENIDO.
 *
 * POR QUÉ EXISTE
 * Un alumno se registra diciendo en qué curso está —"3.º de secundaria"— y el
 * diagnóstico le presentaba derivadas, porque el banco de preguntas era uno
 * solo, fijo, con una pregunta por cada tema del motor. Un chico de tercero de
 * secundaria no ha visto una derivada en su vida: la prueba no medía su nivel,
 * lo desanimaba.
 *
 * Aquí se traduce el curso en el nivel de contenido con el que se le debe
 * EMPEZAR a preguntar. Es un punto de partida, no un veredicto: quien decide el
 * nivel definitivo sigue siendo el diagnóstico, contando aciertos. Un alumno de
 * 3.º que responda todo bien sube a AVANZADO; lo que no puede pasar es que la
 * primera pregunta que vea sea de un temario que le queda a tres cursos vista.
 *
 * La tabla cubre el sistema de Perú y España, que son los dos que aparecen en
 * el pliego, y tolera cómo lo escribe la gente de verdad: "3º", "3.º", "tercero
 * de secundaria", "3er grado", "3 ESO".
 */

export interface GradoEscolar {
  /** Lo que se guarda y viaja en el formulario: "secundaria-3". */
  valor: string;
  /** Ciclo tal como se guarda en el perfil. */
  ciclo: string;
  /** Grado tal como se guarda en el perfil. */
  grado: string;
  /** Cómo se le enseña al alumno en el desplegable. */
  etiqueta: string;
  nivel: NivelAcademico;
}

/**
 * El catálogo que ve el alumno al registrarse.
 *
 * Se ofrece como lista cerrada, y no como dos campos de texto libre, justamente
 * porque de este dato depende qué prueba se le presenta: "3º" escrito de seis
 * maneras distintas son seis alumnos que el sistema no sabe clasificar.
 */
export const GRADOS: readonly GradoEscolar[] = [
  ...[1, 2, 3, 4, 5, 6].map(
    (n): GradoEscolar => ({
      valor: `primaria-${n}`,
      ciclo: "Primaria",
      grado: `${n}.º`,
      etiqueta: `${n}.º de primaria`,
      nivel: "BASICO",
    }),
  ),
  ...[1, 2, 3, 4, 5].map(
    (n): GradoEscolar => ({
      valor: `secundaria-${n}`,
      ciclo: "Secundaria",
      grado: `${n}.º`,
      etiqueta: `${n}.º de secundaria`,
      // Primero y segundo siguen consolidando la aritmética y las fracciones;
      // el álgebra de despeje entra a partir de tercero.
      nivel: n <= 2 ? "BASICO" : "INTERMEDIO",
    }),
  ),
  {
    valor: "bachillerato-1",
    ciclo: "Bachillerato",
    grado: "1.º",
    etiqueta: "1.º de bachillerato",
    nivel: "AVANZADO",
  },
  {
    valor: "bachillerato-2",
    ciclo: "Bachillerato",
    grado: "2.º",
    etiqueta: "2.º de bachillerato",
    nivel: "AVANZADO",
  },
  {
    valor: "preuniversitario",
    ciclo: "Preuniversitario",
    grado: "",
    etiqueta: "Preuniversitario o superior",
    nivel: "AVANZADO",
  },
];

/** Busca un grado por el valor que envía el formulario. */
export function gradoPorValor(valor: string | null | undefined): GradoEscolar | undefined {
  return GRADOS.find((g) => g.valor === valor);
}

/** Quita tildes y baja a minúsculas, para comparar como se escribe de verdad. */
function normalizar(texto: string | null | undefined): string {
  return String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

const ORDINALES: Record<string, number> = {
  primero: 1, primer: 1, uno: 1,
  segundo: 2, dos: 2,
  tercero: 3, tercer: 3, tres: 3,
  cuarto: 4, cuatro: 4,
  quinto: 5, cinco: 5,
  sexto: 6, seis: 6,
};

/** El número de curso que aparece en el texto, en cifra o en palabra. */
function ordinalDe(texto: string): number | null {
  const cifra = texto.match(/\b([1-6])\s*(?:\.?[ºo°]|er|ro|do|to|mo|vo)?\b/);
  if (cifra) return Number(cifra[1]);
  for (const [palabra, valor] of Object.entries(ORDINALES)) {
    if (new RegExp(`\\b${palabra}\\b`).test(texto)) return valor;
  }
  return null;
}

/**
 * El nivel de contenido con el que empezar, a partir del ciclo y el grado.
 *
 * Devuelve `null` cuando el texto no dice nada reconocible. Ese null es
 * información: quien llama decide el valor por defecto, y así no se confunde
 * "no lo sé" con "es básico".
 */
export function nivelPorGrado(
  ciclo: string | null | undefined,
  grado: string | null | undefined,
): NivelAcademico | null {
  const texto = `${normalizar(ciclo)} ${normalizar(grado)}`.trim();
  if (!texto) return null;

  // El valor del catálogo se reconoce tal cual: es el camino normal desde el
  // formulario de registro.
  const delCatalogo = GRADOS.find((g) => texto.includes(g.valor));
  if (delCatalogo) return delCatalogo.nivel;

  const esPrimaria = /\bprimaria\b|\bprimario\b/.test(texto);
  const esSecundaria = /\bsecundaria\b|\bsecundario\b|\beso\b/.test(texto);
  const esSuperior = /bachiller|prepa|preuniv|pre-univ|universi|superior|ciclo\s*iv/.test(texto);

  if (esSuperior) return "AVANZADO";

  const curso = ordinalDe(texto);

  if (esPrimaria) return "BASICO";
  if (esSecundaria) {
    if (curso === null) return "INTERMEDIO";
    return curso <= 2 ? "BASICO" : "INTERMEDIO";
  }

  // Sin ciclo reconocible no se adivina: un "3.º" suelto puede ser de primaria
  // o de secundaria, y elegir por él sería inventarse el dato del alumno.
  return null;
}

/**
 * El nivel con el que se le van a plantear las preguntas.
 *
 * Manda el nivel YA DIAGNOSTICADO si lo hay —es un dato medido, no estimado— y
 * sólo cuando falta se recurre al curso declarado. Si tampoco hay curso, se
 * empieza por lo básico: preguntar de menos y subir es recuperable; preguntar
 * de más y que el alumno abandone, no.
 */
export function nivelDePartida(perfil: {
  nivelActual?: NivelAcademico | null;
  ciclo?: string | null;
  grado?: string | null;
}): NivelAcademico {
  return perfil.nivelActual ?? nivelPorGrado(perfil.ciclo, perfil.grado) ?? "BASICO";
}
