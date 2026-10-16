// HITO 4 (cierre PMV2) — SECCIÓN A: SEGURIDAD TRANSVERSAL.
//
// «El backend debe implementar un modelo de seguridad con enfoque Zero-Trust
// a nivel de API y Base de Datos… Protección contra Ataques de Fuerza Bruta
// (Rate Limiting)… POST /api/estudiante/unirse: Máximo 5 intentos por minuto
// por IP/Usuario… POST /api/auth/[…nextauth] / Login: Máximo 5 intentos
// fallidos consecutivos por IP antes de aplicar un bloqueo temporal de 15
// minutos.»
//
// Cubre, en este orden:
//
//   A. `lib/seguridad/limite-tasa.ts`, puro, con relojes de mentira: la
//      ventana deslizante de `permiteIntento` y el bloqueo por fallos
//      seguidos de `bloqueoDeLogin`/`registrarFalloDeLogin`.
//   B. `ipDeLaPeticion`: de qué cabecera sale la IP, y el valor de reserva.
//
// Y, si hay un servidor levantado con la base de datos sembrada, C: el tope
// de verdad por HTTP —`POST /api/estudiante/unirse` se corta en el 6º
// intento del mismo alumno en el mismo minuto, y el login se bloquea tras 5
// contraseñas mal seguidas desde la misma IP, incluso para la contraseña
// correcta mientras dure el bloqueo—.
//
//   node qa/hito4-seguridad.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-seguridad.mjs

import {
  bloqueoDeLogin,
  ipDeLaPeticion,
  permiteIntento,
  registrarExitoDeLogin,
  registrarFalloDeLogin,
  reiniciarLimitesParaPruebas,
} from "../lib/seguridad/limite-tasa.ts";
import { BASE_URL as BASE } from "./base-url.mjs";
import { iniciarSesion, registrarAlumno } from "./sesion.mjs";

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

console.log("\n · A. permiteIntento: la ventana deslizante");
{
  reiniciarLimitesParaPruebas();
  const t0 = 1_000_000;
  for (let i = 1; i <= 5; i++) {
    const r = permiteIntento("clave-a", 5, 60_000, t0 + i);
    check(`intento ${i} de 5 se permite`, r.permitido === true, JSON.stringify(r));
  }
  const sexto = permiteIntento("clave-a", 5, 60_000, t0 + 6);
  check("el 6º, dentro de la misma ventana, se rechaza", sexto.permitido === false, JSON.stringify(sexto));
  check(
    "…y dice cuánto falta para poder reintentar (en vez de 0 o un valor negativo)",
    sexto.reintentarEnMs > 0 && sexto.reintentarEnMs <= 60_000,
    String(sexto.reintentarEnMs),
  );

  const trasLaVentana = permiteIntento("clave-a", 5, 60_000, t0 + 61_000);
  check("pasada la ventana entera, se vuelve a permitir", trasLaVentana.permitido === true);

  const otraClave = permiteIntento("clave-b", 5, 60_000, t0 + 1);
  check("otra clave no comparte cupo con la primera", otraClave.permitido === true);
}

console.log("\n · B. bloqueoDeLogin: no es una ventana, son fallos SEGUIDOS");
{
  reiniciarLimitesParaPruebas();
  const t0 = 2_000_000;
  check("sin ningún fallo todavía, no hay bloqueo", bloqueoDeLogin("ip-1", t0).permitido === true);

  for (let i = 1; i <= 4; i++) {
    registrarFalloDeLogin("ip-1", 5, 15 * 60_000, t0 + i);
  }
  check("con 4 fallos (de 5), todavía no se bloquea", bloqueoDeLogin("ip-1", t0 + 5).permitido === true);

  registrarFalloDeLogin("ip-1", 5, 15 * 60_000, t0 + 5); // el 5º
  const bloqueado = bloqueoDeLogin("ip-1", t0 + 6);
  check("al 5º fallo seguido, se bloquea", bloqueado.permitido === false);
  check(
    "…por ~15 minutos, no un número arbitrario",
    bloqueado.reintentarEnMs > 14 * 60_000 && bloqueado.reintentarEnMs <= 15 * 60_000,
    String(bloqueado.reintentarEnMs),
  );

  const antesDeCumplirse = bloqueoDeLogin("ip-1", t0 + 6 + 10 * 60_000);
  check("…sigue bloqueado a los 10 minutos", antesDeCumplirse.permitido === false);
  const trasCumplirse = bloqueoDeLogin("ip-1", t0 + 6 + 15 * 60_000 + 1);
  check("…y se libera pasados los 15 minutos", trasCumplirse.permitido === true);

  // Un acierto intercalado reinicia la cuenta: no es "5 fallos alguna vez",
  // es "5 SEGUIDOS".
  reiniciarLimitesParaPruebas();
  registrarFalloDeLogin("ip-2", 5, 15 * 60_000, t0 + 1);
  registrarFalloDeLogin("ip-2", 5, 15 * 60_000, t0 + 2);
  registrarExitoDeLogin("ip-2");
  registrarFalloDeLogin("ip-2", 5, 15 * 60_000, t0 + 3);
  registrarFalloDeLogin("ip-2", 5, 15 * 60_000, t0 + 4);
  check(
    "un acierto intercalado reinicia la cuenta de fallos seguidos",
    bloqueoDeLogin("ip-2", t0 + 5).permitido === true,
  );
}

