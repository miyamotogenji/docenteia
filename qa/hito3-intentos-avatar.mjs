// ¿EL AVATAR SE CIÑE DE VERDAD AL NÚMERO DE INTENTOS QUE CONFIGURA EL DOCENTE?
//
// POR QUÉ EXISTE
// El cliente, con la pantalla delante: "El avatar debe ceñirse estrictamente
// al número de intentos que el docente configuró al momento de asignar la
// tarea (no dar chances adicionales por su cuenta); si el docente definió 2
// intentos, sólo deben permitirse esos 2… actualmente el avatar da 3 chances
// por ejercicio, aparte del número de intentos configurados por el docente en
// la asignación de tarea".
//
// `qa/qa.mjs` ya prueba el motor (`PSELight`) aislado, con un `ui` de
// mentira. Esto abre la lección DE VERDAD, con la tarea asignada desde el
// docente, y comprueba que `tarea.limiteReintentos` llega hasta el motor y
// que el número de intentos que de verdad se ofrecen es ÉSE, no un "3" fijo:
//
//   A. Con 2 intentos configurados (el ejemplo exacto del cliente), una
//      respuesta mal dos veces seguidas agota el ejercicio —se revela el
//      resultado—, sin un 3er intento.
//   B. Con 4 intentos configurados —MÁS que el "3" que daba el motor antes—,
//      se ofrecen los 4 de verdad.
//
//   node qa/hito3-intentos-avatar.mjs
//   BASE_URL=http://localhost:3000 CHROME=/ruta/a/chrome.exe node qa/hito3-intentos-avatar.mjs

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

const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? temas?.nodos ?? []).find(
  (t) => t.motor === "ARITMETICA" || t.clave === "aritmetica",
);
check("se encuentra el nodo de Aritmética sembrado", Boolean(nodoAritmetica?.id));

/** Crea un aula, matricula a un alumno nuevo y le asigna una tarea de 1 ejercicio con el límite de reintentos pedido. */
async function prepararTarea(limiteReintentos, etiqueta) {
  const sufijo = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const rAula = await api("/api/docente/aulas", {
    method: "POST",
    body: JSON.stringify({ nombre: `Intentos ${etiqueta} ${sufijo}`, grado: 1, seccion: "N" }),
  });
  const aula = await rAula.json();
  check(`[${etiqueta}] se crea el aula de prueba`, rAula.status === 201, `HTTP ${rAula.status}`);

  const email = `qa.intentos.${sufijo}@mentoriamath.local`;
  const clave = "Alumno-2026";
  const alta = await registrarAlumno(BASE, { email, password: clave, nombre: `QA Intentos ${etiqueta}` });
  check(`[${etiqueta}] se registra el alumno de prueba`, alta.ok);

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
  check(`[${etiqueta}] el alumno se matricula en el aula`, rUnirse.status === 201, `HTTP ${rUnirse.status}`);

  const ahoraIso = new Date().toISOString();
  const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
  const rTarea = await api("/api/docente/tareas", {
    method: "POST",
    body: JSON.stringify({
      aulaId: aula?.aula?.id,
      titulo: `Intentos ${etiqueta} ${sufijo}`,
      fechaInicio: ahoraIso,
      fechaVencimiento: mananaIso,
      cantidadEjercicios: 1,
      limiteReintentos,
      nodoId: nodoAritmetica?.id ?? null,
    }),
  });
  const tarea = await rTarea.json();
  check(
    `[${etiqueta}] se crea la tarea con límite de reintentos = ${limiteReintentos}`,
    rTarea.status === 201 && Boolean(tarea?.tarea?.id),
    `HTTP ${rTarea.status}`,
  );
  return { tareaId: tarea?.tarea?.id, galleta };
}

// Voz de mentira, con tiempos conocidos: sin esto, un Chrome sin voces
// instaladas no dispara onstart/onend y la lección se queda esperando.
async function inyectarVozDeMentira(contexto) {
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
}

function estadoVisible(pagina) {
  return pagina.evaluate(() => {
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
    const boton = (patron) => [...document.querySelectorAll("button")].some((b) => patron.test(b.textContent ?? ""));
    return {
      hayInput: Boolean(input),
      preguntaLatex,
      tareaCompletada: /Tarea completada/.test(texto),
      nota: (texto.match(/Nota:\s*(\d+)\s*\/\s*100/) || [])[1] ?? null,
      // "Inténtalo otra vez"/"Prueba una vez más" son del 1er y 2º+ reintento;
      // "No te preocupes" es el cierre con el resultado revelado —agotados
      // los intentos—.
      pidiendoReintento: /Inténtalo otra vez|Prueba una vez más/.test(texto),
      seAgotaronLosIntentos: /No te preocupes, así se aprende/.test(texto),
      narrando: boton(/^Pausa$/),
    };
  });
}

async function esperar(pagina, cond, ms, cada = 300) {
  const t0 = Date.now();
  let e = await estadoVisible(pagina);
  while (!cond(e) && Date.now() - t0 < ms) {
    await pagina.waitForTimeout(cada);
    e = await estadoVisible(pagina);
  }
  return e;
}

