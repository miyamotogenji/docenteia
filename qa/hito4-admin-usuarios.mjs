// HITO 4 (cierre PMV2) — SECCIÓN 3.B: CONTROL DE ACCESOS Y GESTIÓN DE
// USUARIOS.
//
// «Listado completo de usuarios filtrable por rol… Brindar/Restringir
// accesos: Control de activación/suspensión de cuentas… Reasignación de
// roles: Capacidad de promover o cambiar roles… Asignación institucional:
// Vinculación formal de directores y profesores a su respectiva
// Institución.»
//
// Cubre, en este orden:
//
//   A. `rolUsaInstitucion`, puro, sin servidor.
//   B. Por HTTP: el candado de la zona entera —sólo SUPERADMIN entra a
//      /api/admin/*, probado con las CUATRO sesiones (estudiante, docente,
//      director, nadie)—, el listado con sus filtros, y las tres acciones
//      —suspender/activar, reasignar rol, vincular institución— incluida la
//      comprobación de que SUSPENDER DE VERDAD IMPIDE INICIAR SESIÓN (no es
//      sólo un campo que se guarda, es lo que `auth.ts` ya mira), y el
//      candado de "no te modifiques a ti mismo".
//   E. POST /api/admin/usuarios (checklist actualizado): el "Formulario de
//      Docentes" y el "Formulario de Alumnos" —alta directa, independiente
//      de la institución o el aula a la que vayan a parar—.
//
//   node qa/hito4-admin-usuarios.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-admin-usuarios.mjs

import { rolUsaInstitucion } from "../lib/admin/usuarios.ts";
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

