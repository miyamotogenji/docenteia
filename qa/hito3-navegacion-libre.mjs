// ¿SE PUEDE NAVEGAR LIBREMENTE ENTRE LOS EJERCICIOS DE UNA TAREA?
//
// POR QUÉ EXISTE
// El cliente, tras probar el round anterior, encontró que los círculos
// numerados de la miga de pan eran estáticos: "El estudiante NO puede elegir
// qué ejercicio desarrollar: si desea saltarse el ejercicio 2 para resolver
// primero el 3… o si desea regresar al 1 para corregir o revisar, la
// interfaz no responde."
//
// Aquí se abre una tarea de 3 ejercicios y se prueba, en un Chrome real:
//
//   A. Saltarse el 2 para resolver primero el 3 — un clic en un círculo
//      PENDIENTE que no es el activo pide un ejercicio nuevo PARA ESE
//      puesto, no para "el que sigue".
//   B. Volver al 1 para REVISARLO — un clic en un círculo ya resuelto abre
//      su enunciado y la respuesta dada, sin tocar lo que esté sonando.
//   C. Terminar el que faltaba (el 2) completa la tarea igual, aunque se
//      haya resuelto FUERA de orden.
//
//   node qa/hito3-navegacion-libre.mjs
//   BASE_URL=http://localhost:3000 CHROME=/ruta/a/chrome.exe node qa/hito3-navegacion-libre.mjs

import { existsSync } from "node:fs";
import { createRequire } from "node:module";

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

const require = createRequire(import.meta.url);

const CHROME =
  process.env.CHROME ||
  [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].find((ruta) => existsSync(ruta));

const RUTA_PLAYWRIGHT = process.env.PLAYWRIGHT_CORE || "playwright-core";

let ok = 0;
const fallos = [];
function check(nombre, condicion, detalle = "") {
  if (condicion) {
    ok++;
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos.push(`${nombre}${detalle ? ` — ${detalle}` : ""}`);
    console.log(`  ✗ ${nombre}${detalle ? ` — ${detalle}` : ""}`);
  }
}
function salir() {
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
  if (fallos.length > 0) {
    console.log("\n Fallos:");
    for (const f of fallos) console.log(`   · ${f}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
}

let chromium;
try {
  ({ chromium } = require(RUTA_PLAYWRIGHT));
} catch (e) {
  console.error("\n  ✗ No se ha podido cargar playwright-core.\n");
  console.error(`    (${String(e.message).split("\n")[0]})\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge.\n");
  process.exit(1);
}

await exigirServidor();

console.log("\n── Preparando el aula, la matrícula y la tarea (por HTTP) ──");

const sesionDocente = await iniciarSesion(
  BASE,
  process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
  process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
);
if (!sesionDocente) {
  console.error("  ✗ No se pudo iniciar sesión como el docente de la semilla.");
  process.exit(1);
}
const api = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: sesionDocente, ...(opciones.headers || {}) },
  });

const sufijo = Date.now().toString(36);
const rAula = await api("/api/docente/aulas", {
  method: "POST",
  body: JSON.stringify({ nombre: `Nav libre ${sufijo}`, grado: 1, seccion: "L" }),
});
const aula = await rAula.json();
check("se crea el aula de prueba", rAula.status === 201, `HTTP ${rAula.status}`);

const email = `qa.navlibre.${sufijo}@mentoriamath.local`;
const clave = "Alumno-2026";
const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Nav Libre" });
check("se registra el alumno de prueba", alta.ok);

await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT",
  headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({ etapa: "PRIMARIA", curso: 4 }),
});
const prueba = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST",
  headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({
    respuestas: (prueba.preguntas ?? []).map((p) => ({
      preguntaId: p.id,
      respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
    })),
  }),
});
const galleta = (await iniciarSesion(BASE, email, clave)) ?? alta.sesion;

const apiAlumno = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, {
    ...opciones,
    headers: { "Content-Type": "application/json", cookie: galleta, ...(opciones.headers || {}) },
  });
const rUnirse = await apiAlumno("/api/estudiante/unirse", {
  method: "POST",
  body: JSON.stringify({ codigoAcceso: aula?.aula?.codigoAcceso }),
});
check("el alumno se matricula en el aula", rUnirse.status === 201, `HTTP ${rUnirse.status}`);

const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? []).find(
  (t) => t.motor === "ARITMETICA" || t.clave === "aritmetica",
);

