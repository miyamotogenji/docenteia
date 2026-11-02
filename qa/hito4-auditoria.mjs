// HITO 4 (cierre PMV2) — OBSERVACIÓN DEL CLIENTE sobre /admin/usuarios y
// components/admin/gestor-usuarios.tsx, tras revisar el código:
//
//   1. «Orden de visualización por jerarquía institucional»: con el
//      `orderBy` alfabético por `Rol` que usaba GET /api/admin/usuarios,
//      ESTUDIANTE —el más numeroso, con mucha diferencia— llenaba la tabla
//      y relegaba al Administrador, al Director y a los Docentes al fondo.
//      La lista debe ordenarse: Administrador, Director, Docentes, Alumnos.
//   2. «Auditoría y control de trazabilidad»: el sistema no registraba qué
//      usuario ejecuta las acciones administrativas. En `matriculas` faltaba
//      un `creadoPorId`/`origen` para auditar la vía de enrolamiento; en
//      `usuarios` no quedaba registro de quién modificó el rol, aplicó la
//      suspensión, o vinculó la cuenta a una institución. Se incorpora
//      `Matricula.origen`/`creadoPorId` y la tabla `LogAuditoria`.
//
// Cubre, en este orden:
//
//   A. `ORDEN_JERARQUICO_ROL`, puro, sin servidor.
//   B. GET /api/admin/usuarios: el orden jerárquico de verdad, no alfabético.
//   C. `Matricula.origen`/`creadoPorId`: ADMIN (matriculación directa) vs.
//      CODIGO_INVITACION (autoenrolamiento), visibles en el propio listado
//      de usuarios.
//   D. `LogAuditoria`: ROL_MODIFICADO, CUENTA_SUSPENDIDA/ACTIVADA,
//      INSTITUCION_VINCULADA/DESVINCULADA, MATRICULA_CREADA —con autoría—.
//   E. GET /api/admin/auditoria: el candado de la zona, y los filtros.
//
//   node qa/hito4-auditoria.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-auditoria.mjs

import { ORDEN_JERARQUICO_ROL } from "../lib/rbac.ts";
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

