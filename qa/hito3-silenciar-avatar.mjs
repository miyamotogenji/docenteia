// ¿SE QUEDA LA CAJA DE RESPUESTA SIN MOSTRARSE AL SILENCIAR AL AVATAR?
//
// POR QUÉ EXISTE
// El cliente, con la pantalla delante: "Al hacer clic en el botón de
// silenciar audio, la caja de entrada para ingresar la respuesta del
// ejercicio desaparece o no llega a mostrarse."
//
// La causa real: `TTS._reproducir` (public/tts.js) reproduce la voz
// neuronal en un <audio>, y esperaba a su evento "ended" o "error" para
// resolver su promesa. El botón de silenciar llama a `tts.cancel()`, que
// sólo hace `audio.pause()` —un `pause()` NO dispara "ended" ni "error"—,
// así que esa promesa se quedaba colgada para siempre. El motor pedagógico
// estaba esperando precisamente esa promesa antes de abrir la caja de
// respuesta (`_handleQuestion` → `await this._speak(INVITACION_A_RESPONDER,
// …)` → `this.ui.askAnswer(…)`), así que nunca llegaba a pedirla.
//
// Esta batería reproduce el camino EXACTO: una tarea asignada, el endpoint
// de voz neuronal respondiendo audio de mentira (sin gastar cuota ni
// depender de una clave), y el botón de silenciar pulsado MIENTRAS el
// audio está sonando de verdad —el único instante en el que el defecto se
// notaba—.
//
//   node qa/hito3-silenciar-avatar.mjs
//   BASE_URL=http://localhost:3000 CHROME=/ruta/a/chrome.exe node qa/hito3-silenciar-avatar.mjs

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
  ({ chromium } = require(process.env.PLAYWRIGHT_CORE || "playwright-core"));
} catch (e) {
  console.error(`\n  ✗ Sin playwright-core no se puede comprobar esto: ${String(e.message).split("\n")[0]}\n`);
  process.exit(1);
}
if (!CHROME) {
  console.error("\n  ✗ No se ha encontrado Chrome ni Edge.\n");
  process.exit(1);
}
await exigirServidor();

/**
 * Un WAV de mentira, pero reproducible de verdad —el navegador lo acepta y
 * dispara "playing". Unos segundos de silencio, para que haya ventana de
 * sobra entre que empieza a sonar y que termina sola: el clic en "silenciar"
 * tiene que llegar MIENTRAS suena, no después.
 */
function silencio(segundos = 4) {
  const muestras = Math.round(44100 * segundos);
  const datos = Buffer.alloc(muestras * 2);
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + datos.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(44100, 24);
  h.writeUInt32LE(88200, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(datos.length, 40);
  return Buffer.concat([h, datos]);
}

function instalarVoz() {
  const voz = { name: "QA es-ES", lang: "es-ES", default: true, localService: true };
  window.SpeechSynthesisUtterance = class {
    constructor(t) {
      Object.assign(this, { text: t, lang: "", voice: null, rate: 1, pitch: 1, onstart: null, onend: null, onerror: null });
    }
  };
  const s = {
    speaking: false, paused: false, pending: false,
    getVoices: () => [voz], addEventListener() {}, removeEventListener() {}, onvoiceschanged: null,
    speak(u) {
      s.speaking = true;
      const d = Math.max(500, Math.min(4500, u.text.length * 35));
      u._a = setTimeout(() => u.onstart?.({ charIndex: 0 }), 60);
      u._b = setTimeout(() => { s.speaking = false; u.onend?.({ charIndex: u.text.length }); }, d);
      u._c = () => { clearTimeout(u._a); clearTimeout(u._b); };
      s._u = u;
    },
    cancel() {
      const u = s._u;
      if (u) { u._c?.(); s._u = null; s.speaking = false; u.onend?.({ charIndex: 0 }); }
    },
    pause() {}, resume() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: s, configurable: true });
}

/**
 * Pulsa "silenciar" DESDE DENTRO de la página, en el evento "playing" del
 * `<audio>` que reproduce la frase OBJETIVO —"Ahora te toca a ti…", la
 * invitación a responder que precede a la caja—, no la primera que suene
 * (la teoría, el enunciado del ejercicio… pueden sonar varias antes). Se
 * detecta interceptando el propio `fetch` a /api/voz: el cuerpo de esa
 * petición lleva el texto que se va a pedir, así que se sabe de antemano
 * cuál de los `<audio>` que vengan después es el que importa. Sin ida y
 * vuelta a Node de por medio para el clic: eso ya sería tiempo de sobra
 * para que un WAV corto hubiera terminado solo.
 */
function vigilarYSilenciar() {
  window.__peticionObjetivoVista = false;
  window.__silenciado = false;
  let siguienteAudioEsElObjetivo = false;

  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url ?? "";
    if (init?.method === "POST" && /\/api\/voz/.test(url)) {
      try {
        const cuerpo = JSON.parse(init.body ?? "{}");
        if (typeof cuerpo.texto === "string" && /toca a ti/i.test(cuerpo.texto)) {
          window.__peticionObjetivoVista = true;
          siguienteAudioEsElObjetivo = true;
        }
      } catch {}
    }
    return fetchOriginal(input, init);
  };

  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function (...args) {
    if (siguienteAudioEsElObjetivo) {
      siguienteAudioEsElObjetivo = false;
      this.addEventListener(
        "playing",
        () => {
          if (window.__silenciado) return;
          const boton = document.querySelector('button[aria-label="Silenciar la voz"]');
          if (boton) {
            boton.click();
            window.__silenciado = true;
          }
        },
        { once: true },
      );
    }
    return play.apply(this, args);
  };
}

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
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: sesionDocente, ...(opciones.headers || {}) } });

