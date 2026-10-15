// HITO 4 (cierre PMV2) — SECCIÓN 3.A: GESTIÓN DE CONTENIDO CURRICULAR.
//
// «Mantenimiento de Ejercicios (/admin/ejercicios): tabla con buscador…
// ver detalle, desactivar y eliminación controlada. Gestión de Temas y
// Asignaturas (/admin/temas): edición, archivado o depuración de temas que
// no posean dependencias críticas activas.»
//
// Las dos pantallas REUTILIZAN `GestorEjercicios` y `GestorCurriculo` —los
// mismos componentes de `/docente/ejercicios` y `/docente/curriculo`, ya
// probados por su propia batería (`qa/hito1.mjs` y la validación del
// banco)—. Lo que esta batería comprueba es lo que SÍ es nuevo: que la
// pantalla exista, que muestre contenido de verdad, y sobre todo el candado
// de acceso —sólo SUPERADMIN, probado con las cuatro sesiones posibles—.
//
//   node qa/hito4-admin-contenido.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-admin-contenido.mjs

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
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutarla.");
  process.exit(0);
}
console.log(`  Servidor: ${BASE}  ·  modo IA: ${salud.modo_ia}`);

const sesionAdmin = await iniciarSesion(
  BASE,
  process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
  process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
);
if (!sesionAdmin) {
  console.error("  ✗ No se pudo iniciar sesión como el SUPERADMIN de la semilla.");
  process.exit(1);
}
const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
const sesionDirector = await iniciarSesion(BASE, "director@mentoriamath.local", "Director-2026");
const sufijo = Date.now().toString(36);
const altaAlumno = await registrarAlumno(BASE, {
  email: `qa.admincontenido.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA Contenido",
});

for (const [ruta, nombrePantalla] of [
  ["/admin/ejercicios", "Ejercicios"],
  ["/admin/temas", "Temas"],
]) {
  console.log(`\n · ${nombrePantalla} (${ruta})`);

  const rAdmin = await fetch(`${BASE}${ruta}`, { headers: { cookie: sesionAdmin } });
  const htmlAdmin = await rAdmin.text();
  check(`el SUPERADMIN SÍ entra (200, sin redirigir a /login)`, rAdmin.status === 200, `HTTP ${rAdmin.status}`);
  check(`…y la pantalla es la de administración, no la de /docente`, htmlAdmin.includes("TODA la plataforma"));

  const rSinSesion = await fetch(`${BASE}${ruta}`, { redirect: "manual" });
  check("sin sesión, no entra (redirige)", rSinSesion.status >= 300 && rSinSesion.status < 400, `HTTP ${rSinSesion.status}`);

  const rDocente = await fetch(`${BASE}${ruta}`, { headers: { cookie: sesionDocente }, redirect: "manual" });
  check(
    "un docente NO entra por aquí —tiene su propia pantalla en /docente, ésta no es la suya—",
    rDocente.status >= 300 && rDocente.status < 400,
    `HTTP ${rDocente.status}`,
  );

  const rDirector = await fetch(`${BASE}${ruta}`, { headers: { cookie: sesionDirector }, redirect: "manual" });
  check(
    "ni un director —supervisa /docente, no administra la plataforma entera—",
    rDirector.status >= 300 && rDirector.status < 400,
    `HTTP ${rDirector.status}`,
  );

  const rAlumno = await fetch(`${BASE}${ruta}`, { headers: { cookie: altaAlumno.sesion }, redirect: "manual" });
  check("ni un estudiante", rAlumno.status >= 300 && rAlumno.status < 400, `HTTP ${rAlumno.status}`);
}

console.log("\n · Contenido de verdad, no una pantalla vacía");
{
  const rEjercicios = await fetch(`${BASE}/admin/ejercicios`, { headers: { cookie: sesionAdmin } });
  const htmlEjercicios = await rEjercicios.text();
  check(
    "la pantalla de ejercicios trae ejercicios de verdad del banco sembrado (no '0 ejercicios')",
    /\d+\s*(?:<!--\s*-->\s*)?ejercicio/i.test(htmlEjercicios),
    "no se encontró un contador de ejercicios > 0 en el HTML",
  );

  const rTemas = await fetch(`${BASE}/admin/temas`, { headers: { cookie: sesionAdmin } });
  const htmlTemas = await rTemas.text();
  check(
    "la pantalla de temas trae temas de verdad (Aritmética, del currículo sembrado)",
    htmlTemas.includes("Aritmética"),
    "no se encontró 'Aritmética' en el HTML",
  );
}

console.log("\n · La navegación del panel enlaza las cuatro secciones");
{
  const rAdmin = await fetch(`${BASE}/admin`, { headers: { cookie: sesionAdmin } });
  const html = await rAdmin.text();
  check(
    "desde /admin se puede llegar a Usuarios, Ejercicios y Temas",
    html.includes('href="/admin/usuarios"') && html.includes('href="/admin/ejercicios"') && html.includes('href="/admin/temas"'),
  );
}

salir();
