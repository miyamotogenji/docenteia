// Validación del BANCO DE PREGUNTAS del diagnóstico inicial.
//
// POR QUÉ EXISTE
// El diagnóstico decide el nivel con el que un alumno empieza el curso. Si una
// de las cinco respuestas del banco estuviera mal, el sistema clasificaría mal
// a TODOS los estudiantes, y lo haría en silencio: no hay ningún síntoma
// visible, sólo alumnos colocados en el nivel equivocado.
//
// Por eso el banco no se da por bueno porque venga revisado a mano: se
// contrasta contra el MISMO motor determinista que califica las prácticas
// (src/preLight.js). Cuando el motor no cubre un caso, se dice explícitamente
// en lugar de darlo por verificado.
//
// No necesita servidor ni base de datos:  node qa/diagnostico.mjs

import { readFileSync } from "node:fs";

import {
  computeAnswer,
  solveLinearFromText,
  solveFractionFromText,
  computeDerivative,
  computeFactorization,
} from "../src/preLight.js";
// Se importa la transformación REAL que usa la semilla, no una copia: validar
// una copia podría dar por bueno un banco que la semilla carga de otra manera.
import { adaptarBanco } from "../lib/diagnostico/banco.ts";

const RUTA = new URL("../prisma/seed-data/preguntas-diagnostico.json", import.meta.url);
const banco = JSON.parse(readFileSync(RUTA, "utf8"));

const TEMAS_VALIDOS = new Set([
  "aritmetica",
  "fracciones",
  "ecuaciones_lineales",
  "factorizacion",
  "derivadas",
]);

let ok = 0;
const fallos = [];
const sinVerificar = [];

function check(nombre, cond, detalle = "") {
  if (cond) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

/** Normaliza para comparar: sin espacios, minúsculas, superíndices a "^n". */
function norm(s) {
  return String(s)
    .toLowerCase()
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (m) => "^" + [...m].map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹".indexOf(c)).join(""))
    .replace(/\s+/g, "")
    .replace(/[−–—]/g, "-");
}

/** Compara dos factorizaciones aceptando el orden de los factores. */
function mismaFactorizacion(a, b) {
  const factores = (s) => (norm(s).match(/\([^)]*\)/g) || []).sort().join("");
  return factores(a) === factores(b) && factores(a) !== "";
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" BANCO DE PREGUNTAS DEL DIAGNÓSTICO — validación");
console.log("═══════════════════════════════════════════════════════════\n");

// ── 1. Integridad estructural ────────────────────────────────────────────────
console.log(" · Estructura del banco");
check("es un array", Array.isArray(banco), `tipo: ${typeof banco}`);
check("tiene 5 preguntas", banco.length === 5, `tiene ${banco.length}`);

const temas = banco.map((p) => p.tema);
check("un tema por pregunta, sin repetir", new Set(temas).size === temas.length);
check(
  "cubre los 5 temas de PRE Light",
  temas.every((t) => TEMAS_VALIDOS.has(t)) && new Set(temas).size === TEMAS_VALIDOS.size,
  `temas: ${temas.join(", ")}`,
);
check("los identificadores no se repiten", new Set(banco.map((p) => p.id)).size === banco.length);

for (const p of banco) {
  const etiqueta = `[${p.id}]`;
  check(`${etiqueta} enunciado no vacío`, typeof p.pregunta === "string" && p.pregunta.trim().length > 0);
  check(`${etiqueta} tiene al menos 2 opciones`, Array.isArray(p.opciones) && p.opciones.length >= 2);
  check(`${etiqueta} sin opciones duplicadas`, new Set(p.opciones).size === p.opciones.length);
  check(
    `${etiqueta} la respuesta correcta está entre las opciones`,
    p.opciones.includes(p.respuesta_correcta),
    `respuesta_correcta="${p.respuesta_correcta}"`,
  );
}

// ── 2. Verificación matemática contra el motor determinista ──────────────────
console.log("\n · Matemática (contrastada con src/preLight.js)");

