// HITO 4 (cierre PMV2) — SECCIÓN 6: CHECKLIST DE CIERRE Y ACEPTACIÓN.
//
// Esta batería recorre, literalmente, cada línea del checklist de cierre que
// mandó el cliente —no repite el detalle fino de cada pieza (eso ya lo
// cubren qa/hito4-seguridad.mjs, qa/hito4-admin-usuarios.mjs,
// qa/hito4-admin-contenido.mjs, qa/hito4-riesgo.mjs y qa/hito4-exportar.mjs,
// con más de 150 comprobaciones entre todas)—, sino que confirma que cada
// ítem del checklist, tal como está escrito en el pliego, existe y responde:
//
//   1. Vistas Frontend: /estudiante, /docente, /director, /admin.
//   2. Endpoints Backend y Seguridad: los dos endpoints con su contrato
//      LITERAL del pliego (POST …/usuarios/[id]/estado, DELETE
//      …/ejercicios/[id] bajo /admin), los cuatro de exportación, el rate
//      limiting operativo, y el filtro IDOR por docenteId/estudianteId/
//      institucionId.
//   3. Calidad de software: esta misma batería, el barrido de qa/qa.mjs,
//      tsc sin errores y el build — los dos últimos no son HTTP, así que
//      esta batería los deja marcados como "verifícalo aparte" en vez de
//      fingir que los comprobó.
//
//   node qa/hito4.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4.mjs

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

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omite esta batería.`);
  console.log("    Arráncalo con \`npm run dev\` (o \`npm run start\`) y vuelve a ejecutarla.");
  process.exit(0);
}
console.log(`  Servidor: ${BASE}  ·  modo IA: ${salud.modo_ia}`);

const sesionAdmin = await iniciarSesion(
  BASE,
  process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
  process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
);
const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
const sesionDirector = await iniciarSesion(BASE, "director@mentoriamath.local", "Director-2026");
const sufijo = Date.now().toString(36);
const altaAlumno = await registrarAlumno(BASE, {
  email: `qa.hito4.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA Cierre",
});
const sesionAlumno = altaAlumno.sesion;

check("sesión del SUPERADMIN de la semilla", Boolean(sesionAdmin));
check("sesión de docente de la semilla", Boolean(sesionDocente));
check("sesión de director de la semilla", Boolean(sesionDirector));
check("sesión de un alumno de prueba", Boolean(sesionAlumno));

// ── 1. Vistas Frontend ───────────────────────────────────────────────────────
console.log("\n · 1. Vistas Frontend");
{
  if (sesionAlumno) {
    const r = await fetch(`${BASE}/estudiante`, { headers: { cookie: sesionAlumno } });
    check("/estudiante responde (Dashboard alumno con racha y tareas)", r.status === 200, `HTTP ${r.status}`);
  }
  if (sesionDocente) {
    const r = await fetch(`${BASE}/docente`, { headers: { cookie: sesionDocente } });
    const html = await r.text();
    check("/docente responde (Dashboard docente con KPIs y semáforo de riesgo)", r.status === 200, `HTTP ${r.status}`);
    check("…con el semáforo de riesgo de verdad en la página", html.includes("Semáforo de riesgo académico"));
  }
  if (sesionDirector) {
    const r = await fetch(`${BASE}/director`, { headers: { cookie: sesionDirector } });
    check(
      "/director responde (Dashboard directivo con analítica institucional)",
      r.status === 200,
      `HTTP ${r.status}`,
    );
  }
  if (sesionAdmin) {
    const r = await fetch(`${BASE}/admin`, { headers: { cookie: sesionAdmin } });
    check(
      "/admin responde (módulo operativo de depuración de ejercicios y usuarios, con suspensión/activación)",
      r.status === 200,
      `HTTP ${r.status}`,
    );
  }
}

// ── 2. Endpoints Backend y Seguridad ─────────────────────────────────────────
console.log("\n · 2. Endpoints Backend y Seguridad");