function numerosDe(latex) {
  const e = String(latex ?? "").replace(/\s+/g, "");
  const m = e.match(/^(\d+)([+-])(\d+)$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  const correcta = m[2] === "+" ? a + b : a - b;
  return { correcta: String(correcta), mala: String(correcta + 1000) }; // +1000: nunca coincide con la correcta
}

/** Escribe `valor` en la caja y pulsa Responder. */
async function enviar(pagina, valor) {
  await pagina.locator("input[placeholder*='respuesta' i]").fill(valor);
  await pagina.getByRole("button", { name: /Responder/ }).click();
}

const navegador = await chromium.launch({ executablePath: CHROME, headless: true });

/**
 * Abre la lección de `tareaId`, salta la teoría, responde MAL
 * `fallosSeguidos` veces y comprueba qué pasa en la última.
 */
async function probar(etiqueta, limiteReintentos, fallosSeguidos, { ultimaDebeAgotar }) {
  const { tareaId, galleta } = await prepararTarea(limiteReintentos, etiqueta);
  if (!tareaId) return;

  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1400 } });
  await contexto.addCookies(
    galleta.split(";").map((par) => {
      const [nombre, ...resto] = par.trim().split("=");
      return { name: nombre, value: resto.join("="), url: BASE };
    }),
  );
  await inyectarVozDeMentira(contexto);
  const pagina = await contexto.newPage();
  const erroresConsola = [];
  pagina.on("pageerror", (e) => erroresConsola.push(String(e)));

  await pagina.goto(`${BASE}/estudiante/leccion?tareaId=${tareaId}`, { waitUntil: "networkidle" });

  // Salta la teoría en cuanto el botón aparezca, para ir directo a la pregunta.
  const btnSaltar = pagina.getByRole("button", { name: /Saltar a la práctica/ });
  await btnSaltar.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
  if (await btnSaltar.isVisible().catch(() => false)) await btnSaltar.click();

  let estado = await esperar(pagina, (e) => e.hayInput && e.preguntaLatex, 45_000);
  const numeros = numerosDe(estado.preguntaLatex);
  check(`[${etiqueta}] se reconoce un ejercicio de aritmética simple`, Boolean(numeros), `preguntaLatex="${estado.preguntaLatex}"`);
  if (!numeros) {
    await contexto.close();
    return;
  }

  for (let i = 1; i <= fallosSeguidos; i++) {
    await esperar(pagina, (e) => !e.narrando, 20_000);
    await enviar(pagina, numeros.mala);
    const esLaUltima = i === fallosSeguidos;
    if (esLaUltima && ultimaDebeAgotar) {
      estado = await esperar(pagina, (e) => e.seAgotaronLosIntentos || e.tareaCompletada, 20_000);
      check(
        `[${etiqueta}] al fallo nº${i} (de ${limiteReintentos} intentos configurados) se agota el ejercicio y se revela el resultado`,
        estado.seAgotaronLosIntentos || estado.tareaCompletada,
        JSON.stringify(estado),
      );
    } else {
      estado = await esperar(pagina, (e) => e.pidiendoReintento, 20_000);
      check(
        `[${etiqueta}] al fallo nº${i} (de ${limiteReintentos} intentos configurados) se ofrece otro intento`,
        estado.pidiendoReintento,
        JSON.stringify(estado),
      );
      check(
        `[${etiqueta}] …y la caja de respuesta se reabre para ese intento`,
        (await esperar(pagina, (e) => e.hayInput, 20_000)).hayInput,
      );
    }
  }

  if (!ultimaDebeAgotar) {
    // Se agota el último intento permitido a propósito, para confirmar que
    // DESPUÉS de los `fallosSeguidos` ya probados no hay un intento extra.
    await esperar(pagina, (e) => !e.narrando, 20_000);
    await enviar(pagina, numeros.mala);
    estado = await esperar(pagina, (e) => e.seAgotaronLosIntentos || e.tareaCompletada, 20_000);
    check(
      `[${etiqueta}] y en el intento nº${fallosSeguidos + 1} (el último de los ${limiteReintentos} configurados) sí se agota`,
      estado.seAgotaronLosIntentos || estado.tareaCompletada,
      JSON.stringify(estado),
    );
  }

  check(`[${etiqueta}] la consola del navegador no soltó ningún error`, erroresConsola.length === 0, erroresConsola.join(" | "));
  await contexto.close();
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" HITO 3 — el avatar se ciñe al número de intentos configurado");
console.log("═══════════════════════════════════════════════════════════\n");

console.log("── A. El ejemplo exacto del cliente: 2 intentos configurados, sólo 2 ──");
await probar("2-intentos", 2, 2, { ultimaDebeAgotar: true });

console.log("\n── B. Más que el '3' fijo de antes: 4 intentos configurados, los 4 ──");
await probar("4-intentos", 4, 3, { ultimaDebeAgotar: false });

await navegador.close();
salir();