const ahoraIso = new Date().toISOString();
const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
const rTarea = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula?.aula?.id,
    titulo: `Navegación libre ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 3,
    limiteReintentos: 0,
    nodoId: nodoAritmetica?.id ?? null,
  }),
});
const tarea = await rTarea.json();
check("se crea la tarea de 3 ejercicios", rTarea.status === 201 && Boolean(tarea?.tarea?.id), `HTTP ${rTarea.status}`);

// ── El navegador ─────────────────────────────────────────────────────────────

console.log(`\n── Abriendo /estudiante/leccion?tareaId=… en Chrome ──`);

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });

await contexto.addCookies(
  galleta.split(";").map((par) => {
    const [nombre, ...resto] = par.trim().split("=");
    return { name: nombre, value: resto.join("="), url: BASE };
  }),
);

await contexto.addInitScript(() => {
  window.SpeechSynthesisUtterance = class {
    constructor(texto) {
      this.text = texto;
      this.onstart = null;
      this.onend = null;
      this.onerror = null;
    }
  };
  const sintetizador = {
    speaking: false,
    paused: false,
    pending: false,
    getVoices: () => [{ name: "QA es-ES", lang: "es-ES", default: true, localService: true }],
    addEventListener() {},
    removeEventListener() {},
    onvoiceschanged: null,
    speak(u) {
      setTimeout(() => u.onstart?.({ charIndex: 0 }), 50);
      setTimeout(() => {
        sintetizador.speaking = false;
        u.onend?.({ charIndex: u.text.length });
      }, 250);
      sintetizador.speaking = true;
    },
    cancel() {
      sintetizador.speaking = false;
    },
    pause() {
      sintetizador.paused = true;
    },
    resume() {
      sintetizador.paused = false;
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: sintetizador, configurable: true });
});

const pagina = await contexto.newPage();
const erroresConsola = [];
pagina.on("pageerror", (e) => erroresConsola.push(String(e)));

await pagina.goto(`${BASE}/estudiante/leccion?tareaId=${tarea.tarea.id}`, { waitUntil: "networkidle" });

const estadoVisible = () =>
  pagina.evaluate(() => {
    const input = [...document.querySelectorAll("input")].find((i) => /respuesta/i.test(i.placeholder ?? ""));
    let preguntaLatex = null;
    for (let el = input, k = 0; el && k < 6; k++) {
      el = el.parentElement;
      const a = el?.querySelector("annotation");
      if (a) {
        preguntaLatex = a.textContent;
        break;
      }
    }
    const texto = document.body.innerText ?? "";
    const contador = texto.match(/Ejercicio (\d+) de (\d+)/);
    const migas = [...document.querySelectorAll("[title^='Ejercicio ']")].map((s) => ({
      numero: Number((s.getAttribute("title") ?? "").match(/Ejercicio (\d+)/)?.[1] ?? 0),
      estado: (s.getAttribute("title") ?? "").split(": ")[1] ?? null,
    }));
    return {
      contador: contador ? { actual: Number(contador[1]), total: Number(contador[2]) } : null,
      hayInput: Boolean(input),
      preguntaLatex,
      tareaCompletada: /Tarea completada/.test(texto),
      nota: (texto.match(/Nota:\s*(\d+)\s*\/\s*100/) || [])[1] ?? null,
      migas,
      // "El sistema debe posicionar al alumno DIRECTAMENTE en el modo de
      // resolución (fase = 'practica')… sin disparar… pantallas teóricas
      // intermedias": la fase activa de la pizarra, tal como la marca el
      // propio componente.
      faseActiva: document.querySelector(".pz-pizarra")?.getAttribute("data-fase") ?? null,
      revision: (texto.match(/Tu respuesta: ([^\n(]+)\(([^)]+)\)/) || null)?.slice(1) ?? null,
      narrando: [...document.querySelectorAll("button")].some((b) => /^Pausa$/.test((b.textContent ?? "").trim())),
    };
  });

async function esperar(cond, ms, cada = 300) {
  const t0 = Date.now();
  let e = await estadoVisible();
  while (!cond(e) && Date.now() - t0 < ms) {
    await pagina.waitForTimeout(cada);
    e = await estadoVisible();
  }
  return e;
}

function resolverPregunta(latex) {
  const e = String(latex ?? "").replace(/\s+/g, "");
  const s = e.match(/^(\d+)([+-])(\d+)$/);
  return s ? String(s[2] === "+" ? Number(s[1]) + Number(s[3]) : Number(s[1]) - Number(s[3])) : null;
}

async function clicCirculo(numero) {
  // El nombre accesible del botón es sólo el número (su texto visible); lo
  // que identifica el ejercicio y su estado es el atributo `title`.
  await pagina.locator(`button[title^="Ejercicio ${numero}:"]`).click();
}

async function resolverElVisible() {
  const e = await esperar((e) => e.hayInput && e.preguntaLatex, 20_000);
  const r = resolverPregunta(e.preguntaLatex);
  if (r != null) {
    await pagina.locator("input[placeholder*='respuesta' i]").fill(r);
    await esperar((e) => !e.narrando, 20_000);
    await pagina.getByRole("button", { name: /Responder/ }).click();
  }
  return e;
}

// 1. Arranca en el ejercicio 1.
let estado = await esperar((e) => e.contador != null, 20_000);
check("arranca en el ejercicio 1 de 3", estado.contador?.actual === 1 && estado.contador?.total === 3, JSON.stringify(estado.contador));

// 2. Resolverlo primero.
await resolverElVisible();
estado = await esperar((e) => (e.migas.find((m) => m.numero === 1)?.estado ?? "") === "completado", 20_000);
check("tras resolverlo, el círculo 1 pasa a 'completado'", /completado/.test(estado.migas.find((m) => m.numero === 1)?.estado ?? ""), JSON.stringify(estado.migas));

// 3. "Saltarse el 2 para resolver primero el 3" — clic directo en el círculo 3.
await clicCirculo(3);
estado = await esperar((e) => e.contador?.actual === 3, 15_000);
check("un clic en el círculo 3 (pendiente) lo activa, saltándose el 2", estado.contador?.actual === 3, JSON.stringify(estado.contador));
check(
  "…y el círculo 2 se queda pendiente, no se activó por error",
  /pendiente/.test(estado.migas.find((m) => m.numero === 2)?.estado ?? ""),
  JSON.stringify(estado.migas),
);

// "El sistema debe posicionar al alumno DIRECTAMENTE en el modo de
// resolución… sin disparar… pantallas teóricas intermedias" (corrección
// QA): nunca debe pasar por Concepto/Ejemplo al saltar por la miga de pan.
estado = await esperar((e) => e.hayInput && e.preguntaLatex, 20_000);
check(
  "el salto a un ejercicio pendiente va DIRECTO a Práctica, sin pasar por Ejemplo/Concepto",
  /practica|práctica/i.test(estado.faseActiva ?? ""),
  `faseActiva=${estado.faseActiva}`,
);

await resolverElVisible();
estado = await esperar((e) => (e.migas.find((m) => m.numero === 3)?.estado ?? "") === "completado", 20_000);
check("el ejercicio 3 queda 'completado' fuera de orden", /completado/.test(estado.migas.find((m) => m.numero === 3)?.estado ?? ""), JSON.stringify(estado.migas));
check("la tarea NO se da por completa: todavía falta el 2", !estado.tareaCompletada, JSON.stringify(estado));

// 4. "Regresar al 1 para revisar" — clic en un círculo YA RESUELTO.
//
// El puesto activo ya avanzó solo al 2 —el único pendiente— en cuanto se
// resolvió el 3 (el mismo avance automático que vive la fila sin tocar la
// miga de pan); lo que importa aquí es que abrir la revisión del 1 NO lo
// cambie de nuevo.
estado = await esperar((e) => e.contador?.actual === 2, 15_000);
const activoAntesDeRevisar = estado.contador?.actual;
await clicCirculo(1);
estado = await esperar((e) => e.revision != null, 10_000);
check("un clic en el círculo 1 (ya resuelto) abre su revisión", estado.revision != null, JSON.stringify(estado.revision));
check(
  "…sin tocar el ejercicio activo: sigue siendo el mismo de antes de revisar",
  estado.contador?.actual === activoAntesDeRevisar,
  JSON.stringify(estado.contador),
);
// Se cierra la revisión clicando el mismo círculo otra vez.
await clicCirculo(1);
estado = await esperar((e) => e.revision == null, 5_000);
check("un segundo clic en el mismo círculo cierra la revisión", estado.revision == null);

// 5. Resolver el que faltaba (el 2) completa la tarea, aunque fue el último en orden real.
await clicCirculo(2);
estado = await esperar((e) => e.contador?.actual === 2, 15_000);
check("clic en el círculo 2 (el único pendiente) lo activa", estado.contador?.actual === 2, JSON.stringify(estado.contador));
estado = await resolverElVisible();
estado = await esperar((e) => e.tareaCompletada, 20_000);
check("al completar el último pendiente, la tarea se da por completa", estado.tareaCompletada, JSON.stringify(estado));
estado = await esperar((e) => e.nota != null, 10_000);
check("…con nota 100/100 (los tres, correctos, en cualquier orden)", estado.nota === "100", `nota=${estado.nota}`);
check("la consola del navegador no soltó ningún error", erroresConsola.length === 0, erroresConsola.join(" | "));

const rTareasAlumno = await apiAlumno("/api/estudiante/tareas");
const laSuya = (await rTareasAlumno.json().catch(() => ({})))?.tareas?.find((t) => t.id === tarea.tarea.id);
check(
  "la entrega quedó registrada en el servidor: entregada, nota 100",
  laSuya?.estado === "entregada" && laSuya?.puntaje === 100,
  JSON.stringify(laSuya),
);

await navegador.close();
salir();
