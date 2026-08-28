// Validación del PASO 2 — lección interactiva multimodal.
//
// Cubre lo que se entrega en este paso y que no verificaba ninguna batería:
//
//   Módulo 4 — la lección llega estructurada en las 4 fases pedagógicas
//              obligatorias (concepto → reglas → ejemplos → práctica).
//   Módulo 5 — la lección de los cinco temas sale del motor determinista, no
//              de la IA, y su aritmética es correcta.
//   Módulo 7 — todo lo que se escribe en la pizarra se puede componer con
//              KaTeX sin errores.
//   Módulo 8 — los botones de apoyo mantienen el tema en lugar de cambiarlo.
//   Módulo 9 — la corrección determinista acierta y, sobre todo, se niega a
//              calificar lo que no ha podido calcular.
//
// Necesita la aplicación levantada:  npm run dev  (en otra terminal)

import { readFileSync } from "node:fs";

import katex from "katex";

import { computeAnswer } from "../src/preLight.js";
import { checkAnswer, flattenLSG } from "../public/pseLight.js";
// Se prueba el MISMO resolutor que usa la ruta de corrección, no una copia.
import { resolverEjercicio } from "../lib/leccion/correccion.ts";
import {
  esIdeaFuerza,
  notacionFormal,
  pareceMatematica,
  planoALatex,
  separarProsaYMatematicas,
} from "../lib/matematicas.ts";
import {
  esFaseConocida,
  esFaseDeConcepto,
  esFaseDeReglas,
  tituloDeFase,
} from "../lib/leccion/fases.ts";
// La lista real que consulta el componente, no una copia: si se duplicara,
// podrían desincronizarse y la prueba daría por bueno un concepto vacío.
import { tieneDiagrama } from "../lib/leccion/diagramas.ts";
import { pasoIntermedioDerivada } from "../lib/leccion/desarrollo.ts";
import { presentacionDe, recortarParaSeguimiento } from "../lib/leccion/seguimiento-lsg.ts";
import { adaptarCatalogo, identificarRegla, reglaActiva } from "../lib/leccion/reglas.ts";
import { construirPeticion, estadoInicial } from "../lib/leccion/seguimiento.ts";
import { TEMAS_LECCION } from "../lib/leccion/temas.ts";
import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";

let ok = 0;
const fallos = [];

