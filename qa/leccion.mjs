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
  pareceMatematica,
  planoALatex,
  separarProsaYMatematicas,
} from "../lib/matematicas.ts";
import { esFaseConocida, tituloDeFase } from "../lib/leccion/fases.ts";
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
