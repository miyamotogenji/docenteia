// HITO 4 (cierre PMV2) — "Purga de cuentas de alumno": POST
// /api/admin/estudiantes/purgar borra todas las cuentas ESTUDIANTE excepto
// las que vengan en `conservarEmails` (ver el porqué en lib/admin/purga.ts).
//
// ADVERTENCIA — la parte C de esta batería BORRA DE VERDAD cuentas de alumno
// de la base de datos contra la que corre. Por eso sólo se ejecuta cuando
// BASE_URL es localhost, igual que qa/hito4-reinicio.mjs.
//
//   node qa/hito4-purga.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-purga.mjs

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

// ── A. Control de acceso (no borra nada; se corre contra cualquier entorno) ─
{
  const rSinSesion = await fetch(`${BASE}/api/admin/estudiantes/purgar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmar: "PURGAR", conservarEmails: ["nadie@mentoriamath.local"] }),
  });
  check("POST purgar sin sesión: 401, no borra nada", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

  if (sesionDocente) {
    const rDocente = await fetch(`${BASE}/api/admin/estudiantes/purgar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionDocente },
      body: JSON.stringify({ confirmar: "PURGAR", conservarEmails: ["nadie@mentoriamath.local"] }),
    });
    check(
      "POST purgar con sesión de DOCENTE: 403, no borra nada",
      rDocente.status === 403,
      `HTTP ${rDocente.status}`,
    );
  }

  if (sesionAdmin) {
    const rSinConfirmar = await fetch(`${BASE}/api/admin/estudiantes/purgar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ conservarEmails: ["nadie@mentoriamath.local"] }),
    });
    check(
      "POST purgar como SUPERADMIN pero SIN {confirmar:\"PURGAR\"}: 400",
      rSinConfirmar.status === 400,
      `HTTP ${rSinConfirmar.status}`,
    );

    const rSinConservar = await fetch(`${BASE}/api/admin/estudiantes/purgar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: sesionAdmin },
      body: JSON.stringify({ confirmar: "PURGAR", conservarEmails: [] }),
    });
    check(
      "…ni con conservarEmails vacío (no puede dejar la plataforma sin alumnos): 400",
      rSinConservar.status === 400,
      `HTTP ${rSinConservar.status}`,
    );
  }
}

// ── B. Deja constancia de por qué la parte C se omite fuera de localhost ────
if (!BASE.startsWith("http://localhost")) {
  console.log(
    "\n  · Se omite la parte C (borrado real de cuentas): BASE_URL no es localhost. " +
      "Esta batería NUNCA debe correrse con BASE_URL apuntando a producción.\n",
  );
  salir();
}

// ── C. El borrado real, SÓLO contra localhost ────────────────────────────────
{
  const sufijo = Date.now();
  const aBorrar = await registrarAlumno(BASE, {
    nombre: `QA Purga Borrar ${sufijo}`,
    email: `qa.purga.borrar.${sufijo}@mentoriamath.local`,
    password: "QaPurga-2026",
    ciclo: "Secundaria",
    grado: "3º",
  });
  check("se pudo registrar el alumno que SÍ debe borrarse", aBorrar.ok, `HTTP ${aBorrar.estado}`);

  const aConservar = await registrarAlumno(BASE, {
    nombre: `QA Purga Conservar ${sufijo}`,
    email: `qa.purga.conservar.${sufijo}@mentoriamath.local`,
    password: "QaPurga-2026",
    ciclo: "Secundaria",
    grado: "3º",
  });
  check("se pudo registrar el alumno que NO debe borrarse", aConservar.ok, `HTTP ${aConservar.estado}`);

  const rPurgar = await fetch(`${BASE}/api/admin/estudiantes/purgar`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sesionAdmin },
    body: JSON.stringify({
      confirmar: "PURGAR",
      conservarEmails: [`qa.purga.conservar.${sufijo}@mentoriamath.local`],
    }),
  });
  const cuerpoPurgar = await rPurgar.json().catch(() => ({}));
  check("POST purgar como SUPERADMIN con confirmación: 200", rPurgar.status === 200, `HTTP ${rPurgar.status}`);
  check("…y cuentasBorradas incluye al menos la de prueba", (cuerpoPurgar.cuentasBorradas ?? 0) >= 1, JSON.stringify(cuerpoPurgar));

  const sesionBorrado = await iniciarSesion(BASE, `qa.purga.borrar.${sufijo}@mentoriamath.local`, "QaPurga-2026");
  check("la cuenta que debía borrarse ya no puede iniciar sesión", sesionBorrado === null);

  const sesionConservado = await iniciarSesion(BASE, `qa.purga.conservar.${sufijo}@mentoriamath.local`, "QaPurga-2026");
  check("la cuenta que debía conservarse sigue pudiendo iniciar sesión", Boolean(sesionConservado));

  check("el DOCENTE de la semilla sigue pudiendo iniciar sesión (no se tocan otros roles)", Boolean(sesionDocente));
}

salir();