function check(nombre, cond, detalle = "") {
  if (cond) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

async function consultar(cuerpo) {
  const r = await fetch(`${BASE}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(cuerpo),
  });
  return r.json();
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" PASO 2 — lección interactiva multimodal");
console.log("═══════════════════════════════════════════════════════════\n");

await exigirServidor();

// ── Módulo 7 · notación plana → LaTeX ────────────────────────────────────────
console.log(" · Traducción a LaTeX para la pizarra (Módulo 7)");

const casosLatex = [
  { entrada: "12x³ - 4x", esperado: "12x^{3} - 4x" },
  { entrada: "x² - 9", esperado: "x^{2} - 9" },
  { entrada: "1/2 + 1/4", esperado: "\\frac{1}{2} + \\frac{1}{4}" },
  { entrada: "3 · 4", esperado: "3 \\cdot 4" },
  { entrada: "12 ÷ 6", esperado: "12 \\div 6" },
  { entrada: "2x + 5 = 15", esperado: "2x + 5 = 15" },
  { entrada: "xⁿ⁻¹", esperado: "x^{n-1}" },
];
for (const c of casosLatex) {
  const obtenido = planoALatex(c.entrada);
  check(`«${c.entrada}» → «${c.esperado}»`, obtenido === c.esperado, `obtenido: «${obtenido}»`);
}

// "d/dx" es notación de derivada, no una fracción: convertirla la rompería.
check(
  "d/dx no se convierte en fracción",
  !planoALatex("d/dx[x³]").includes("\\frac"),
  planoALatex("d/dx[x³]"),
);

console.log("\n · Distinción entre fórmula y prosa");
const casosProsa = [
  { entrada: "2x + 5 = 15", math: true },
  { entrada: "x² - 9", math: true },
  { entrada: "d/dx[xⁿ] = n·xⁿ⁻¹", math: true },
  { entrada: "Escribe tu ejercicio y lo resuelvo paso a paso", math: false },
  { entrada: "Regla de la potencia", math: false },
];
for (const c of casosProsa) {
  check(
    `«${c.entrada}» ${c.math ? "es fórmula" : "es prosa"}`,
    pareceMatematica(c.entrada) === c.math,
  );
}

// ── Notación formal y letras pegadas ─────────────────────────────────────────
// El motor rotula algunas fórmulas en castellano ("derivada de x² = 2x"). Si esa
// línea se compone entera con KaTeX, cada letra se tipografía como una variable
// y en pantalla se lee "derivadadex2=2x": las letras aparecen pegadas y en
// cursiva. Aquí se comprueba que eso no ocurra y que la notación sea la formal.
console.log("\n · Notación formal en la pizarra");

const casosFormales = [
  {
    entrada: "derivada de x² = 2x",
    latex: "\\frac{d}{dx}\\left(x^{2}\\right) = 2x",
  },
  {
    entrada: "derivada de 3x⁴ - 2x² = 12x³ - 4x",
    latex: "\\frac{d}{dx}\\left(3x^{4} - 2x^{2}\\right) = 12x^{3} - 4x",
  },
  { entrada: "unidades: 4 + 7 = 11", latex: "\\text{unidades:}\\;\\; 4 + 7 = 11" },
  { entrada: "decenas: 2 + 1 + 1 = 4", latex: "\\text{decenas:}\\;\\; 2 + 1 + 1 = 4" },
];

for (const caso of casosFormales) {
  const obtenido = notacionFormal(caso.entrada);
  check(
    `«${caso.entrada}» se reescribe en notación formal`,
    obtenido === caso.latex,
    `obtenido: ${obtenido}`,
  );
  if (!obtenido) continue;
  let err = null;
  try {
    katex.renderToString(obtenido, { throwOnError: true, strict: false });
  } catch (e) {
    err = e.message;
  }
  check(`«${caso.entrada}» compila en KaTeX`, err === null, err ?? "");
}

// Una fórmula pura no debe tocarse: no hay nada que formalizar.
for (const pura of ["x²", "2x + 5 = 15", "5x²"]) {
  check(`«${pura}» no necesita reescritura`, notacionFormal(pura) === null);
}

// Y una línea con palabras NUNCA debe considerarse fórmula pura.
for (const mixta of ["derivada de x² = 2x", "unidades: 4 + 7 = 11"]) {
  check(`«${mixta}» no se compone como fórmula pura`, pareceMatematica(mixta) === false);
}

// ── Separación entre la voz y la pizarra ─────────────────────────────────────
// La pizarra es un lienzo de IDEAS FUERZA —título de la regla, fórmulas y el
// ejercicio— y la explicación hablada vive en el subtítulo. El reparto se
// comprueba, no se da por supuesto: desde que las aclaraciones las redacta el
// modelo en vivo, a la pizarra puede llegar un párrafo entero.
console.log("\n · Separación entre la voz y la pizarra");

const casosIdeaFuerza = [
  // Lo que SÍ es pizarra: fórmulas y definiciones de una línea.
  { texto: "2x + 5 = 15", pizarra: true },
  { texto: "12x³ - 4x", pizarra: true },
  { texto: "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹", pizarra: true },
  { texto: "Derivada: razón de cambio (la pendiente) de una función", pizarra: true },
  { texto: "Suma: juntar cantidades → total", pizarra: true },
  { texto: "Factorizar: escribir una expresión como un producto de factores", pizarra: true },
  // Lo que NO: un párrafo explicativo, que es cosa del subtítulo.
  {
    texto:
      "Una derivada mide la RAPIDEZ con la que cambia una función: en cada punto indica cuánto crece o decrece, es decir, la pendiente de su gráfica.",
    pizarra: false,
  },
  {
    texto:
      "Para derivar una potencia usamos la regla de la potencia: se baja el exponente multiplicando delante y se le resta 1, y así obtenemos el resultado.",
    pizarra: false,
  },
];

for (const caso of casosIdeaFuerza) {
  check(
    `${caso.pizarra ? "va a la pizarra" : "va al subtítulo"}: «${caso.texto.slice(0, 40)}…»`,
    esIdeaFuerza(caso.texto) === caso.pizarra,
  );
}

// Una fórmula larga entra igualmente: es el contenido propio de la pizarra.
check(
  "una fórmula larga no se rechaza por su longitud",
  esIdeaFuerza("4x⁵ - 3x⁴ + 2x³ - 7x² + 5x - 12 = 0"),
);

// ── Módulo 4 · catálogo formal de reglas ─────────────────────────────────────
// La fase "Reglas y propiedades" debe presentar el catálogo completo del tema,
// no una sola regla. El catálogo vive como dato, no en el código.
console.log("\n · Catálogo formal de reglas (Módulo 4)");

const catalogoCrudo = JSON.parse(
  readFileSync(new URL("../prisma/seed-data/reglas-matematicas.json", import.meta.url), "utf8"),
);

let catalogo = null;
try {
  catalogo = adaptarCatalogo(catalogoCrudo);
  check("el catálogo se adapta sin errores", true);
} catch (e) {
  check("el catálogo se adapta sin errores", false, e.message);
}

if (catalogo) {
  // Cada tema tiene que tener reglas: uno sin ellas dejaría su fase vacía.
  for (const tema of TEMAS_LECCION) {
    const delTema = catalogo.filter((r) => r.tema === tema.tema);
    check(`[${tema.clave}] tiene reglas en el catálogo`, delTema.length > 0, `${delTema.length}`);
  }

  // Las reglas que el cliente pidió explícitamente para derivadas.
  const derivadas = catalogo.filter((r) => r.tema === "DERIVADAS");
  for (const exigida of ["constante", "potencia", "suma", "producto", "cadena"]) {
    check(
      `derivadas incluye la regla de la ${exigida}`,
      derivadas.some((r) => new RegExp(exigida, "i").test(r.nombre)),
      `hay: ${derivadas.map((r) => r.nombre).join(", ")}`,
    );
  }

  // El catálogo se escribe directamente en LaTeX: si una fórmula no compila,
  // el alumno vería el error en rojo en mitad de la lección.
  for (const regla of catalogo) {
    for (const [campo, valor] of [
      ["enunciado", regla.enunciado],
      ["ejemplo", regla.ejemplo],
    ]) {
      if (!valor) continue;
      let err = null;
      try {
        katex.renderToString(valor, { throwOnError: true, strict: false });
      } catch (e) {
        err = e.message;
      }
      check(`[${regla.clave}] el ${campo} compila en KaTeX`, err === null, err ?? "");
    }
  }

  // Un catálogo con una regla sin práctica calificable es correcto y esperado
  // —el motor no cubre la del producto ni la de la cadena—, pero al menos una
  // por tema tiene que serlo, o la fase de práctica se quedaría sin contenido.
  for (const tema of TEMAS_LECCION) {
    const practicables = catalogo.filter((r) => r.tema === tema.tema && r.practicable);
    check(
      `[${tema.clave}] al menos una regla admite práctica calificada`,
      practicables.length > 0,
    );
  }

  console.log("\n · Identificación de la regla aplicada");
  const casosRegla = [
    {
      texto: "Regla de la potencia: multiplicamos el coeficiente por el exponente, y al exponente le restamos 1.",
      esperada: "Regla de la potencia",
    },
    { texto: "Vamos a derivar x².", esperada: null },
    { texto: "Una derivada mide la RAPIDEZ con la que cambia una función.", esperada: null },
  ];
  for (const caso of casosRegla) {
    const encontrada = identificarRegla(caso.texto, derivadas);
    check(
      caso.esperada
        ? `«${caso.texto.slice(0, 32)}…» se etiqueta «${caso.esperada}»`
        : `«${caso.texto.slice(0, 32)}…» no se etiqueta`,
      (encontrada?.nombre ?? null) === caso.esperada,
      `obtenido: ${encontrada?.nombre ?? "null"}`,
    );
  }

  // Con nombres que se contienen unos a otros gana el MÁS LARGO: "regla de la
  // suma y la resta" contiene "regla de la suma", y quedarse con el primero
  // etiquetaría mal el paso.
  const conAmbiguedad = [{ nombre: "Regla de la suma" }, { nombre: "Regla de la suma y la resta" }];
  check(
    "ante nombres solapados se elige el más específico",
    identificarRegla("Aplicamos la regla de la suma y la resta", conAmbiguedad)?.nombre ===
      "Regla de la suma y la resta",
  );

  // ── Sincronía entre la pizarra y el audio ─────────────────────────────────
  // La fase de Reglas debe componer ÚNICAMENTE la tarjeta de la regla que el
  // tutor está explicando. Mostrar el catálogo entero hacía que la voz hablara
  // de la potencia mientras en pantalla aparecían el cociente y la cadena.
  console.log("\n · Regla activa (sincronía pizarra ↔ audio)");

  check(
    "sin líneas todavía, no se muestra ninguna tarjeta",
    reglaActiva([], derivadas) === null,
  );
  check(
    "una línea que no nombra regla no activa ninguna",
    reglaActiva(["Vamos a ver cómo se derivan las potencias."], derivadas) === null,
  );

  // El texto REAL con el que el motor abre la fase de reglas en derivadas.
  const lineasReglaReal = [
    "Para derivar una potencia usamos la REGLA DE LA POTENCIA: se baja el exponente multiplicando delante y se le resta 1. Por ejemplo, la derivada de x³ es 3x², y la de x⁵ es 5x⁴. Veámoslo con calma.",
    "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹",
  ];
  const activa = reglaActiva(lineasReglaReal, derivadas);
  check(
    "con el texto real del motor, la regla activa es la de la potencia",
    activa?.nombre === "Regla de la potencia",
    `obtenido: ${activa?.nombre ?? "null"}`,
  );

  // Lo esencial del defecto: NO deben aparecer las demás.
  for (const ausente of ["Regla del cociente", "Regla de la cadena", "Regla del producto"]) {
    check(`no se activa «${ausente}» mientras se explica la potencia`, activa?.nombre !== ausente);
  }

  // Guarda sobre el propio fichero. El defecto no estaba en la lógica sino en
  // la plantilla: un `reglas.map(...)` pintaba todas las tarjetas a la vez. Una
  // prueba de comportamiento no lo habría detectado, porque `reglaActiva()`
  // devolvía lo correcto mientras la pantalla mostraba de más. Se comprueba,
  // por tanto, que en pizarra.tsx no quede ningún recorrido del catálogo.
  const fuentePizarra = readFileSync(
    new URL("../components/leccion/pizarra.tsx", import.meta.url),
    "utf8",
  );
  const recorridos = fuentePizarra.match(/reglas\s*\.\s*map\s*\(/g) || [];
  check(
    "pizarra.tsx no recorre el catálogo completo",
    recorridos.length === 0,
    `encontrados: ${recorridos.length}`,
  );
  check(
    "pizarra.tsx compone la tarjeta de la regla activa",
    /reglaActiva\s*\(/.test(fuentePizarra) && /TarjetaRegla/.test(fuentePizarra),
  );
  // La comprobación de arriba mira los DATOS: que el catálogo tenga reglas para
  // la fase. No basta, porque el componente podría dejar de usarlas y la fase
  // volvería a quedarse en blanco sin que ninguna prueba se enterara —que es
  // exactamente lo que pasó—. Aquí se fija el recurso al catálogo.
  check(
    "pizarra.tsx recurre al catálogo cuando no detecta la regla",
    /porPizarra\s*\?\?\s*reglas\[0\]/.test(fuentePizarra),
  );
  check(
    "pizarra.tsx dibuja el diagrama de la fase de Concepto",
    /esFaseDeConcepto\s*\([^)]*\)\s*&&/.test(fuentePizarra) && /DiagramaConcepto/.test(fuentePizarra),
  );
  // El enunciado tiene que quedar anclado. Es la regresión que ya ocurrió una
  // vez: al componer sólo la última línea, desaparecía en cuanto empezaba el
  // desarrollo.
  check(
    "pizarra.tsx ancla el enunciado y compone el desarrollo aparte",
    /\{enunciado\s*&&/.test(fuentePizarra) && /desarrollo\.length\s*>\s*0/.test(fuentePizarra),
  );
  // Y el paso intermedio NO puede aparecer en la práctica: revelaría la
  // respuesta que el alumno tiene que hallar.
  check(
    "el paso intermedio se añade sólo en el ejemplo, no en la práctica",
    /if\s*\(esFaseDeEjemplo\([^)]*\)\)\s*\{[\s\S]{0,200}pasoIntermedioDerivada/.test(fuentePizarra),
  );

  // Al avanzar el diálogo, la tarjeta cambia: manda la MÁS RECIENTE.
  const trasAvanzar = reglaActiva(
    [...lineasReglaReal, "Ahora la regla de la suma y la resta: se deriva término a término."],
    derivadas,
  );
  check(
    "al avanzar el diálogo, la tarjeta pasa a la regla nueva",
    trasAvanzar?.nombre === "Regla de la suma y la resta",
    `obtenido: ${trasAvanzar?.nombre ?? "null"}`,
  );
}

// ── Módulo 7 · matemáticas dentro de la prosa ────────────────────────────────
// El motor incrusta las fórmulas en la frase, sin marcarlas ("la derivada de x³
// es 3x²"). Si no se detectan, la explicación se lee como texto plano, que es
// justo lo que el cliente reportó.
console.log("\n · Fórmulas dentro de la explicación (Módulo 7)");

const casosProsaMat = [
  {
    texto: "Por ejemplo, la derivada de x³ es 3x², y la de x⁵ es 5x⁴.",
    esperadas: ["x³", "3x²", "x⁵", "5x⁴"],
  },
  { texto: "Así, la derivada de x² es 2x. Ahora te toca a ti.", esperadas: ["x²", "2x"] },
  { texto: "Regla de la potencia: la derivada de xⁿ es n·xⁿ⁻¹", esperadas: ["xⁿ", "n·xⁿ⁻¹"] },
  { texto: "¿Cuál es la derivada de 5x²?", esperadas: ["5x²"] },
  { texto: "derivada de x² = 2x", esperadas: ["x² = 2x"] },
  { texto: "Aquí el coeficiente es 1 y el exponente 2: 1 × 2 = 2, y el nuevo exponente es 1.", esperadas: ["1 × 2 = 2"] },
  // Prosa pura: no debe marcarse NADA. Convertir una palabra en fórmula se ve
  // roto; dejar una fórmula en texto plano sólo se ve soso.
  {
    texto:
      "Una derivada mide la RAPIDEZ con la que cambia una función: en cada punto indica cuánto crece o decrece, es decir, la pendiente de su gráfica.",
    esperadas: [],
  },
  { texto: "Derivada: razón de cambio (la pendiente) de una función", esperadas: [] },
  { texto: "Vamos a derivar x².", esperadas: ["x²"] },
];

for (const caso of casosProsaMat) {
  const partes = separarProsaYMatematicas(caso.texto);
  const formulas = partes.filter((p) => p.tipo === "linea").map((p) => p.contenido);
  check(
    `detecta ${caso.esperadas.length} fórmula(s) en «${caso.texto.slice(0, 42)}…»`,
    JSON.stringify(formulas) === JSON.stringify(caso.esperadas),
    `obtenido: ${JSON.stringify(formulas)}`,
  );
  // Reconstruir el texto debe devolver el original: si la separación se comiera
  // un trozo, el alumno leería una frase incompleta y nada avisaría.
  check(
    `no pierde contenido en «${caso.texto.slice(0, 30)}…»`,
    partes.map((p) => p.contenido).join("") === caso.texto,
  );
  // Y cada fórmula detectada tiene que poder componerse.
  for (const f of formulas) {
    let err = null;
    try {
      katex.renderToString(planoALatex(f), { throwOnError: true, strict: false });
    } catch (e) {
      err = e.message;
    }
    check(`KaTeX compila «${f}»`, err === null, err ?? "");
  }
}

// ── Estructura de escenas ────────────────────────────────────────────────────
console.log("\n · Rótulos de las fases");
const rotulos = [
  ["concepto", "Concepto"],
  ["regla", "Reglas y propiedades"],
  ["ejemplo_guiado", "Ejemplo paso a paso"],
  ["practica", "Práctica"],
];
for (const [clave, titulo] of rotulos) {
  check(`«${clave}» se rotula «${titulo}»`, tituloDeFase(clave) === titulo, tituloDeFase(clave));
}

// ── Módulos 4, 5 y 7 · la lección de cada tema ───────────────────────────────
console.log("\n · Lección de cada tema (Módulos 4, 5 y 7)");

/** Fases pedagógicas obligatorias, en orden. */
const FASES = [
  { nombre: "concepto", patron: /concepto/i },
  { nombre: "reglas", patron: /regla|propiedad/i },
  { nombre: "ejemplo", patron: /ejemplo/i },
  { nombre: "practica", patron: /practica|práctica/i },
];

const estadoPorTema = new Map();

for (const tema of TEMAS_LECCION) {
  const estado = estadoInicial();
  estado.claveTema = tema.clave;
  const cuerpo = construirPeticion(tema.consulta, estado);
  const datos = await consultar(cuerpo);

  const etiqueta = `[${tema.clave}]`;

  // Módulo 5: los cinco temas los resuelve el motor determinista, no la IA.
  check(
    `${etiqueta} la lección es determinista (no consume IA)`,
    datos.fuente_ia === "local",
    `fuente_ia=${datos.fuente_ia}`,
  );

  // Módulo 4: las cuatro fases pedagógicas obligatorias.
  const modulos = Array.isArray(datos.lsg?.modulos)
    ? datos.lsg.modulos.map((m) => String(m.id))
    : [];
  check(`${etiqueta} la lección viene en módulos`, modulos.length > 0, `módulos: ${modulos.length}`);
  for (const fase of FASES) {
    check(
      `${etiqueta} incluye la fase «${fase.nombre}»`,
      modulos.some((id) => fase.patron.test(id)),
      `módulos: ${modulos.join(", ")}`,
    );
  }

  // Cada módulo se presenta como una ESCENA con su rótulo. Un módulo que no
  // caiga en una fase conocida se le mostraría al alumno con su clave interna.
  check(
    `${etiqueta} todos los módulos tienen rótulo de fase`,
    modulos.every((id) => esFaseConocida(id)),
    `sin rótulo: ${modulos.filter((id) => !esFaseConocida(id)).join(", ")}`,
  );

  // Módulo 7: todo lo que va a la pizarra debe poder componerse.
  const pasos = flattenLSG(datos.lsg || {});

  // Y también las fórmulas incrustadas en las explicaciones habladas.
  let fallosProsa = 0;
  for (const paso of pasos.filter((p) => p.tipo === "hablar")) {
    for (const parte of separarProsaYMatematicas(paso.texto ?? "")) {
      if (parte.tipo !== "linea") continue;
      try {
        katex.renderToString(planoALatex(parte.contenido), { throwOnError: true, strict: false });
      } catch (e) {
        fallosProsa++;
        console.log(`      · no compila en la explicación: «${parte.contenido}» → ${e.message.slice(0, 70)}`);
      }
    }
  }
  check(`${etiqueta} las fórmulas de la explicación se componen`, fallosProsa === 0, `${fallosProsa} fallo(s)`);
  const pizarras = pasos.filter((p) => p.tipo === "pizarra").map((p) => p.contenido);
  check(`${etiqueta} escribe en la pizarra`, pizarras.length > 0);

  let fallosKatex = 0;
  for (const linea of pizarras) {
    if (!pareceMatematica(linea)) continue; // los avisos en prosa no se componen
    try {
      katex.renderToString(planoALatex(linea), { throwOnError: true, strict: false });
    } catch (e) {
      fallosKatex++;
      console.log(`      · no compila: «${linea}» → ${e.message.slice(0, 80)}`);
    }
  }
  check(`${etiqueta} toda la pizarra se compone con KaTeX`, fallosKatex === 0, `${fallosKatex} fallo(s)`);

  // NINGUNA FASE PUEDE QUEDAR EN BLANCO.
  //
  // Al dejar de volcar la locución al lienzo, las fases que sólo narran se
  // quedaron sin nada que mostrar: en aritmética y en ecuaciones lineales, el
  // motor no escribe nada en la pizarra durante "Reglas y propiedades". La
  // tarjeta del catálogo cubre ese hueco, y esto lo comprueba.
  const reglasDelTema = catalogo?.filter((r) => r.tema === tema.tema) ?? [];
  for (const modulo of datos.lsg?.modulos ?? []) {
    const id = String(modulo.id);
    const escritas = (modulo.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? ""))
      .filter(esIdeaFuerza);

    // Qué se verá en esa fase: lo escrito, o la tarjeta de la regla, o el
    // diagrama del concepto.
    const hayTarjeta = esFaseDeReglas(id) && reglasDelTema.length > 0;
    const hayDiagrama = esFaseDeConcepto(id) && tieneDiagrama(tema.tema);
    check(
      `[${tema.clave}] la fase «${tituloDeFase(id)}» no queda en blanco`,
      escritas.length > 0 || hayTarjeta || hayDiagrama,
      `pizarra: ${escritas.length} · tarjeta: ${hayTarjeta} · diagrama: ${hayDiagrama}`,
    );
  }

  // Ninguna línea que el motor escribe en la pizarra puede ser un párrafo: la
  // explicación hablada es cosa del subtítulo.
  const parrafos = pizarras.filter((linea) => !esIdeaFuerza(linea));
  check(
    `${etiqueta} la pizarra no recibe párrafos explicativos`,
    parrafos.length === 0,
    parrafos.map((l) => `«${l.slice(0, 50)}…»`).join(" · "),
  );

  // Y lo NARRADO no debe repetirse en la pizarra: era la duplicación de la
  // locución. El motor manda el mismo texto por las dos vías, y la interfaz se
  // queda sólo con la de la voz.
  const narrado = pasos.filter((p) => p.tipo === "hablar").map((p) => String(p.texto ?? "").trim());
  const repetidas = pizarras.filter((l) => narrado.includes(String(l).trim()));
  check(
    `${etiqueta} nada de lo narrado se escribe también en la pizarra`,
    repetidas.length === 0,
    repetidas.map((l) => `«${l.slice(0, 40)}…»`).join(" · "),
  );

  // Barrido de LETRAS PEGADAS. Ninguna línea con palabras puede acabar
  // compuesta como fórmula pura: KaTeX tipografiaría cada letra como una
  // variable suelta y el rótulo se leería como un amasijo en cursiva. Es la
  // comprobación que faltaba cuando esto llegó al cliente.
  const pegadas = pizarras.filter(
    (linea) =>
      /[a-záéíóúñ]{3,}/i.test(linea) && // lleva alguna palabra
      notacionFormal(linea) === null && // no se reescribe en notación formal
      pareceMatematica(linea), // y aun así se compondría entera
  );
  check(
    `${etiqueta} ninguna línea con palabras se compone como fórmula`,
    pegadas.length === 0,
    pegadas.map((l) => `«${l}»`).join(" · "),
  );

  // Se guarda el estado para probar después los botones de apoyo.
  estado.temaActivo = tema.consulta;
  if (datos.cursores) estado.cursores = datos.cursores;
  estado.previo = pasos
    .filter((p) => p.tipo === "hablar")
    .slice(0, 3)
    .map((p) => p.texto)
    .join(" ")
    .slice(0, 600);
  estado.ejercicio = pizarras[pizarras.length - 1] ?? "";
  estadoPorTema.set(tema.clave, estado);
}

// ── Enunciado y desarrollo en la pizarra ─────────────────────────────────────
// Al componer sólo la última línea, el enunciado desaparecía en cuanto empezaba
// el desarrollo y el alumno se quedaba con el resultado suelto, sin poder
// contrastarlo con el planteamiento.
console.log("\n · Enunciado fijo y desarrollo debajo");

for (const tema of TEMAS_LECCION) {
  const datos = await consultar({ query: tema.consulta });
  for (const modulo of datos.lsg?.modulos ?? []) {
    const id = String(modulo.id);
    if (!/ejemplo/.test(id)) continue;
    const lineas = (modulo.directivas ?? [])
      .filter((d) => d.tipo === "pizarra")
      .map((d) => String(d.contenido ?? ""));

    // El modelo de la pizarra: la primera línea es el enunciado y las
    // siguientes el desarrollo. Si el motor dejara de escribirlo así, la
    // tarjeta mostraría un enunciado que en realidad es un paso.
    check(
      `[${tema.clave}] el ejemplo trae enunciado y al menos un paso`,
      lineas.length >= 2,
      `${lineas.length} línea(s): ${lineas.join(" | ")}`,
    );
  }
}

console.log("\n · Paso intermedio de la derivada");
const casosPaso = [
  { entrada: "5x²", esperado: "5 · 2x²⁻¹ = 10x" },
  { entrada: "3x⁴", esperado: "3 · 4x⁴⁻¹ = 12x³" },
  { entrada: "x²", esperado: "2x²⁻¹ = 2x" },
];
for (const caso of casosPaso) {
  const obtenido = pasoIntermedioDerivada(caso.entrada);
  check(
    `«${caso.entrada}» desarrolla como «${caso.esperado}»`,
    obtenido === caso.esperado,
    `obtenido: ${obtenido}`,
  );
  // Y el resultado del paso tiene que ser el MISMO que califica el motor: un
  // desarrollo que lleve a otro número sería peor que no tener desarrollo.
  const resultado = String(obtenido).split("=").pop()?.trim();
  check(
    `«${caso.entrada}» el desarrollo coincide con lo que califica el motor`,
    resultado === String(resolverEjercicio(caso.entrada, "derivadas")),
    `paso: ${resultado} · motor: ${resolverEjercicio(caso.entrada, "derivadas")}`,
  );
}

// Con un polinomio el desarrollo son varios pasos: fabricar uno solo daría una
// idea equivocada del método, así que no se inventa nada.
for (const polinomio of ["4x⁵ - 3x³", "x² - 9", "2/6 + 3/6"]) {
  check(`«${polinomio}» no se desarrolla en un solo paso`, pasoIntermedioDerivada(polinomio) === null);
}

// ── Cómo se presenta cada seguimiento ────────────────────────────────────────
// El servidor responde tres cosas distintas según lo que pulse el alumno, y
// tratarlas igual dejaba la pizarra descuadrada: una lección NUEVA se apilaba
// dentro de la escena anterior, así que arriba quedaba congelado el ejercicio
// viejo y abajo aparecía el nuevo, como si fueran el mismo.
console.log("\n · Presentación de cada tipo de seguimiento");

{
  const tema = "Enséñame derivadas";
  const base = { contexto: tema, currentTopic: tema };

  const apertura = await consultar({ query: tema });
  check(
    "abrir un tema se presenta reiniciando",
    presentacionDe(apertura.lsg, { esSeguimiento: false }) === "reiniciar",
  );

  // "Más difícil" no trae módulos: es otro ejercicio dentro de la misma fase.
  const masDificil = await consultar({
    ...base,
    query: "Proponme un problema más difícil",
    seguimiento: "mas_dificil",
  });
  check(
    "«más difícil» no trae módulos",
    !Array.isArray(masDificil.lsg?.modulos) || masDificil.lsg.modulos.length === 0,
  );
  check(
    "«más difícil» se presenta sustituyendo el ejercicio",
    presentacionDe(masDificil.lsg, { esSeguimiento: true }) === "sustituir",
  );

  // "Dame otro ejemplo" trae la lección entera: hay que reiniciar la pizarra.
  const otroEjemplo = await consultar({
    ...base,
    query: "Dame otro ejemplo",
    seguimiento: "continuacion",
  });
  check(
    "«dame otro ejemplo» trae la lección completa",
    Array.isArray(otroEjemplo.lsg?.modulos) && otroEjemplo.lsg.modulos.length >= 3,
    `módulos: ${(otroEjemplo.lsg?.modulos ?? []).length}`,
  );
  check(
    "«dame otro ejemplo» se presenta reiniciando",
    presentacionDe(otroEjemplo.lsg, { esSeguimiento: true }) === "reiniciar",
  );

  // Y al reiniciar por un seguimiento se entra por el ejemplo, no por el
  // concepto: repetirlo devolvería al alumno al principio de la clase.
  const recortada = recortarParaSeguimiento(otroEjemplo.lsg);
  const fases = (recortada.modulos ?? []).map((m) => String(m.id));
  check(
    "la lección de seguimiento no repite el concepto",
    !fases.some((f) => /concepto/i.test(f)),
    `fases: ${fases.join(", ")}`,
  );
  check(
    "la lección de seguimiento no repite las reglas",
    !fases.some((f) => /regla/i.test(f)),
    `fases: ${fases.join(", ")}`,
  );
  check("la lección de seguimiento conserva el ejemplo y la práctica", fases.length >= 2, fases.join(", "));

  // Una aclaración se añade a lo que hay: el alumno sigue con su ejercicio.
  const aclaracion = await consultar({
    ...base,
    query: "Explícame la regla que se aplica",
    seguimiento: "reexplicar",
    parte: "concepto",
    explicacionDinamica: true,
  });
  check(
    "una aclaración se presenta anexando",
    presentacionDe(aclaracion.lsg, { esSeguimiento: true, soloExplicacion: true }) === "anexar",
  );

  // Si el recorte dejara la lección vacía, se devuelve entera: es preferible
  // repetir una fase que dejar la pizarra sin nada.
  const soloConcepto = { modulos: [{ id: "concepto", directivas: [] }] };
  check(
    "un recorte que vaciaría la lección la deja intacta",
    recortarParaSeguimiento(soloConcepto).modulos.length === 1,
  );
}

// ── Módulo 8 · los botones de apoyo mantienen el tema ────────────────────────
console.log("\n · Botones de apoyo (Módulo 8)");

const BOTONES = [
  { etiqueta: "No entendí este paso", consulta: "No entendí, explícalo mejor", seguimiento: "reexplicar", parte: "resolucion" },
  { etiqueta: "Dame otro ejemplo", consulta: "Dame otro ejemplo", seguimiento: "continuacion" },
  { etiqueta: "Explicar regla", consulta: "Explícame la regla que se aplica", seguimiento: "reexplicar", parte: "concepto" },
];

for (const tema of TEMAS_LECCION) {
  const estado = estadoPorTema.get(tema.clave);
  for (const boton of BOTONES) {
    const cuerpo = construirPeticion(boton.consulta, estado, {
      seguimiento: boton.seguimiento,
      parte: boton.parte,
    });
    const datos = await consultar(cuerpo);
    const pasos = flattenLSG(datos.lsg || {});

    check(
      `[${tema.clave}] «${boton.etiqueta}» responde sin error`,
      Boolean(datos.lsg) && pasos.length > 0 && !datos.error,
      datos.error ?? `pasos: ${pasos.length}`,
    );
    // Un botón de apoyo NO debe cambiar de asunto: se sigue en el mismo tema.
    check(
      `[${tema.clave}] «${boton.etiqueta}» no cambia de tema`,
      datos.reexplicacion === true,
      `reexplicacion=${datos.reexplicacion}`,
    );
  }
}

// ── Progresión gradual de dificultad ─────────────────────────────────────────
// "Más difícil" subía de golpe al último nivel y ahí se quedaba, así que
// pulsarlo otra vez no cambiaba nada y el alumno oscilaba entre los mismos
// ejercicios. Ahora es un peldaño cada vez, con un nivel más por encima.
console.log("\n · Progresión gradual de dificultad");

const ultimaPizarra = (datos) =>
  flattenLSG(datos.lsg || {})
    .filter((d) => d.tipo === "pizarra")
    .map((d) => d.contenido)
    .pop() ?? "";

for (const tema of TEMAS_LECCION) {
  let cursores = {};
  const inicial = await consultar({ query: tema.consulta });
  cursores = inicial.cursores || {};

  const vistos = [ultimaPizarra(inicial)];
  const niveles = [];

  for (let paso = 0; paso < 3; paso++) {
    const datos = await consultar({
      query: "Proponme un problema más difícil",
      contexto: tema.consulta,
      seguimiento: "mas_dificil",
      currentTopic: tema.consulta,
      cursores,
    });
    cursores = datos.cursores || cursores;
    vistos.push(ultimaPizarra(datos));
    niveles.push(cursores["nivel:actual"]);
  }

  // El nivel tiene que SUBIR peldaño a peldaño, no saltar de una vez.
  check(
    `[${tema.clave}] "más difícil" sube de nivel de forma gradual`,
    niveles[0] < niveles[1] && niveles[1] <= niveles[2],
    `niveles: ${niveles.join(" → ")}`,
  );
  check(
    `[${tema.clave}] alcanza el nivel más alto de la escalera`,
    Math.max(...niveles) >= 3,
    `máximo: ${Math.max(...niveles)}`,
  );
  // Y los ejercicios tienen que cambiar de verdad.
  check(
    `[${tema.clave}] cada peldaño propone un ejercicio distinto`,
    new Set(vistos.filter(Boolean)).size >= 3,
    vistos.join(" | "),
  );

  // Bajar también es un peldaño, no un salto al nivel más fácil.
  const bajada = await consultar({
    query: "Ahora uno más fácil",
    contexto: tema.consulta,
    seguimiento: "mas_facil",
    currentTopic: tema.consulta,
    cursores,
  });
  const nivelTrasBajar = (bajada.cursores || {})["nivel:actual"];
  check(
    `[${tema.clave}] "más fácil" baja un solo peldaño`,
    nivelTrasBajar === Math.max(...niveles) - 1,
    `de ${Math.max(...niveles)} a ${nivelTrasBajar}`,
  );

  // La escalera no se estanca: seguir pulsando "más difícil" por encima del
  // nivel escrito a mano entra en los niveles GENERADOS y sigue subiendo.
  let cursoresLargos = { ...cursores };
  const nivelesLargos = [];
  const ejerciciosLargos = [];
  for (let paso = 0; paso < 6; paso++) {
    const datos = await consultar({
      query: "Proponme un problema más difícil",
      contexto: tema.consulta,
      seguimiento: "mas_dificil",
      currentTopic: tema.consulta,
      cursores: cursoresLargos,
    });
    cursoresLargos = datos.cursores || cursoresLargos;
    nivelesLargos.push(cursoresLargos["nivel:actual"]);
    ejerciciosLargos.push(ultimaPizarra(datos));
  }
  check(
    `[${tema.clave}] la escalera sigue subiendo más allá del nivel escrito a mano`,
    Math.max(...nivelesLargos) >= 5,
    `niveles: ${nivelesLargos.join(" → ")}`,
  );
  // Y lo generado tiene que poder calificarlo el motor: un ejercicio más
  // difícil que después no se puede corregir no sirve de nada.
  const sinResolver = ejerciciosLargos
    .filter(Boolean)
    .map((e) => e.replace(/\s*=\s*\?$/, ""))
    .filter((e) => resolverEjercicio(e, tema.clave) == null);
  check(
    `[${tema.clave}] todo ejercicio generado es calificable`,
    sinResolver.length === 0,
    sinResolver.map((e) => `«${e}»`).join(" · "),
  );

  // Los ejercicios del nivel más alto deben poder resolverse: un enunciado que
  // el motor no sabe calificar dejaría al alumno sin corrección.
  const dificil = vistos[vistos.length - 1];
  if (dificil) {
    check(
      `[${tema.clave}] el ejercicio del nivel alto es calificable`,
      resolverEjercicio(dificil.replace(/\s*=\s*\?$/, ""), tema.clave) != null,
      `«${dificil}»`,
    );
  }
}

// ── Explicación dinámica (Módulo 4) ──────────────────────────────────────────
// Los botones de aclaración devolvían guiones fijos del prototipo. Con la
// bandera `explicacionDinamica` se saltan esas ramas y la explicación se pide
// al modelo.
console.log("\n · Explicación dinámica en los botones de aclaración");

for (const tema of TEMAS_LECCION.slice(0, 2)) {
  const base = { contexto: tema.consulta, currentTopic: tema.consulta, seguimiento: "reexplicar" };

  const fija = await consultar({ query: "No entendí, explícalo mejor", ...base, parte: "resolucion" });
  const dinamica = await consultar({
    query: "No entendí, explícalo mejor",
    ...base,
    parte: "resolucion",
    explicacionDinamica: true,
  });

  // Sin la bandera se responde con el guion determinista.
  check(
    `[${tema.clave}] sin la bandera responde el guion determinista`,
    fija.fuente_ia === "local",
    `fuente_ia=${fija.fuente_ia}`,
  );
  // Con la bandera NO se usa el guion: la respuesta sale del modelo, o del
  // contenido de respaldo si la clave de Gemini no está operativa.
  check(
    `[${tema.clave}] con la bandera no se usa el guion determinista`,
    dinamica.fuente_ia !== "local",
    `fuente_ia=${dinamica.fuente_ia}`,
  );
  check(
    `[${tema.clave}] la aclaración dinámica devuelve contenido`,
    flattenLSG(dinamica.lsg || {}).length > 0,
  );
}

// ── Contexto y estilo de la aclaración ───────────────────────────────────────
// Pulsar "Explicar regla" sobre 5x² devolvía una analogía genérica de una
// montaña rusa sobre qué es una derivada: el prompt de "no entendí" ORDENA
// partir de una analogía cotidiana, y el modelo no sabía de qué regla ni sobre
// qué término tenía que hablar. Ahora se le inyecta ese contexto y se le pide
// conducta de pizarra: sin saludos y en pocas líneas.
console.log("\n · Contexto y estilo de la aclaración");

{
  const derivadas = catalogo?.filter((r) => r.tema === "DERIVADAS") ?? [];
  const potencia = derivadas.find((r) => /potencia/i.test(r.nombre));
  check("el catálogo tiene la regla de la potencia para inyectarla", Boolean(potencia));

  const aclaracion = {
    regla: potencia ? { nombre: potencia.nombre, formula: potencia.enunciado } : null,
    ejercicio: "5x²",
    tema: "Enséñame derivadas",
  };

  const datos = await consultar({
    query: "Explícame la regla que se aplica",
    contexto: "Enséñame derivadas",
    currentTopic: "Enséñame derivadas",
    seguimiento: "reexplicar",
    parte: "concepto",
    explicacionDinamica: true,
    aclaracion,
  });

  check("la aclaración con contexto responde", Boolean(datos.lsg), datos.error ?? "");
  check("no cae en el guion determinista", datos.fuente_ia !== "local", `fuente_ia=${datos.fuente_ia}`);

  const pasos = flattenLSG(datos.lsg || {});
  const hablado = pasos
    .filter((p) => p.tipo === "hablar")
    .map((p) => p.texto)
    .join(" ");

  // Estilo de pizarra: ni saludos ni presentaciones.
  const saludos = /\b(hola|buenas|claro que s[ií]|entiendo que|buena pregunta|por supuesto)\b/i;
  check(
    "la aclaración no empieza con un saludo ni una presentación",
    !saludos.test(hablado),
    hablado.slice(0, 90),
  );

  // Concisión: la queja era el formato de chat, con párrafos largos.
  const frases = pasos.filter((p) => p.tipo === "hablar");
  check(
    "la aclaración es breve (3 intervenciones como mucho)",
    frases.length <= 3,
    `${frases.length} intervenciones`,
  );

  // Y sin LaTeX crudo: la notación va en texto plano y la compone la interfaz.
  // Meterla en LaTeX rompería el TTS y los analizadores del motor, que trabajan
  // sobre esa notación.
  check(
    "la aclaración no trae LaTeX crudo",
    !/\\[a-zA-Z]+\{|\$/.test(hablado),
    hablado.slice(0, 90),
  );
}

// ── Módulo 9 · corrección determinista ───────────────────────────────────────
console.log("\n · Motor de corrección (Módulo 9)");

// Los ejercicios se pasan tal como aparecen en la pizarra, SIN la palabra que
// dice qué hacer con ellos: eso lo aporta el tema activo. Es exactamente lo que
// recibe la ruta de corrección cuando el alumno responde.
const casosCorreccion = [
  { ejercicio: "2x + 5 = 15", tema: "lineales", buena: "5", mala: "10" },
  { ejercicio: "1/2 + 1/4", tema: "fracciones", buena: "3/4", mala: "2/6" },
  { ejercicio: "47 + 38", tema: "aritmetica", buena: "85", mala: "75" },
  { ejercicio: "3x²", tema: "derivadas", buena: "6x", mala: "3x" },
  { ejercicio: "x² - 9", tema: "factorizacion", buena: "(x-3)(x+3)", mala: "(x-9)(x+9)" },
];

for (const caso of casosCorreccion) {
  const esperada = resolverEjercicio(caso.ejercicio, caso.tema);
  check(
    `[${caso.tema}] el servidor calcula la solución de «${caso.ejercicio}»`,
    esperada != null,
    `esperada=${esperada}`,
  );
  if (esperada == null) continue;
  check(
    `[${caso.tema}] acepta la respuesta correcta «${caso.buena}»`,
    checkAnswer(caso.buena, esperada).correct === true,
    `esperada=${esperada}`,
  );
  check(
    `[${caso.tema}] rechaza la respuesta incorrecta «${caso.mala}»`,
    checkAnswer(caso.mala, esperada).correct === false,
    `esperada=${esperada}`,
  );
}

// El TEMA decide cómo leer una expresión ambigua. "x² - 9" se puede derivar o
// factorizar: en una sesión de factorización hay que factorizarla. Sin esta
// exclusividad, el alumno recibiría la corrección de una operación que no era
// la que se le pidió.
const comoDerivada = resolverEjercicio("x² - 9", "derivadas");
const comoFactor = resolverEjercicio("x² - 9", "factorizacion");
check("«x² - 9» en derivadas se deriva", comoDerivada === "2x", `obtenido: ${comoDerivada}`);
check(
  "«x² - 9» en factorización se factoriza",
  String(comoFactor).includes("("),
  `obtenido: ${comoFactor}`,
);
check("la misma expresión da resultados distintos según el tema", comoDerivada !== comoFactor);

// Lo que el motor NO sabe calcular no se califica: dar por buena —o por mala—
// una respuesta que no se ha podido verificar es justo la alucinación que el
// validador determinista existe para evitar.
check(
  "no calcula lo que está fuera de su alcance (integral)",
  resolverEjercicio("integral de sen(x)") == null,
  `obtenido: ${resolverEjercicio("integral de sen(x)")}`,
);
check(
  "no calcula lo que está fuera de su alcance (sistema de dos variables)",
  resolverEjercicio("x + y = 3", "lineales") == null,
  `obtenido: ${resolverEjercicio("x + y = 3", "lineales")}`,
);

// La corrección exige autenticación: es la que registra el progreso del alumno.
const sinSesion = await fetch(`${BASE}/api/practica/corregir`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ejercicio: "2x + 5 = 15", respuesta: "5" }),
});
check(
  "la corrección rechaza peticiones sin sesión",
  sinSesion.status === 401,
  `status=${sinSesion.status}`,
);

// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(` Aprobadas: ${ok} · Fallidas: ${fallos.length}`);

if (fallos.length) {
  console.log("\n ❌ PASO 2 RECHAZADO. Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}

console.log("\n ✅ PASO 2 APROBADO — lección multimodal completa y verificada.\n");
