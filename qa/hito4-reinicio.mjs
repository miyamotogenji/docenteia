// HITO 4 (cierre PMV2) — "Entorno de pruebas limpio": GET
// /api/admin/actividad-alumnos/exportar (respaldo de sólo lectura) y POST
// /api/admin/actividad-alumnos/reiniciar (borra matrículas, entregas de
// tarea, intentos de diagnóstico y progreso del alumno; no toca cuentas,
// aulas, tareas ni currículo — ver el porqué en lib/admin/reinicio.ts).
//
// ADVERTENCIA — la parte C de esta batería BORRA DE VERDAD toda la actividad
// de alumno de la base de datos contra la que corre. Por eso sólo se ejecuta
// cuando BASE_URL es localhost: contra cualquier otro destino (producción
// incluida) se omite automáticamente, igual que el bloqueo de login por
// fuerza bruta de qa/hito4-seguridad.mjs nunca se corre contra el sitio
// real. La parte A (control de acceso) no borra nada y sí se puede correr
// contra cualquier entorno.
//
//   node qa/hito4-reinicio.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-reinicio.mjs

import { BASE_URL as BASE, exigirServidor } from "./base-url.mjs";
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
  console.log("═══════════════════════════════════════════════════════════\n");
  if (fallos.length > 0) {
    console.log("Fallos:");
    fallos.forEach((f) => console.log(`  · ${f}`));
    process.exit(1);
  }
  process.exit(0);
}

await exigirServidor();

const sesionAdmin = await iniciarSesion(BASE, "admin@mentoriamath.local", "Admin-2026");
const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
check("sesión de SUPERADMIN de la semilla", Boolean(sesionAdmin));

// ── A. Control de acceso (no muta nada; se corre contra cualquier entorno) ──
{
  const rSinSesion = await fetch(`${BASE}/api/admin/actividad-alumnos/exportar`);
  check("GET exportar sin sesión: 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

  if (sesionDocente) {
    const rDocente = await fetch(`${BASE}/api/admin/actividad-alumnos/exportar`, {
      headers: { cookie: sesionDocente },
    });
    check(
      "GET exportar con sesión de DOCENTE: 403 (sólo el SUPERADMIN ve el respaldo)",
      rDocente.status === 403,
      `HTTP ${rDocente.status}`,
    );
  }

  if (sesionAdmin) {
    const rAdmin = await fetch(`${BASE}/api/admin/actividad-alumnos/exportar`, {
      headers: { cookie: sesionAdmin },
    });
    const cuerpoAdmin = await rAdmin.json().catch(() => ({}));
    check("GET exportar con sesión de SUPERADMIN: 200", rAdmin.status === 200, `HTTP ${rAdmin.status}`);
    check("…y trae un objeto `conteos` con las nueve tablas", Boolean(cuerpoAdmin.conteos) && Object.keys(cuerpoAdmin.conteos).length === 9);
  }

  const rReiniciarSinSesion = await fetch(`${BASE}/api/admin/actividad-alumnos/reiniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmar: "REINICIAR" }),
  });
  check(
    "POST reiniciar sin sesión: 401, no borra nada",
    rReiniciarSinSesion.status === 401,
    `HTTP ${rReiniciarSinSesion.status}`,
  );

  if (sesionDocente) {
    const rReiniciarDocente = await fetch(`${BASE}/api/admin/actividad-alumnos/reiniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionDocente },
      body: JSON.stringify({ confirmar: "REINICIAR" }),
    });
    check(
      "POST reiniciar con sesión de DOCENTE: 403, no borra nada (sólo el SUPERADMIN puede)",
      rReiniciarDocente.status === 403,
      `HTTP ${rReiniciarDocente.status}`,
    );
  }

  if (sesionAdmin) {
    const rSinConfirmar = await fetch(`${BASE}/api/admin/actividad-alumnos/reiniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({}),
    });
    check(
      "POST reiniciar como SUPERADMIN pero SIN {confirmar:\"REINICIAR\"}: 400, no borra nada",
      rSinConfirmar.status === 400,
      `HTTP ${rSinConfirmar.status}`,
    );

    const rConfirmarMal = await fetch(`${BASE}/api/admin/actividad-alumnos/reiniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ confirmar: "si" }),
    });
    check(
      "…ni con un \"confirmar\" que no sea la palabra exacta: 400",
      rConfirmarMal.status === 400,
      `HTTP ${rConfirmarMal.status}`,
    );
  }
}