const sufijo = Date.now().toString(36);
const rAula = await api("/api/docente/aulas", { method: "POST", body: JSON.stringify({ nombre: `Silenciar ${sufijo}`, grado: 1, seccion: "N" }) });
const aula = await rAula.json();
check("se crea el aula de prueba", rAula.status === 201, `HTTP ${rAula.status}`);

const email = `qa.silenciar.${sufijo}@mentoriamath.local`;
const clave = "Alumno-2026";
const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Silenciar" });
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
  body: JSON.stringify({ respuestas: (prueba.preguntas ?? []).map((p) => ({ preguntaId: p.id, respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0" })) }),
});
const galleta = (await iniciarSesion(BASE, email, clave)) ?? alta.sesion;

const apiAlumno = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: galleta, ...(opciones.headers || {}) } });
const rUnirse = await apiAlumno("/api/estudiante/unirse", { method: "POST", body: JSON.stringify({ codigoAcceso: aula?.aula?.codigoAcceso }) });
check("el alumno se matricula en el aula", rUnirse.status === 201, `HTTP ${rUnirse.status}`);

const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? temas?.nodos ?? []).find((t) => t.motor === "ARITMETICA" || t.clave === "aritmetica");

const ahoraIso = new Date().toISOString();
const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
const rTarea = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula?.aula?.id,
    titulo: `Silenciar ${sufijo}`,
    fechaInicio: ahoraIso,
    fechaVencimiento: mananaIso,
    cantidadEjercicios: 1,
    limiteReintentos: 0,
    nodoId: nodoAritmetica?.id ?? null,
  }),
});
const tarea = await rTarea.json();
check("se crea la tarea de 1 ejercicio", rTarea.status === 201 && Boolean(tarea?.tarea?.id), `HTTP ${rTarea.status}`);

const navegador = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
const contexto = await navegador.newContext({ viewport: { width: 1280, height: 1000 } });
await contexto.addCookies(
  galleta.split(";").map((par) => {
    const [nombre, ...resto] = par.trim().split("=");
    return { name: nombre, value: resto.join("="), url: BASE };
  }),
);
await contexto.addInitScript(instalarVoz);
await contexto.addInitScript(vigilarYSilenciar);

// EL PROVEEDOR DE VOZ NEURONAL, DE MENTIRA: responde que SÍ hay voz
// disponible, y un WAV de verdad (reproducible) para cada frase pedida.
let peticionesVoz = 0;
await contexto.route("**/api/voz", async (ruta) => {
  const req = ruta.request();
  if (req.method() === "GET") {
    await ruta.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ disponible: true, proveedor: "google", voz: "es-US-Neural2-B" }) });
    return;
  }
  peticionesVoz++;
  await ruta.fulfill({ status: 200, contentType: "audio/wav", body: silencio(4) });
});

const pagina = await contexto.newPage();
const erroresConsola = [];
pagina.on("pageerror", (e) => erroresConsola.push(String(e)));

await pagina.goto(`${BASE}/estudiante/leccion?tareaId=${tarea.tarea.id}`, { waitUntil: "networkidle" });

// Salta la teoría en cuanto el botón aparezca, para llegar antes a la
// pregunta —y a su "Ahora te toca a ti…", que es la frase que se silencia—.
const btnSaltar = pagina.getByRole("button", { name: /Saltar a la práctica/ });
await btnSaltar.waitFor({ state: "visible", timeout: 20_000 }).catch(() => {});
if (await btnSaltar.isVisible().catch(() => false)) await btnSaltar.click();

// Antes de nada: la caja de respuesta TODAVÍA no tiene por qué existir —si
// ya estuviera ahí, el clic en "silenciar" (que `vigilarYSilenciar` dispara
// en cuanto suena el primer audio) llegaría tarde para probar nada—.
check(
  "antes de silenciar, la caja de respuesta todavía no se muestra (estamos a tiempo de interrumpir)",
  !(await pagina.evaluate(() => [...document.querySelectorAll("input")].some((i) => /respuesta/i.test(i.placeholder ?? "")))),
);

// EL MOMENTO EXACTO DEL DEFECTO: `vigilarYSilenciar` pulsa "silenciar" DESDE
// DENTRO de la página, en el evento "playing" del primer audio neuronal que
// suena de verdad —sin ida y vuelta a Node, que ya sería tiempo de sobra
// para que un WAV corto hubiera terminado solo—.
check(
  "sonó el audio neuronal de verdad, y el clic en 'silenciar' se disparó mientras sonaba",
  await pagina.waitForFunction(() => window.__silenciado === true, null, { timeout: 30_000 }).then(() => true).catch(() => false),
  `peticionesVoz=${peticionesVoz}`,
);

check(
  "al silenciar, el rótulo del botón pasa a 'Activar la voz' (quedó silenciado)",
  await pagina.locator('button[aria-label="Activar la voz"]').isVisible().catch(() => false),
);

// LA COMPROBACIÓN QUE IMPORTA: la caja de respuesta tiene que aparecer, sin
// quedarse colgada esperando a una promesa de audio que un `pause()` nunca
// iba a resolver.
const apareceLaCaja = await pagina
  .waitForFunction(
    () => [...document.querySelectorAll("input")].some((i) => /respuesta/i.test(i.placeholder ?? "")),
    null,
    { timeout: 20_000 },
  )
  .then(() => true)
  .catch(() => false);
check(
  "la caja de respuesta SÍ llega a mostrarse después de silenciar (no se queda colgada)",
  apareceLaCaja,
);

check("la consola del navegador no soltó ningún error", erroresConsola.length === 0, erroresConsola.join(" | "));

await navegador.close();
salir();