console.log("\n · C. ipDeLaPeticion");
{
  const conXff = new Request("http://localhost/x", { headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1" } });
  check("toma el PRIMERO de x-forwarded-for (el cliente, no el proxy)", ipDeLaPeticion(conXff) === "203.0.113.9");

  const conXri = new Request("http://localhost/x", { headers: { "x-real-ip": "203.0.113.9" } });
  check("sin x-forwarded-for, cae a x-real-ip", ipDeLaPeticion(conXri) === "203.0.113.9");

  const sinNada = new Request("http://localhost/x");
  check("sin ningún cabecero, un valor de reserva fijo (no null ni vacío)", ipDeLaPeticion(sinNada) === "desconocida");
}

// ── D. Por HTTP, contra un servidor de verdad ───────────────────────────────
const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omiten las comprobaciones D por HTTP.`);
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutar esta batería.");
} else {
  console.log(`  Servidor: ${BASE}  ·  modo IA: ${salud.modo_ia}`);
  console.log("\n · D. El tope de verdad, por HTTP");

  // POST /api/estudiante/unirse: 5 por minuto, por ALUMNO en sesión.
  const sufijo = Date.now().toString(36);
  const email = `qa.ratelimit.${sufijo}@mentoriamath.local`;
  const clave = "Alumno-2026";
  const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA RateLimit" });
  check("se registra el alumno de prueba", alta.ok);

  const apiAlumno = (ruta, opciones = {}) =>
    fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: alta.sesion, ...(opciones.headers || {}) } });

  let ultimoStatus = null;
  for (let i = 1; i <= 6; i++) {
    const r = await apiAlumno("/api/estudiante/unirse", {
      method: "POST",
      body: JSON.stringify({ codigoAcceso: "NOEXISTE1" }), // 9 cifras: pasa el esquema (4-12), no existe en la base
    });
    ultimoStatus = r.status;
    if (i <= 5) {
      check(`intento ${i} de 6 NO se rechaza por límite de tasa (da 404, el código no existe)`, r.status === 404, `HTTP ${r.status}`);
    } else {
      check("el 6º intento en el mismo minuto se corta con 429, antes de mirar el código", r.status === 429, `HTTP ${r.status}`);
      check("…con Retry-After, para que un cliente de verdad sepa cuánto esperar", r.headers.get("retry-after") != null);
    }
  }

  // Login: 5 fallos seguidos desde la MISMA IP (de mentira, única para esta
  // prueba —no colisiona con otras baterías ni con la IP real de quien la
  // corre—) bloquean incluso la contraseña CORRECTA.
  const ipDePrueba = `198.51.100.${1 + (Date.now() % 250)}`;
  const emailLogin = `qa.loginlock.${sufijo}@mentoriamath.local`;
  const claveLogin = "Alumno-2026";
  const altaLogin = await registrarAlumno(BASE, { email: emailLogin, password: claveLogin, nombre: "QA LoginLock" });
  check("se registra un segundo alumno, para probar el bloqueo de login", altaLogin.ok);

  const intentarLogin = (correo, contrasena) =>
    iniciarSesion(BASE, correo, contrasena, { "x-forwarded-for": ipDePrueba });

  for (let i = 1; i <= 5; i++) {
    const sesionMala = await intentarLogin(emailLogin, "una-contraseña-mala");
    if (i < 5) {
      check(`fallo de login ${i} de 5: no bloquea todavía`, sesionMala === null);
    }
  }
  const conLaBuenaTrasBloquear = await intentarLogin(emailLogin, claveLogin);
  check(
    "tras 5 fallos seguidos desde la misma IP, NI LA CONTRASEÑA CORRECTA entra (bloqueo activo)",
    conLaBuenaTrasBloquear === null,
  );

  // Y, de paso: una IP distinta —otro alumno real, sin nada que ver— no sufre
  // el bloqueo de ésta.
  //
  // Contra localhost, el `x-forwarded-for` que manda esta prueba llega tal
  // cual al servidor —no hay ningún proxy de por medio que lo toque—, así
  // que de verdad se puede simular "otra IP" con sólo mandar un cabecero
  // distinto. Contra un despliegue de verdad (Vercel), el edge NO deja pasar
  // un `x-forwarded-for` inventado por el cliente —lo sustituye por la IP
  // real de quien conecta, que es justo lo que hace que este control sirva
  // de algo—, así que todas las peticiones de ESTA MISMA máquina, con
  // cualquier cabecero que se mande, comparten la MISMA IP real a ojos del
  // servidor. Ahí, "otra IP" no se puede simular desde un único equipo de
  // pruebas: hace falta una red distinta, que una batería automática no
  // tiene. Se comprueba entonces lo que SÍ se puede probar desde aquí —que
  // el bloqueo expira pasados los 15 minutos (sección A, con reloj de
  // mentira)— y se deja constancia de por qué este paso se omite en vez de
  // fingir que pasó.
  if (BASE.startsWith("http://localhost")) {
    const otroAlumno = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
    check(
      "…pero otra IP, con una cuenta de verdad, entra con normalidad (el bloqueo es POR IP, no global)",
      otroAlumno != null,
    );
  } else {
    console.log(
      "  · se omite \"otra IP entra con normalidad\": contra un despliegue de verdad, el edge sustituye cualquier x-forwarded-for inventado por la IP real de quien prueba, así que todas las peticiones de esta máquina CAEN EN LA MISMA IP real —no hay forma de simular una segunda IP sin una red distinta—. La sección A ya prueba, con relojes de mentira, que el bloqueo es por clave (por IP) y que expira a los 15 minutos.",
    );
  }
}

salir();