// ── B. Deja constancia de por qué la parte C se omite fuera de localhost ────
if (!BASE.startsWith("http://localhost")) {
  console.log(
    "\n  · Se omite la parte C (borrado real de actividad): BASE_URL no es localhost. " +
      "Esta batería NUNCA debe correrse con BASE_URL apuntando a producción — " +
      "reiniciar es irreversible y ahí no hay otra base de datos a la que apuntar.\n",
  );
  salir();
}

// ── C. El borrado real, SÓLO contra localhost ────────────────────────────────
{
  // Fixture: un alumno nuevo se matricula en el aula de la semilla —genera
  // una Matricula real que, si el reinicio funciona, debe desaparecer—.
  const sufijo = Date.now();
  const alta = await registrarAlumno(BASE, {
    nombre: `QA Reinicio ${sufijo}`,
    email: `qa.reinicio.${sufijo}@mentoriamath.local`,
    password: "QaReinicio-2026",
    ciclo: "Secundaria",
    grado: "3º",
  });
  check("se pudo registrar un alumno de prueba para el fixture", alta.ok, `HTTP ${alta.estado}`);

  let aulaId = null;
  if (sesionDocente) {
    const rAulas = await fetch(`${BASE}/api/docente/aulas`, { headers: { cookie: sesionDocente } });
    const { aulas } = await rAulas.json().catch(() => ({ aulas: [] }));
    aulaId = aulas?.[0]?.id ?? null;
  }
  check("hay al menos un aula sembrada con la que armar el fixture", Boolean(aulaId));

  if (alta.sesion && aulaId) {
    const rCodigo = await fetch(`${BASE}/api/docente/aulas/${aulaId}`, { headers: { cookie: sesionDocente } });
    const { aula } = await rCodigo.json().catch(() => ({}));
    const rUnirse = await fetch(`${BASE}/api/estudiante/unirse`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: alta.sesion },
      body: JSON.stringify({ codigoAcceso: aula?.codigoAcceso }),
    });
    check("el alumno de prueba se matriculó (fixture de Matricula)", rUnirse.status === 201, `HTTP ${rUnirse.status}`);
  }

  // Conteo ANTES: se apoya en lo que ya exista en la base local (meses de
  // pruebas manuales acumuladas), más el fixture recién creado — no hace
  // falta que cada tabla tenga datos nuevos, basta con que el conjunto no
  // esté todo en cero, o esta comprobación no probaría nada.
  const rAntes = await fetch(`${BASE}/api/admin/actividad-alumnos/exportar`, { headers: { cookie: sesionAdmin } });
  const { conteos: antes } = await rAntes.json();
  const totalAntes = Object.values(antes).reduce((a, b) => a + b, 0);
  check("hay actividad real que reiniciar antes de probar (si no, esta batería no prueba nada)", totalAntes > 0, JSON.stringify(antes));

  const rReiniciar = await fetch(`${BASE}/api/admin/actividad-alumnos/reiniciar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sesionAdmin },
    body: JSON.stringify({ confirmar: "REINICIAR" }),
  });
  const cuerpoReiniciar = await rReiniciar.json().catch(() => ({}));
  check("POST reiniciar como SUPERADMIN con confirmación: 200", rReiniciar.status === 200, `HTTP ${rReiniciar.status}`);
  check("…y borrados.matriculas incluye al menos el fixture", (cuerpoReiniciar.borrados?.matriculas ?? 0) >= 1, JSON.stringify(cuerpoReiniciar.borrados));

  const rDespues = await fetch(`${BASE}/api/admin/actividad-alumnos/exportar`, { headers: { cookie: sesionAdmin } });
  const { conteos: despues } = await rDespues.json();
  const totalDespues = Object.values(despues).reduce((a, b) => a + b, 0);
  check("…y tras reiniciar, las nueve tablas quedan en CERO", totalDespues === 0, JSON.stringify(despues));

  // Lo que NO debía tocar: la cuenta del alumno de prueba sigue existiendo y
  // puede iniciar sesión con normalidad (reiniciar no borra Usuario).
  const sesionTrasReiniciar = await iniciarSesion(
    BASE,
    `qa.reinicio.${sufijo}@mentoriamath.local`,
    "QaReinicio-2026",
  );
  check("la cuenta del alumno de prueba sigue existiendo tras el reinicio", Boolean(sesionTrasReiniciar));

  if (sesionDocente && aulaId) {
    const rAulaTrasReiniciar = await fetch(`${BASE}/api/docente/aulas/${aulaId}`, { headers: { cookie: sesionDocente } });
    check("…y el aula de la semilla sigue existiendo (reiniciar no borra Aula)", rAulaTrasReiniciar.status === 200, `HTTP ${rAulaTrasReiniciar.status}`);
  }
}

salir();