for (const p of banco) {
  const etiqueta = `[${p.id}] ${p.tema}`;
  const esperado = p.respuesta_correcta;
  let calculado = null;
  let comparar = (a, b) => norm(a) === norm(b);

  switch (p.tema) {
    case "aritmetica":
      calculado = computeAnswer(p.pregunta);
      break;
    case "fracciones":
      calculado = solveFractionFromText(p.pregunta);
      break;
    case "ecuaciones_lineales":
      calculado = solveLinearFromText(p.pregunta);
      break;
    case "factorizacion":
      calculado = computeFactorization(p.pregunta);
      comparar = mismaFactorizacion;
      break;
    case "derivadas":
      calculado = computeDerivative(p.pregunta);
      break;
  }

  if (calculado == null) {
    // El motor no cubre este caso. NO se da por verificado: se declara.
    sinVerificar.push(`${etiqueta} — el motor determinista no resuelve este enunciado`);
    console.log(`   ⚠️  ${etiqueta} sin verificar (el motor no cubre el enunciado)`);
    continue;
  }

  check(
    `${etiqueta} la respuesta declarada coincide con el motor`,
    comparar(calculado, esperado),
    `motor="${calculado}" · banco="${esperado}"`,
  );
}

// ── 3. Los distractores no deben ser también correctos ───────────────────────
console.log("\n · Distractores");
for (const p of banco) {
  const otros = p.opciones.filter((o) => o !== p.respuesta_correcta);
  check(
    `[${p.id}] ninguna otra opción equivale a la correcta`,
    otros.every((o) => norm(o) !== norm(p.respuesta_correcta)),
  );
}

// ── 4. Adaptación al esquema (la que ejecuta la semilla) ─────────────────────
console.log("\n · Adaptación al esquema de base de datos");

let adaptadas = null;
try {
  adaptadas = adaptarBanco(banco);
  check("el banco se adapta sin errores", true);
} catch (e) {
  check("el banco se adapta sin errores", false, e.message);
}

if (adaptadas) {
  check("se adaptan todas las preguntas", adaptadas.length === banco.length);
  check(
    "el orden es correlativo desde 1",
    adaptadas.every((p, i) => p.orden === i + 1),
  );
  check(
    "los temas quedan en el formato del enum",
    adaptadas.every((p) => /^[A-Z_]+$/.test(p.tema)),
  );

  for (const [i, p] of adaptadas.entries()) {
    const original = banco[i];
    const correcta = p.opciones.find((o) => o.id === p.respuestaCorrecta);
    check(
      `[${p.clave}] la respuesta correcta apunta a la opción correcta`,
      Boolean(correcta) && correcta.texto === original.respuesta_correcta,
      `id="${p.respuestaCorrecta}" → "${correcta?.texto}" · esperado "${original.respuesta_correcta}"`,
    );
    check(
      `[${p.clave}] se conservan todas las opciones y su orden`,
      p.opciones.length === original.opciones.length &&
        p.opciones.every((o, k) => o.texto === original.opciones[k]),
    );
  }
}

// Un banco con la respuesta correcta fuera de las opciones clasificaría mal a
// todos los alumnos sin dar ningún síntoma. Se comprueba que la adaptación lo
// detecta, en lugar de confiar en que nunca pasará.
const corrupto = JSON.parse(JSON.stringify(banco));
corrupto[0].respuesta_correcta = "valor que no está entre las opciones";
let detectado = false;
try {
  adaptarBanco(corrupto);
} catch {
  detectado = true;
}
check("un banco con la respuesta fuera de las opciones se rechaza", detectado);

const temaDuplicado = JSON.parse(JSON.stringify(banco));
temaDuplicado[1].tema = temaDuplicado[0].tema;
let detectadoTema = false;
try {
  adaptarBanco(temaDuplicado);
} catch {
  detectadoTema = true;
}
check("un banco con dos preguntas del mismo tema se rechaza", detectadoTema);

// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(` Aprobadas: ${ok} · Fallidas: ${fallos.length}`);
if (sinVerificar.length) {
  console.log(`\n Sin verificación automática (${sinVerificar.length}):`);
  for (const s of sinVerificar) console.log(`   · ${s}`);
  console.log(
    "\n   Estos enunciados quedan fuera del alcance actual del motor\n" +
      "   determinista. Se revisan a mano y se dejan anotados aquí a\n" +
      "   propósito, para no presentarlos como comprobados.",
  );
}

if (fallos.length) {
  console.log("\n ❌ BANCO RECHAZADO. Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}

console.log("\n ✅ BANCO APROBADO — estructura íntegra y matemática coherente.\n");
