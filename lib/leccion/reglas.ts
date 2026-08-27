import { TEMAS, temaAEnum, type TemaEnum } from "../diagnostico/banco.ts";

/**
 * Catálogo formal de reglas y propiedades.
 *
 * POR QUÉ VIVE EN LA BASE DE DATOS
 * El motor pedagógico decide CÓMO se enseña un tema; QUÉ reglas lo componen es
 * currículo, y el currículo crece. Teniéndolo como dato, ampliar el temario es
 * cargar contenido —o editarlo desde el panel de administración más adelante—
 * en lugar de tocar la aplicación.
 *
 * El fichero `prisma/seed-data/reglas-matematicas.json` es la fuente; este
 * módulo lo valida y lo adapta al esquema. Lo usan a la vez la semilla y la
 * batería de QA, de modo que lo que se comprueba es la conversión real.
 */

export type NivelRegla = "BASICO" | "INTERMEDIO" | "AVANZADO";

/** Una regla tal como llega en el JSON. */
export interface ReglaOficial {
  clave: string;
  tema: string;
  orden: number;
  nombre: string;
  /** Enunciado formal en LaTeX. */
  enunciado: string;
  descripcion: string;
  ejemplo?: string;
  nivel?: string;
  practicable?: boolean;
}

/** Una regla ya adaptada al esquema de `reglas_matematicas`. */
export interface ReglaAdaptada {
  clave: string;
  tema: TemaEnum;
  orden: number;
  nombre: string;
  enunciado: string;
  descripcion: string;
  ejemplo: string | null;
  nivel: NivelRegla | null;
  practicable: boolean;
}

const NIVELES: readonly NivelRegla[] = ["BASICO", "INTERMEDIO", "AVANZADO"];

export function adaptarRegla(r: ReglaOficial, indice: number): ReglaAdaptada {
  if (!r || typeof r.clave !== "string" || !r.clave.trim()) {
    throw new Error(`La regla en la posición ${indice} no tiene clave.`);
  }
  for (const campo of ["nombre", "enunciado", "descripcion"] as const) {
    if (typeof r[campo] !== "string" || !r[campo].trim()) {
      throw new Error(`La regla "${r.clave}" no tiene ${campo}.`);
    }
  }
  if (!Number.isInteger(r.orden)) {
    throw new Error(`La regla "${r.clave}" no tiene un orden entero.`);
  }

  const nivel = r.nivel ? String(r.nivel).toUpperCase() : null;
  if (nivel && !(NIVELES as readonly string[]).includes(nivel)) {
    throw new Error(`Nivel desconocido en la regla "${r.clave}": ${r.nivel}`);
  }

  return {
    clave: r.clave,
    tema: temaAEnum(r.tema),
    orden: r.orden,
    nombre: r.nombre,
    enunciado: r.enunciado,
    descripcion: r.descripcion,
    ejemplo: r.ejemplo?.trim() ? r.ejemplo : null,
    nivel: (nivel as NivelRegla | null) ?? null,
    practicable: r.practicable === true,
  };
}

/**
 * Adapta el catálogo completo y comprueba lo que sólo se ve en conjunto: claves
 * repetidas, órdenes duplicados dentro de un tema y temas sin ninguna regla.
 *
 * Lo último importa más de lo que parece: un tema sin reglas dejaría la fase
 * "Reglas y propiedades" vacía en pantalla, que es exactamente el defecto que
 * este catálogo viene a corregir.
 */
/** Quita tildes y baja a minúsculas, para comparar textos sin depender del acento. */
function normalizar(s: string): string {
  return String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Identifica qué regla del catálogo está aplicando un paso del ejemplo.
 *
 * El motor nombra la regla dentro de su explicación ("Regla de la potencia:
 * multiplicamos el coeficiente…"), así que basta con buscar el nombre. Se
 * prefiere la coincidencia MÁS LARGA: "regla de la suma y la resta" contiene
 * "regla de la suma", y quedarse con la primera etiquetaría mal el paso.
 *
 * Devuelve null cuando el paso no menciona ninguna regla, que es lo correcto:
 * poner una etiqueta a ojo sería atribuirle al alumno un razonamiento que el
 * tutor no ha hecho.
 */
export function identificarRegla<T extends { nombre: string }>(
  texto: string,
  reglas: readonly T[],
): T | null {
  const t = normalizar(texto);
  if (!t) return null;

  let mejor: T | null = null;
  for (const regla of reglas) {
    const nombre = normalizar(regla.nombre);
    if (!nombre || !t.includes(nombre)) continue;
    if (!mejor || nombre.length > normalizar(mejor.nombre).length) mejor = regla;
  }
  return mejor;
}

export function adaptarCatalogo(oficial: ReglaOficial[]): ReglaAdaptada[] {
  if (!Array.isArray(oficial) || oficial.length === 0) {
    throw new Error("El catálogo de reglas está vacío o no es una lista.");
  }

  const reglas = oficial.map(adaptarRegla);

  const claves = reglas.map((r) => r.clave);
  if (new Set(claves).size !== claves.length) {
    throw new Error("Hay claves de regla repetidas en el catálogo.");
  }

  for (const tema of TEMAS) {
    const delTema = reglas.filter((r) => r.tema === tema);
    if (delTema.length === 0) {
      throw new Error(
        `El tema ${tema} no tiene ninguna regla: su fase "Reglas y propiedades" se vería vacía.`,
      );
    }
    const ordenes = delTema.map((r) => r.orden);
    if (new Set(ordenes).size !== ordenes.length) {
      throw new Error(`Hay órdenes repetidos en las reglas de ${tema}.`);
    }
  }

  return reglas;
}