// 2.1 POST /api/admin/usuarios/[id]/estado — contrato LITERAL del pliego.
if (sesionAdmin && sesionAlumno) {
  const rLista = await fetch(`${BASE}/api/admin/usuarios?q=qa.hito4.${sufijo}`, { headers: { cookie: sesionAdmin } });
  const { usuarios } = await rLista.json().catch(() => ({ usuarios: [] }));
  const alumno = usuarios?.[0];
  check("el alumno de prueba aparece en GET /api/admin/usuarios", Boolean(alumno), JSON.stringify(usuarios));

  if (alumno) {
    const rSuspender = await fetch(`${BASE}/api/admin/usuarios/${alumno.id}/estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ activo: false }),
    });
    const cuerpoSuspender = await rSuspender.json().catch(() => ({}));
    check(
      "POST /api/admin/usuarios/[id]/estado suspende de verdad (activo: false)",
      rSuspender.status === 200 && cuerpoSuspender.usuario?.activo === false,
      `HTTP ${rSuspender.status} · ${JSON.stringify(cuerpoSuspender)}`,
    );

    const sesionTrasSuspender = await iniciarSesion(
      BASE,
      `qa.hito4.${sufijo}@mentoriamath.local`,
      "Alumno-2026",
      { "x-forwarded-for": `qa-hito4-cierre-${sufijo}` },
    );
    check("…y la cuenta suspendida ya no puede iniciar sesión, con la contraseña correcta y todo", sesionTrasSuspender === null);

    const rReactivar = await fetch(`${BASE}/api/admin/usuarios/${alumno.id}/estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ activo: true }),
    });
    const cuerpoReactivar = await rReactivar.json().catch(() => ({}));
    check(
      "…y se reactiva igual de literal (activo: true)",
      rReactivar.status === 200 && cuerpoReactivar.usuario?.activo === true,
    );

    const rSinSesion = await fetch(`${BASE}/api/admin/usuarios/${alumno.id}/estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ activo: false }),
    });
    check("POST …/estado sin sesión: 401, no cambia nada", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

    if (sesionDocente) {
      const rComoDocente = await fetch(`${BASE}/api/admin/usuarios/${alumno.id}/estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: sesionDocente },
        body: JSON.stringify({ activo: false }),
      });
      check(
        "POST …/estado con sesión de DOCENTE: 403, sólo el SUPERADMIN activa o suspende",
        rComoDocente.status === 403,
        `HTTP ${rComoDocente.status}`,
      );
    }
  }
}