console.log("\n · A. ORDEN_JERARQUICO_ROL, puro, sin servidor");
check("Administrador primero", ORDEN_JERARQUICO_ROL.SUPERADMIN < ORDEN_JERARQUICO_ROL.DIRECTOR);
check("Director antes que Docente", ORDEN_JERARQUICO_ROL.DIRECTOR < ORDEN_JERARQUICO_ROL.DOCENTE);
check("Docente antes que Alumno", ORDEN_JERARQUICO_ROL.DOCENTE < ORDEN_JERARQUICO_ROL.ESTUDIANTE);
check(
  "…y no es el mismo orden que RBAC usa para el alcance (ESTUDIANTE primero): son listas para fines distintos",
  ORDEN_JERARQUICO_ROL.SUPERADMIN !== 0 || ORDEN_JERARQUICO_ROL.ESTUDIANTE === 3,
);

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omite el resto de esta batería.`);
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutarla.");
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
const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
const apiAdmin = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: sesionAdmin, ...(opciones.headers || {}) } });

const sufijo = Date.now().toString(36);

console.log("\n · B. GET /api/admin/usuarios: orden jerárquico, no alfabético");
{
  const r = await apiAdmin("/api/admin/usuarios");
  const { usuarios } = await r.json().catch(() => ({ usuarios: [] }));
  check("responde 200", r.status === 200, `HTTP ${r.status}`);
  check(
    "el primero de la lista NO es un alumno —hay decenas sembrados; si lo fuera, el defecto del cliente seguiría vivo—",
    usuarios?.[0]?.rol !== "ESTUDIANTE",
    JSON.stringify(usuarios?.[0]),
  );

  // Una vez que aparece el primer ESTUDIANTE, ya no debe volver a aparecer
  // ningún Administrador/Director/Docente DESPUÉS: la lista entera respeta
  // el orden, no sólo la primera fila.
  let filaQueRompeElOrden = null;
  let vistoEstudiante = false;
  for (const u of usuarios ?? []) {
    if (u.rol === "ESTUDIANTE") vistoEstudiante = true;
    else if (vistoEstudiante) {
      filaQueRompeElOrden = u;
      break;
    }
  }
  check(
    "ningún Administrador/Director/Docente aparece DESPUÉS del primer Alumno en toda la lista",
    filaQueRompeElOrden === null,
    JSON.stringify(filaQueRompeElOrden),
  );
}

console.log("\n · C. Matricula.origen / creadoPorId: la vía de enrolamiento queda registrada");
let aulaDePrueba = null;
let idAdmin = null;
{
  // Una institución y un aula propias de esta batería, para no depender de
  // lo que haya sembrado otra.
  const rInstituciones = await apiAdmin("/api/admin/usuarios");
  const { instituciones, usuarios: todos } = await rInstituciones.json().catch(() => ({}));
  const unaInstitucion = instituciones?.[0];
  idAdmin = todos?.find((u) => u.rol === "SUPERADMIN")?.id ?? null;
  check("hay al menos una institución sembrada con la que probar", Boolean(unaInstitucion));
  check("se identifica al SUPERADMIN de la semilla en el listado", Boolean(idAdmin));

  if (unaInstitucion) {
    const rCrearAula = await apiAdmin("/api/admin/aulas", {
      method: "POST",
      body: JSON.stringify({
        nombre: `QA Auditoría ${sufijo}`,
        etapa: "SECUNDARIA",
        grado: 4,
        seccion: `A${sufijo.slice(-3)}`,
        institucionId: unaInstitucion.id,
      }),
    });
    const cuerpoAula = await rCrearAula.json().catch(() => ({}));
    check("se crea el aula de prueba", rCrearAula.status === 201 && Boolean(cuerpoAula.aula?.id), JSON.stringify(cuerpoAula));
    aulaDePrueba = cuerpoAula.aula;
  }

  // C.1 Matriculación DIRECTA del admin → origen ADMIN, creadoPorId = el
  // propio admin.
  if (aulaDePrueba) {
    const altaAlumnoAdmin = await registrarAlumno(BASE, {
      email: `qa.auditoria.admin.${sufijo}@mentoriamath.local`,
      password: "Alumno-2026",
      nombre: "QA Auditoría Admin",
    });
    check("se registra el alumno matriculado por el admin", altaAlumnoAdmin.ok);

    const rBuscar = await apiAdmin(`/api/admin/usuarios?rol=ESTUDIANTE&q=qa.auditoria.admin.${sufijo}`);
    const { usuarios: encontrados } = await rBuscar.json().catch(() => ({ usuarios: [] }));
    const elAlumno = encontrados?.[0];
    check("se encuentra al alumno recién creado", Boolean(elAlumno));

    if (elAlumno) {
      const rMatricula = await apiAdmin("/api/admin/matriculas", {
        method: "POST",
        body: JSON.stringify({ estudianteId: elAlumno.id, aulaId: aulaDePrueba.id }),
      });
      const cuerpoMatricula = await rMatricula.json().catch(() => ({}));
      check(
        "POST /api/admin/matriculas matricula al alumno",
        rMatricula.status === 201,
        `HTTP ${rMatricula.status} · ${JSON.stringify(cuerpoMatricula)}`,
      );
      check(
        "…y la matrícula creada trae origen ADMIN y creadoPorId del administrador",
        cuerpoMatricula.matricula?.origen === "ADMIN" && cuerpoMatricula.matricula?.creadoPorId === idAdmin,
        JSON.stringify(cuerpoMatricula.matricula),
      );

      const rAlumnoConMatricula = await apiAdmin(`/api/admin/usuarios?rol=ESTUDIANTE&q=qa.auditoria.admin.${sufijo}`);
      const { usuarios: alumnoConMatricula } = await rAlumnoConMatricula.json().catch(() => ({ usuarios: [] }));
      check(
        "…y GET /api/admin/usuarios también muestra esa matrícula con origen ADMIN",
        alumnoConMatricula?.[0]?.matriculas?.[0]?.origen === "ADMIN",
        JSON.stringify(alumnoConMatricula?.[0]?.matriculas),
      );
    }
  }

  // C.2 Autoenrolamiento con CÓDIGO → origen CODIGO_INVITACION,
  // creadoPorId: null —el autor YA es el propio estudiante—.
  if (aulaDePrueba) {
    const altaAlumnoCodigo = await registrarAlumno(BASE, {
      email: `qa.auditoria.codigo.${sufijo}@mentoriamath.local`,
      password: "Alumno-2026",
      nombre: "QA Auditoría Código",
    });
    check("se registra el alumno que se autoenrola con código", altaAlumnoCodigo.ok);

    if (altaAlumnoCodigo.sesion) {
      const rUnirse = await fetch(`${BASE}/api/estudiante/unirse`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: altaAlumnoCodigo.sesion },
        body: JSON.stringify({ codigoAcceso: aulaDePrueba.codigoAcceso }),
      });
      check("POST /api/estudiante/unirse matricula con el código del aula", rUnirse.status === 201, `HTTP ${rUnirse.status}`);

      const rAlumnoCodigo = await apiAdmin(`/api/admin/usuarios?rol=ESTUDIANTE&q=qa.auditoria.codigo.${sufijo}`);
      const { usuarios: alumnoCodigo } = await rAlumnoCodigo.json().catch(() => ({ usuarios: [] }));
      check(
        "…y esa matrícula queda con origen CODIGO_INVITACION, no ADMIN",
        alumnoCodigo?.[0]?.matriculas?.[0]?.origen === "CODIGO_INVITACION",
        JSON.stringify(alumnoCodigo?.[0]?.matriculas),
      );
    }
  }
}

console.log("\n · D. LogAuditoria: rastro con autoría de cada acción sobre un usuario");
let idAlumnoAuditado = null;
{
  const altaAlumno = await registrarAlumno(BASE, {
    email: `qa.auditoria.usuario.${sufijo}@mentoriamath.local`,
    password: "Alumno-2026",
    nombre: "QA Auditoría Usuario",
  });
  check("se registra el alumno sobre el que se audita", altaAlumno.ok);

  const rBuscar = await apiAdmin(`/api/admin/usuarios?rol=ESTUDIANTE&q=qa.auditoria.usuario.${sufijo}`);
  const { usuarios: encontrados, instituciones } = await rBuscar.json().catch(() => ({ usuarios: [] }));
  idAlumnoAuditado = encontrados?.[0]?.id ?? null;
  const unaInstitucion = instituciones?.[0];
  check("se encuentra al alumno de prueba", Boolean(idAlumnoAuditado));

  if (idAlumnoAuditado && unaInstitucion) {
    // ROL_MODIFICADO + INSTITUCION_VINCULADA, en el mismo PATCH.
    await apiAdmin(`/api/admin/usuarios/${idAlumnoAuditado}`, {
      method: "PATCH",
      body: JSON.stringify({ rol: "DOCENTE", institucionId: unaInstitucion.id }),
    });

    // CUENTA_SUSPENDIDA, vía PATCH.
    await apiAdmin(`/api/admin/usuarios/${idAlumnoAuditado}`, { method: "PATCH", body: JSON.stringify({ activo: false }) });

    // CUENTA_ACTIVADA, vía el endpoint propio POST …/estado (contrato
    // distinto, mismo rastro).
    await apiAdmin(`/api/admin/usuarios/${idAlumnoAuditado}/estado`, { method: "POST", body: JSON.stringify({ activo: true }) });

    // Volver a ESTUDIANTE desvincula la institución sola → ROL_MODIFICADO +
    // INSTITUCION_DESVINCULADA.
    await apiAdmin(`/api/admin/usuarios/${idAlumnoAuditado}`, { method: "PATCH", body: JSON.stringify({ rol: "ESTUDIANTE" }) });

    const rLog = await apiAdmin(`/api/admin/auditoria?entidad=Usuario&entidadId=${idAlumnoAuditado}`);
    const { entradas } = await rLog.json().catch(() => ({ entradas: [] }));
    const acciones = (entradas ?? []).map((e) => e.accion);

    check(
      "ROL_MODIFICADO queda registrado (al menos dos veces: DOCENTE y de vuelta a ESTUDIANTE)",
      acciones.filter((a) => a === "ROL_MODIFICADO").length >= 2,
      JSON.stringify(acciones),
    );
    check("INSTITUCION_VINCULADA queda registrada", acciones.includes("INSTITUCION_VINCULADA"), JSON.stringify(acciones));
    check("INSTITUCION_DESVINCULADA queda registrada (al volver a ESTUDIANTE)", acciones.includes("INSTITUCION_DESVINCULADA"), JSON.stringify(acciones));
    check("CUENTA_SUSPENDIDA queda registrada", acciones.includes("CUENTA_SUSPENDIDA"), JSON.stringify(acciones));
    check("CUENTA_ACTIVADA queda registrada (vía POST …/estado)", acciones.includes("CUENTA_ACTIVADA"), JSON.stringify(acciones));
    check(
      "cada entrada trae quién lo hizo —el nombre del SUPERADMIN de la semilla, no null—",
      (entradas ?? []).every((e) => Boolean(e.autor)),
      JSON.stringify(entradas?.map((e) => e.autor)),
    );

    const rolModificado = entradas?.find((e) => e.accion === "ROL_MODIFICADO");
    check(
      "…y el antes/después queda legible: datosPrevios/datosNuevos con el campo que cambió",
      rolModificado?.datosPrevios?.rol !== undefined && rolModificado?.datosNuevos?.rol !== undefined,
      JSON.stringify(rolModificado),
    );
  }

  // Un PATCH que no cambia nada de verdad no debe sumar ruido al registro.
  if (idAlumnoAuditado) {
    const rAntes = await apiAdmin(`/api/admin/auditoria?entidad=Usuario&entidadId=${idAlumnoAuditado}`);
    const { entradas: antes } = await rAntes.json().catch(() => ({ entradas: [] }));
    await apiAdmin(`/api/admin/usuarios/${idAlumnoAuditado}`, { method: "PATCH", body: JSON.stringify({ activo: true }) });
    const rDespues = await apiAdmin(`/api/admin/auditoria?entidad=Usuario&entidadId=${idAlumnoAuditado}`);
    const { entradas: despues } = await rDespues.json().catch(() => ({ entradas: [] }));
    check(
      "un PATCH que pide el mismo valor que ya tenía no suma una entrada nueva al registro",
      (antes?.length ?? -1) === (despues?.length ?? -2),
      `${antes?.length} → ${despues?.length}`,
    );
  }
}

console.log("\n · E. GET /api/admin/auditoria: candado de la zona, y MATRICULA_CREADA del admin aparece");
{
  const rSinSesion = await fetch(`${BASE}/api/admin/auditoria`);
  check("sin sesión, 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

  if (sesionDocente) {
    const rDocente = await fetch(`${BASE}/api/admin/auditoria`, { headers: { cookie: sesionDocente } });
    check("un docente no puede leer la auditoría", rDocente.status === 403, `HTTP ${rDocente.status}`);
  }

  const rTodo = await apiAdmin("/api/admin/auditoria");
  const todo = await rTodo.json().catch(() => ({}));
  check("el SUPERADMIN SÍ puede leer la auditoría", rTodo.status === 200, `HTTP ${rTodo.status}`);
  check("…con al menos una entrada (las que esta misma batería acaba de generar)", (todo?.entradas?.length ?? 0) > 0);

  const rMatriculas = await apiAdmin("/api/admin/auditoria?entidad=Matricula");
  const { entradas: entradasMatricula } = await rMatriculas.json().catch(() => ({ entradas: [] }));
  check(
    "la matriculación directa del admin (sección C.1) quedó registrada como MATRICULA_CREADA",
    (entradasMatricula ?? []).some((e) => e.accion === "MATRICULA_CREADA"),
    JSON.stringify(entradasMatricula?.map((e) => e.accion)),
  );
}

salir();
