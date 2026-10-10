// ¿SE ACOTA DE VERDAD LA PRÁCTICA DE UNA TAREA, EN UN NAVEGADOR DE VERDAD?
//
// POR QUÉ EXISTE
// El cliente encontró, en el sitio publicado, que una tarea de "5 ejercicios"
// mandaba al alumno a la lección libre (`/estudiante/leccion`), sin cupo, sin
// contador y sin cierre: "el estudiante resuelve ejercicios de forma
// indefinida sin saber cuál ni cuándo termina". `qa/hito3.mjs` prueba el
// servidor —el cupo, las fechas, los reintentos—, pero el conteo de
// ejercicios vive en el navegador (`components/leccion/aula.tsx`), atado a
// cuándo el motor cierra un ejercicio de PRÁCTICA. Eso sólo se ve abriendo la
// página de verdad.
//
// Aquí se abre una tarea de 2 ejercicios de aritmética y se resuelven los
// dos, verificando:
//
//   A. La lección arranca DIRECTO en el tema de la tarea, sin el selector.
//   B. El contador dice "Ejercicio 1 de 2" y pasa a "Ejercicio 2 de 2".
//   C. Al resolver el segundo, aparece la pantalla de cierre con la nota.
//   D. La entrega queda registrada de verdad: `GET /api/estudiante/tareas` la
//      ve "entregada", con la nota que corresponde a dos aciertos.
//
//   node qa/hito3-navegador.mjs
//   BASE_URL=http://localhost:3000 CHROME=/ruta/a/chrome.exe node qa/hito3-navegador.mjs

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
  console.error("\n  ✗ No se ha podido cargar playwright-core: esta tarea NO se ha probado en un navegador.");
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
  body: JSON.stringify({ nombre: `Navegador Hito3 ${sufijo}`, grado: 1, seccion: "N" }),
});
const aula = await rAula.json();
check("se crea el aula de prueba", rAula.status === 201, `HTTP ${rAula.status}`);

const email = `qa.hito3nav.${sufijo}@mentoriamath.local`;
const clave = "Alumno-2026";
const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Hito3 Nav" });
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
// Mismo motivo que en qa/hito3.mjs: nivelActual viaja en el JWT y sólo se
// rellena al iniciar sesión, así que hace falta una sesión nueva.
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

// El nodo de Aritmética sembrado: tiene motor determinista, así que la tarea
// puede asociarle un tema y la lección arrancar directo en él.
const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? temas?.nodos ?? []).find(
  (t) => t.motor === "ARITMETICA" || t.clave === "aritmetica",
);