console.log("\n · A. rolUsaInstitucion");
check("DOCENTE usa institución", rolUsaInstitucion("DOCENTE") === true);
check("DIRECTOR usa institución", rolUsaInstitucion("DIRECTOR") === true);
check("ESTUDIANTE no usa institución", rolUsaInstitucion("ESTUDIANTE") === false);
check(
  "SUPERADMIN también puede vincularse a una institución (para crear aulas o probar un panel institucional con su propia cuenta)",
  rolUsaInstitucion("SUPERADMIN") === true,
);

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omite la sección B por HTTP.`);
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutar esta batería.");
  salir();
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
const apiAdmin = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: sesionAdmin, ...(opciones.headers || {}) } });

console.log("\n · B. El candado de la zona /api/admin: sólo SUPERADMIN");
{
  const rSinSesion = await fetch(`${BASE}/api/admin/usuarios`);
  check("sin sesión, 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

  const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
  const rDocente = await fetch(`${BASE}/api/admin/usuarios`, { headers: { cookie: sesionDocente } });
  check("un docente no puede listar usuarios", rDocente.status === 403, `HTTP ${rDocente.status}`);

  const sesionDirector = await iniciarSesion(BASE, "director@mentoriamath.local", "Director-2026");
  const rDirector = await fetch(`${BASE}/api/admin/usuarios`, { headers: { cookie: sesionDirector } });
  check(
    "ni siquiera un director —que sí entra a /docente para supervisar— puede listar usuarios",
    rDirector.status === 403,
    `HTTP ${rDirector.status}`,
  );

  const sufijo = Date.now().toString(36);
  const altaAlumno = await registrarAlumno(BASE, {
    email: `qa.admincandado.${sufijo}@mentoriamath.local`,
    password: "Alumno-2026",
    nombre: "QA Candado",
  });
  const rAlumno = await fetch(`${BASE}/api/admin/usuarios`, { headers: { cookie: altaAlumno.sesion } });
  check("un estudiante no puede listar usuarios", rAlumno.status === 403, `HTTP ${rAlumno.status}`);
}

console.log("\n · C. El listado, con sus filtros");
{
  const rTodos = await apiAdmin("/api/admin/usuarios");
  const todos = await rTodos.json().catch(() => ({}));
  check("el SUPERADMIN SÍ puede listar usuarios", rTodos.status === 200, `HTTP ${rTodos.status}`);
  check(
    "…con instituciones para el selector de vinculación",
    Array.isArray(todos?.instituciones) && todos.instituciones.length > 0,
    JSON.stringify(todos?.instituciones),
  );

  const rSoloDocentes = await apiAdmin("/api/admin/usuarios?rol=DOCENTE");
  const soloDocentes = await rSoloDocentes.json().catch(() => ({}));
  check(
    "el filtro por rol se aplica en el servidor",
    (soloDocentes?.usuarios ?? []).length > 0 && soloDocentes.usuarios.every((u) => u.rol === "DOCENTE"),
    JSON.stringify(soloDocentes?.usuarios?.map((u) => u.rol)),
  );

  const rBusqueda = await apiAdmin(`/api/admin/usuarios?q=${encodeURIComponent("docente@mentoriamath.local")}`);
  const busqueda = await rBusqueda.json().catch(() => ({}));
  check(
    "la búsqueda por correo encuentra exactamente esa cuenta",
    (busqueda?.usuarios ?? []).some((u) => u.email === "docente@mentoriamath.local"),
    JSON.stringify(busqueda?.usuarios?.map((u) => u.email)),
  );
}

console.log("\n · D. Suspender/activar, reasignar rol, vincular institución — y que de verdad surtan efecto");
{
  const sufijo = Date.now().toString(36);
  const correo = `qa.adminaccion.${sufijo}@mentoriamath.local`;
  const clave = "Alumno-2026";
  // IP de mentira, propia de esta prueba: un login que falla por estar
  // suspendido TAMBIÉN cuenta como fallo para el bloqueo de fuerza bruta del
  // HITO 4 (corrección QA de esta misma ronda); sin una IP propia, se
  // compartiría cupo con "desconocida" —la que usa cualquier llamada sin
  // `x-forwarded-for`— y podría dejar bloqueadas, sin querer, otras
  // comprobaciones de esta misma batería o de otras que corran después en el
  // mismo proceso del servidor.
  const ipDePrueba = { "x-forwarded-for": `198.51.100.${1 + (Date.now() % 250)}` };
  const alta = await registrarAlumno(BASE, { email: correo, password: clave, nombre: "QA Acción Admin" });
  check("se registra el alumno de prueba", alta.ok);
  check("…y puede iniciar sesión, de entrada", alta.sesion != null);

  const rLista = await apiAdmin(`/api/admin/usuarios?q=${encodeURIComponent(correo)}`);
  const lista = await rLista.json().catch(() => ({}));
  const id = lista?.usuarios?.find((u) => u.email === correo)?.id;
  check("el admin lo encuentra en el listado", Boolean(id), JSON.stringify(lista?.usuarios));

  // SUSPENDER: no es sólo un campo —tiene que impedir el login de verdad.
  const rSuspende = await apiAdmin(`/api/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({ activo: false }) });
  const suspendido = await rSuspende.json().catch(() => ({}));
  check("se suspende la cuenta", rSuspende.status === 200 && suspendido?.usuario?.activo === false, JSON.stringify(suspendido));
  const sesionTrasSuspender = await iniciarSesion(BASE, correo, clave, ipDePrueba);
  check("…y YA NO PUEDE iniciar sesión, con la contraseña correcta y todo", sesionTrasSuspender === null);

  // REACTIVAR: y que vuelva a entrar.
  const rActiva = await apiAdmin(`/api/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({ activo: true }) });
  check("se reactiva la cuenta", rActiva.status === 200, `HTTP ${rActiva.status}`);
  const sesionTrasActivar = await iniciarSesion(BASE, correo, clave, ipDePrueba);
  check("…y vuelve a poder iniciar sesión", sesionTrasActivar != null);

  // REASIGNAR ROL: a DOCENTE, y de paso vincularlo a una institución —sólo
  // tiene sentido para DOCENTE/DIRECTOR—.
  const unaInstitucion = lista?.instituciones?.[0]?.id;
  check("hay al menos una institución sembrada con la que probar la vinculación", Boolean(unaInstitucion));
  const rPromueve = await apiAdmin(`/api/admin/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ rol: "DOCENTE", institucionId: unaInstitucion }),
  });
  const promovido = await rPromueve.json().catch(() => ({}));
  check(
    "se reasigna el rol a DOCENTE y se vincula a la institución, en el mismo PATCH",
    rPromueve.status === 200 && promovido?.usuario?.rol === "DOCENTE" && promovido?.usuario?.institucionId === unaInstitucion,
    JSON.stringify(promovido),
  );

  // Volver a ESTUDIANTE: la institución, que ya no significa nada para ese
  // rol, se limpia sola.
  const rDegrada = await apiAdmin(`/api/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({ rol: "ESTUDIANTE" }) });
  const degradado = await rDegrada.json().catch(() => ({}));
  check(
    "al volver a ESTUDIANTE, la institución se limpia sola (no queda un dato que la app nunca lee)",
    rDegrada.status === 200 && degradado?.usuario?.institucionId === null,
    JSON.stringify(degradado),
  );

  // Pedir vincular institución a un ESTUDIANTE se rechaza —no al revés: el
  // PATCH de arriba que lo LIMPIA automáticamente SÍ se acepta—.
  const rInstitucionAEstudiante = await apiAdmin(`/api/admin/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ institucionId: unaInstitucion }),
  });
  check(
    "…pero pedir EXPLÍCITAMENTE vincular una institución a un estudiante se rechaza con 409",
    rInstitucionAEstudiante.status === 409,
    `HTTP ${rInstitucionAEstudiante.status}`,
  );

  // Un PATCH vacío no tiene nada que hacer.
  const rVacio = await apiAdmin(`/api/admin/usuarios/${id}`, { method: "PATCH", body: JSON.stringify({}) });
  check("un PATCH sin ningún cambio se rechaza con 409, no se queda callado", rVacio.status === 409, `HTTP ${rVacio.status}`);

  // El candado de "no te modifiques a ti mismo": el SUPERADMIN de la semilla
  // no puede suspenderse ni degradarse desde esta misma ruta.
  // Filtrado por rol, no la lista entera: con miles de alumnos de prueba
  // acumulados en una base de QA de verdad, el ÚNICO SUPERADMIN sembrado
  // podía no caber en una página sin filtrar —el defecto real que esta
  // misma ronda encontró y corrigió en la ruta (ver su comentario de
  // `take`)—.
  const rPropioId = await apiAdmin("/api/admin/usuarios?rol=SUPERADMIN");
  const propio = await rPropioId.json().catch(() => ({}));
  const miId = propio?.usuarios?.find((u) => u.email === (process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local"))?.id;
  const rAutomodificacion = await apiAdmin(`/api/admin/usuarios/${miId}`, {
    method: "PATCH",
    body: JSON.stringify({ activo: false }),
  });
  check(
    "el SUPERADMIN no puede suspenderse a sí mismo desde el panel (se quedaría sin forma de deshacerlo)",
    rAutomodificacion.status === 409,
    `HTTP ${rAutomodificacion.status}`,
  );

  const rAutodegradacion = await apiAdmin(`/api/admin/usuarios/${miId}`, {
    method: "PATCH",
    body: JSON.stringify({ rol: "DOCENTE" }),
  });
  check(
    "…ni degradarse el propio rol tampoco",
    rAutodegradacion.status === 409,
    `HTTP ${rAutodegradacion.status}`,
  );

  // Pero SÍ puede vincularse a sí mismo a una institución —no reduce su
  // propio acceso, es justo lo que necesita para poder crear aulas y
  // probar el flujo de docente con su propia cuenta—.
  const unaInstitucionParaMi = lista?.instituciones?.[0]?.id;
  if (miId && unaInstitucionParaMi) {
    const rAutovinculacion = await apiAdmin(`/api/admin/usuarios/${miId}`, {
      method: "PATCH",
      body: JSON.stringify({ institucionId: unaInstitucionParaMi }),
    });
    const autovinculado = await rAutovinculacion.json().catch(() => ({}));
    check(
      "…y SÍ puede vincularse a sí mismo a una institución (no es rol ni activo)",
      rAutovinculacion.status === 200 && autovinculado?.usuario?.institucionId === unaInstitucionParaMi,
      `HTTP ${rAutovinculacion.status} · ${JSON.stringify(autovinculado)}`,
    );

    // Se deja como estaba, para no dejar al SUPERADMIN de la semilla vinculado
    // a un colegio como efecto colateral de esta batería.
    await apiAdmin(`/api/admin/usuarios/${miId}`, {
      method: "PATCH",
      body: JSON.stringify({ institucionId: null }),
    });
  }
}

// ── E. POST /api/admin/usuarios — alta directa de docentes y alumnos ───────
//
// «Formulario de Docentes: Nombre, Correo, Contraseña. Formulario de
// Alumnos: Nombre, Correo, Contraseña, Etapa/Grado.» Antes de esto, un
// DOCENTE sólo podía entrar al sistema por la semilla, o reasignando el rol
// de una cuenta ya existente —no había forma de darlo de alta directo,
// aunque el propio comentario de /api/registro ya lo daba por hecho.
console.log("\n · E. POST /api/admin/usuarios — alta directa de docentes y alumnos");
{
  const sufijo = Date.now().toString(36);

  const rSinSesion = await fetch(`${BASE}/api/admin/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nombre: "x", email: "x@x.com", password: "12345678", rol: "DOCENTE" }),
  });
  check("POST /api/admin/usuarios sin sesión: 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

  const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
  const rComoDocente = await fetch(`${BASE}/api/admin/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: sesionDocente },
    body: JSON.stringify({ nombre: "x", email: "y@y.com", password: "12345678", rol: "DOCENTE" }),
  });
  check("un docente no puede crear otras cuentas", rComoDocente.status === 403, `HTTP ${rComoDocente.status}`);

  // Formulario de Docentes: sólo nombre, correo, contraseña.
  const correoDocente = `qa.altadocente.${sufijo}@mentoriamath.local`;
  const rCrearDocente = await apiAdmin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({ nombre: "QA Alta Docente", email: correoDocente, password: "Docente-2026", rol: "DOCENTE" }),
  });
  const cuerpoDocente = await rCrearDocente.json().catch(() => ({}));
  check(
    "crea un DOCENTE con sólo nombre, correo y contraseña —sin institución, sin aula—",
    rCrearDocente.status === 201 && cuerpoDocente.usuario?.rol === "DOCENTE",
    `HTTP ${rCrearDocente.status} · ${JSON.stringify(cuerpoDocente)}`,
  );

  const sesionDocenteNuevo = await iniciarSesion(BASE, correoDocente, "Docente-2026");
  check("…y esa cuenta puede iniciar sesión de verdad, con la contraseña puesta", Boolean(sesionDocenteNuevo));

  const rCorreoDuplicado = await apiAdmin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({ nombre: "Otro", email: correoDocente, password: "Docente-2026", rol: "DOCENTE" }),
  });
  check("crear OTRA cuenta con el mismo correo: 409, no un 500", rCorreoDuplicado.status === 409, `HTTP ${rCorreoDuplicado.status}`);

  // Formulario de Alumnos: nombre, correo, contraseña, etapa/grado —y
  // también funciona SIN etapa/curso, para cuando el administrador no los
  // sabe de antemano—.
  const correoAlumno = `qa.altaalumno.${sufijo}@mentoriamath.local`;
  const rCrearAlumno = await apiAdmin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({
      nombre: "QA Alta Alumno",
      email: correoAlumno,
      password: "Alumno-2026",
      rol: "ESTUDIANTE",
      etapa: "SECUNDARIA",
      curso: 3,
    }),
  });
  const cuerpoAlumno = await rCrearAlumno.json().catch(() => ({}));
  check(
    "crea un ESTUDIANTE con etapa y curso ya puestos",
    rCrearAlumno.status === 201 && cuerpoAlumno.usuario?.rol === "ESTUDIANTE",
    `HTTP ${rCrearAlumno.status} · ${JSON.stringify(cuerpoAlumno)}`,
  );

  const correoAlumnoSinEtapa = `qa.altaalumnosin.${sufijo}@mentoriamath.local`;
  const rCrearAlumnoSinEtapa = await apiAdmin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({ nombre: "QA Sin Etapa", email: correoAlumnoSinEtapa, password: "Alumno-2026", rol: "ESTUDIANTE" }),
  });
  check(
    "…y también sin etapa ni curso: el administrador puede no saberlos, el alumno los completa después",
    rCrearAlumnoSinEtapa.status === 201,
    `HTTP ${rCrearAlumnoSinEtapa.status}`,
  );

  const rEtapaParaDocente = await apiAdmin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({
      nombre: "x",
      email: `qa.rechazo.${sufijo}@mentoriamath.local`,
      password: "12345678",
      rol: "DOCENTE",
      etapa: "SECUNDARIA",
    }),
  });
  check(
    "mandar etapa para un DOCENTE (no tiene sentido) se rechaza con 400, no se guarda en silencio",
    rEtapaParaDocente.status === 400,
    `HTTP ${rEtapaParaDocente.status}`,
  );

  const rRolNoPermitido = await apiAdmin("/api/admin/usuarios", {
    method: "POST",
    body: JSON.stringify({ nombre: "x", email: `qa.rol.${sufijo}@mentoriamath.local`, password: "12345678", rol: "SUPERADMIN" }),
  });
  check(
    "crear un SUPERADMIN (o DIRECTOR) por aquí no está permitido: sólo DOCENTE y ESTUDIANTE",
    rRolNoPermitido.status === 400,
    `HTTP ${rRolNoPermitido.status}`,
  );
}

salir();