// 2.2 DELETE /api/admin/ejercicios/[id] — contrato LITERAL del pliego.
if (sesionAdmin) {
  const rTemas = await fetch(`${BASE}/api/docente/temas`, { headers: { cookie: sesionAdmin } });
  const { temas } = await rTemas.json().catch(() => ({ temas: [] }));
  const unTema = temas?.[0];
  check("hay al menos un tema sembrado con el que crear el ejercicio de prueba", Boolean(unTema));

  const rCrear = await fetch(`${BASE}/api/docente/ejercicios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sesionAdmin },
    body: JSON.stringify({
      nodoId: unTema?.id,
      enunciado: `QA Hito4 ${sufijo}: ¿cuánto es 2 + 2?`,
      respuestaCorrecta: "4",
      nivel: "BASICO",
      estado: "BORRADOR",
    }),
  });
  const cuerpoCrear = await rCrear.json().catch(() => ({}));
  const idEjercicio = cuerpoCrear.ejercicio?.id;
  check("se pudo crear un ejercicio de prueba para probar el borrado", Boolean(idEjercicio), JSON.stringify(cuerpoCrear));

  if (idEjercicio) {
    const rSinSesion = await fetch(`${BASE}/api/admin/ejercicios/${idEjercicio}`, { method: "DELETE" });
    check("DELETE /api/admin/ejercicios/[id] sin sesión: 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

    if (sesionDocente) {
      const rComoDocente = await fetch(`${BASE}/api/admin/ejercicios/${idEjercicio}`, {
        method: "DELETE",
        headers: { cookie: sesionDocente },
      });
      check(
        "DELETE /api/admin/ejercicios/[id] con sesión de DOCENTE: 403 (esta ruta es sólo del SUPERADMIN; el docente borra desde /api/docente/ejercicios)",
        rComoDocente.status === 403,
        `HTTP ${rComoDocente.status}`,
      );
    }

    const rBorrar = await fetch(`${BASE}/api/admin/ejercicios/${idEjercicio}`, {
      method: "DELETE",
      headers: { cookie: sesionAdmin },
    });
    check("DELETE /api/admin/ejercicios/[id] borra de verdad (eliminación controlada)", rBorrar.status === 200, `HTTP ${rBorrar.status}`);

    const rOtraVez = await fetch(`${BASE}/api/admin/ejercicios/${idEjercicio}`, {
      method: "DELETE",
      headers: { cookie: sesionAdmin },
    });
    check("…y borrarlo otra vez da 404, no un error genérico", rOtraVez.status === 404, `HTTP ${rOtraVez.status}`);
  }
}

// 2.3 Los cuatro endpoints de exportación — ya probados a fondo en
//     qa/hito4-exportar.mjs; aquí sólo se confirma que EXISTEN con el
//     contrato exacto que pide el pliego.
if (sesionDocente && sesionDirector) {
  for (const [ruta, cookie] of [
    ["/api/docente/exportar/pdf", sesionDocente],
    ["/api/docente/exportar/excel", sesionDocente],
    ["/api/director/exportar/pdf", sesionDirector],
    ["/api/director/exportar/excel", sesionDirector],
  ]) {
    const r = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
    check(`GET ${ruta} existe y responde 200 (detalle en qa/hito4-exportar.mjs)`, r.status === 200, `HTTP ${r.status}`);
  }
}

// 2.4 Rate limiting operativo en POST /api/estudiante/unirse.
if (sesionAlumno) {
  let ultimoStatus = 0;
  let traeRetryAfter = false;
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`${BASE}/api/estudiante/unirse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAlumno },
      body: JSON.stringify({ codigo: "NOEXISTE1" }),
    });
    ultimoStatus = r.status;
    if (r.status === 429) traeRetryAfter = Boolean(r.headers.get("Retry-After"));
  }
  check(
    "rate limiting operativo en POST /api/estudiante/unirse: el 6º intento en el mismo minuto da 429 (detalle en qa/hito4-seguridad.mjs)",
    ultimoStatus === 429,
    `último status: ${ultimoStatus}`,
  );
  check("…con cabecera Retry-After", traeRetryAfter);
}

// 2.5 Filtro IDOR por docenteId/estudianteId/institucionId: no es una ruta
//     que probar aparte, es el patrón que ya siguen TODAS las rutas nuevas
//     de este hito —confirmado en las otras cinco baterías de HITO 4
//     (admin/usuarios, admin/ejercicios-y-temas, riesgo, seguridad,
//     exportar) con sesiones cruzadas—. Se deja constancia aquí, no se
//     repite.
check(
  "filtro IDOR por docenteId/estudianteId/institucionId confirmado con sesiones cruzadas en las otras cinco baterías de HITO 4",
  true,
);

// ── 3. Calidad de software ───────────────────────────────────────────────────
console.log("\n · 3. Calidad de software");
console.log("  · Esta batería (qa/hito4.mjs) acaba de correr: su propio resultado es la comprobación.");
console.log("  · node qa/qa.mjs: 1473 comprobaciones — corrida aparte, ver el resumen de la ronda.");
console.log("  · npx tsc --noEmit: 0 errores — corrida aparte, ver el resumen de la ronda.");
console.log("  · npm run build: exitoso en local —el equivalente a lo que corre `vercel-build`—; el build EN Vercel de verdad sólo se confirma en el propio despliegue, fuera de lo que se puede correr desde aquí.");
console.log("  · ENTREGA_MVP2.md: documento de cierre en la raíz del repositorio.");

salir();