const ahoraIso = new Date().toISOString();
const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
const rTarea = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula?.aula?.id,
    titulo: `Práctica acotada ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 2,
    // 1 = un reintento permitido (tope 2 intentos en total): lo justo para
    // probar que "Reintentar" aparece la 1ª vez y desaparece la 2ª.
    limiteReintentos: 1,
    nodoId: nodoAritmetica?.id ?? null,
  }),
});
const tarea = await rTarea.json();
check("se crea la tarea de 2 ejercicios", rTarea.status === 201 && Boolean(tarea?.tarea?.id), `HTTP ${rTarea.status}`);
check("…asociada al nodo de Aritmética", Boolean(nodoAritmetica?.id), "no se encontró el nodo sembrado");

// ── El navegador ─────────────────────────────────────────────────────────────

console.log(`\n── Abriendo /estudiante/leccion?tareaId=… en Chrome ──`);

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });

// La cookie se declara POR URL, no por dominio (ver memoria del proyecto):
// así vale igual en http://localhost que en un despliegue https.
await contexto.addCookies(
  galleta.split(";").map((par) => {
    const [nombre, ...resto] = par.trim().split("=");
    return { name: nombre, value: resto.join("="), url: BASE };
  }),
);

// Voz de mentira, con tiempos conocidos: sin esto, un Chrome sin voces
// instaladas no dispara onstart/onend y la lección se queda esperando.
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
    const boton = (patron) => [...document.querySelectorAll("button")].some((b) => patron.test(b.textContent ?? ""));
    return {
      titulo: document.querySelector("h1")?.textContent ?? null,
      contador: contador ? { actual: Number(contador[1]), total: Number(contador[2]) } : null,
      hayInput: Boolean(input),
      preguntaLatex,
      tareaCompletada: /Tarea completada/.test(texto),
      nota: (texto.match(/Nota:\s*(\d+)\s*\/\s*100/) || [])[1] ?? null,
      cambiarDeTema: /Cambiar de tema/.test(texto),
      selectorDeTemas: /Elige un tema/.test(texto),
      botonSaltarTeoria: boton(/Saltar a la práctica/),
      botonReintentar: boton(/Reintentar/),
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

/** "19 + 45" → "64". Misma función que qa/navegador.mjs, para aritmética simple. */
function resolverPregunta(latex) {
  const e = String(latex ?? "").replace(/\s+/g, "");
  const s = e.match(/^(\d+)([+-])(\d+)$/);
  return s ? String(s[2] === "+" ? Number(s[1]) + Number(s[3]) : Number(s[1]) - Number(s[3])) : null;
}

let estado = await esperar((e) => e.contador != null || e.hayInput, 15_000);
check("la lección arranca DIRECTA en el tema de la tarea, sin el selector", !estado.selectorDeTemas, JSON.stringify(estado));
check("no se ofrece 'Cambiar de tema' con una tarea en curso", !estado.cambiarDeTema);
check(
  "el contador arranca en 'Ejercicio 1 de 2'",
  estado.contador?.actual === 1 && estado.contador?.total === 2,
  JSON.stringify(estado.contador),
);

// "Cada vez que ingreso me sale toda la teoría, quiero poder saltarla"
// (corrección QA): el botón aparece en cuanto carga la lección, sin esperar
// a que termine de narrar Concepto/Reglas/Ejemplo.
estado = await esperar((e) => e.botonSaltarTeoria, 10_000);
check("aparece 'Saltar a la práctica' mientras narra la teoría", estado.botonSaltarTeoria, JSON.stringify(estado));
if (estado.botonSaltarTeoria) {
  await pagina.getByRole("button", { name: /Saltar a la práctica/ }).click();
}

/** Resuelve UN ejercicio ya visible (enunciado + input) con la respuesta correcta. */
async function resolverElEjercicioVisible() {
  const e = await esperar((e) => e.hayInput && e.preguntaLatex, 15_000);
  const r = resolverPregunta(e.preguntaLatex);
  if (r != null) {
    await pagina.locator("input[placeholder*='respuesta' i]").fill(r);
    await pagina.getByRole("button", { name: /Responder/ }).click();
  }
  return e;
}

/** Resuelve los N ejercicios de un intento completo (ya con la lección abierta). */
async function resolverLaTareaEntera() {
  const primero = await resolverElEjercicioVisible();
  check("aparece un ejercicio con su enunciado", Boolean(primero.preguntaLatex), JSON.stringify(primero));

  let e = await esperar((e) => e.contador?.actual === 2 || e.tareaCompletada, 20_000);
  if (!e.tareaCompletada) {
    // Un ejercicio resuelto no trae el siguiente solo: hace falta pedirlo,
    // igual que en la lección libre. Lo que acota la tarea es el TOPE, no
    // que cada ejercicio aparezca sin que nadie lo pida.
    await pagina.getByRole("button", { name: /Dame otro ejemplo/ }).click();
    await resolverElEjercicioVisible();
  }

  e = await esperar((e) => e.tareaCompletada, 20_000);
  check("al resolver el cupo entero aparece la pantalla de cierre", e.tareaCompletada, JSON.stringify(e));
  // La tarjeta aparece en cuanto se completa el cupo, ANTES de que termine el
  // POST a /entregar ("Registrando tu entrega…"): la nota se pinta un
  // instante después, cuando esa petición responde.
  return esperar((e) => e.nota != null, 10_000);
}

// ── 1er intento: los dos ejercicios, los dos correctos ──────────────────────
estado = await resolverLaTareaEntera();
check("…con una nota de 100/100 (los dos ejercicios, correctos)", estado.nota === "100", `nota=${estado.nota}`);

// "El alumno pueda rehacer la tarea después para mejorar su nota"
// (corrección QA): con limiteReintentos=1 (tope 2 intentos), tras el 1er
// intento TODAVÍA debe ofrecerse "Reintentar".
check("tras el 1er intento, se ofrece 'Reintentar' (queda 1 de 1 reintentos)", estado.botonReintentar, JSON.stringify(estado));

const rTareasAlumno1 = await apiAlumno("/api/estudiante/tareas");
const laSuya1 = (await rTareasAlumno1.json().catch(() => ({})))?.tareas?.find((t) => t.id === tarea.tarea.id);
check(
  "el 1er intento quedó registrado: entregada, nota 100, 1 intento usado",
  laSuya1?.estado === "entregada" && laSuya1?.puntaje === 100 && laSuya1?.intentosUsados === 1,
  JSON.stringify(laSuya1),
);

// ── Reintento: se pulsa "Reintentar" y se resuelve de nuevo ──────────────────
await pagina.getByRole("button", { name: /Reintentar/ }).click();
estado = await esperar((e) => e.contador?.actual === 1, 15_000);
check("al reintentar, el contador vuelve a 'Ejercicio 1 de 2'", estado.contador?.actual === 1, JSON.stringify(estado));

estado = await resolverLaTareaEntera();
check("…el 2º intento también registra su nota", estado.nota === "100", `nota=${estado.nota}`);

// Con el tope de reintentos ya agotado (2 de 2), "Reintentar" ya NO debe
// ofrecerse: el servidor lo rechazaría con 409 si se pulsara.
check("tras agotar los reintentos, NO se ofrece 'Reintentar'", !estado.botonReintentar, JSON.stringify(estado));
check("la consola del navegador no soltó ningún error en todo el recorrido", erroresConsola.length === 0, erroresConsola.join(" | "));

// La entrega del servidor refleja el 2º intento: dos intentos usados.
const rTareasAlumno2 = await apiAlumno("/api/estudiante/tareas");
const laSuya2 = (await rTareasAlumno2.json().catch(() => ({})))?.tareas?.find((t) => t.id === tarea.tarea.id);
check(
  "la entrega final quedó registrada: entregada, nota 100, 2 intentos usados",
  laSuya2?.estado === "entregada" && laSuya2?.puntaje === 100 && laSuya2?.intentosUsados === 2,
  JSON.stringify(laSuya2),
);

// Un 3er intento directo contra el servidor confirma que el tope es real, no
// sólo que la interfaz dejó de ofrecer el botón.
const rTercerIntento = await apiAlumno(`/api/estudiante/tareas/${tarea.tarea.id}/entregar`, {
  method: "POST",
  body: JSON.stringify({ puntaje: 100, completada: true }),
});
check("un 3er intento se bloquea de verdad en el servidor (409)", rTercerIntento.status === 409, `HTTP ${rTercerIntento.status}`);

await navegador.close();
salir();
