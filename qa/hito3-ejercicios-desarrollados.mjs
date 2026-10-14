// "EJERCICIOS DESARROLLADOS": ¿PUEDE EL DOCENTE AUDITAR LO QUE RESOLVIÓ UN
// ALUMNO CONCRETO, EN SU PROPIA AULA?
//
// POR QUÉ EXISTE
// El cliente lo pidió con la pantalla del panel de Aulas delante: "Debajo de
// los datos de cada estudiante matriculado… agregar un enlace o botón
// secundario que diga 'ejercicios desarrollados'… debe redirigir o abrir un
// modal/vista donde el docente pueda auditar y visualizar en detalle qué
// ejercicios resolvió ese alumno específico, sus respuestas enviadas,
// intentos utilizados y el puntaje obtenido".
//
//   node qa/hito3-ejercicios-desarrollados.mjs

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
  if (fallos.length > 0) {
    console.log("\n Fallos:");
    for (const f of fallos) console.log(`   · ${f}`);
  }
  console.log("═══════════════════════════════════════════════════════════\n");
  process.exit(fallos.length > 0 ? 1 : 0);
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
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: sesionDocente, ...(opciones.headers || {}) } });

const sufijo = Date.now().toString(36);
const rAula = await api("/api/docente/aulas", { method: "POST", body: JSON.stringify({ nombre: `Desarrollados ${sufijo}`, grado: 1, seccion: "N" }) });
const aula = await rAula.json();
check("se crea el aula de prueba", rAula.status === 201, `HTTP ${rAula.status}`);

const email = `qa.desarrollados.${sufijo}@mentoriamath.local`;
const clave = "Alumno-2026";
const alta = await registrarAlumno(BASE, { email, password: clave, nombre: "QA Desarrollados" });
check("se registra el alumno de prueba", alta.ok);

await fetch(`${BASE}/api/estudiante/nivel-educativo`, {
  method: "PUT", headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({ etapa: "PRIMARIA", curso: 4 }),
});
const prueba = await (await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: alta.sesion } })).json();
await fetch(`${BASE}/api/diagnostico`, {
  method: "POST", headers: { "Content-Type": "application/json", cookie: alta.sesion },
  body: JSON.stringify({ respuestas: (prueba.preguntas ?? []).map((p) => ({ preguntaId: p.id, respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0" })) }),
});
const galleta = (await iniciarSesion(BASE, email, clave)) ?? alta.sesion;

const apiAlumno = (ruta, opciones = {}) =>
  fetch(`${BASE}${ruta}`, { ...opciones, headers: { "Content-Type": "application/json", cookie: galleta, ...(opciones.headers || {}) } });
const rUnirse = await apiAlumno("/api/estudiante/unirse", { method: "POST", body: JSON.stringify({ codigoAcceso: aula?.aula?.codigoAcceso }) });
check("el alumno se matricula en el aula", rUnirse.status === 201, `HTTP ${rUnirse.status}`);

// El id del alumno lo saca el propio docente, de la ficha del aula —el mismo
// camino que usa el enlace nuevo—.
const rFichaAntes = await api(`/api/docente/aulas/${aula.aula.id}`);
const fichaAntes = await rFichaAntes.json();
const estudianteId = (fichaAntes?.estudiantes ?? []).find((e) => e.email === email)?.id;
check("la ficha del aula trae el id del alumno matriculado", Boolean(estudianteId));

const rTemas = await api("/api/docente/temas");
const temas = await rTemas.json().catch(() => ({}));
const nodoAritmetica = (temas?.temas ?? []).find((t) => t.motor === "ARITMETICA" || t.clave === "aritmetica");

const ahoraIso = new Date().toISOString();
const mananaIso = new Date(Date.now() + 86_400_000).toISOString();
const rTarea = await api("/api/docente/tareas", {
  method: "POST",
  body: JSON.stringify({
    aulaId: aula.aula.id, titulo: `Desarrollados ${sufijo}`, fechaInicio: ahoraIso, fechaVencimiento: mananaIso,
    cantidadEjercicios: 2, limiteReintentos: 2, nodoId: nodoAritmetica?.id ?? null,
  }),
});
const tarea = await rTarea.json();
check("se crea la tarea", rTarea.status === 201, `HTTP ${rTarea.status}`);

// El alumno entrega, con un desglose de verdad —un ejercicio bien, otro mal—.
const detalle = [
  { enunciado: "¿Cuánto es 7 + 2?", respuestaDada: "9", respuestaCorrecta: "9", correcto: true },
  { enunciado: "¿Cuánto es 10 - 4?", respuestaDada: "5", respuestaCorrecta: "6", correcto: false },
];
const rEntregar = await apiAlumno(`/api/estudiante/tareas/${tarea.tarea.id}/entregar`, {
  method: "POST",
  body: JSON.stringify({ puntaje: 50, completada: true, detalle }),
});
check("el alumno entrega la tarea con su desglose", rEntregar.status === 200, `HTTP ${rEntregar.status}`);

// ── La ruta nueva: lo que el docente ve de ESTE alumno, en ESTA aula ────────
const rEntregas = await api(`/api/docente/aulas/${aula.aula.id}/estudiantes/${estudianteId}/entregas`);
const vistaDocente = await rEntregas.json().catch(() => ({}));
check("GET .../entregas responde 200 al docente dueño del aula", rEntregas.status === 200, `HTTP ${rEntregas.status}`);
check(
  "…con el nombre y correo del alumno",
  vistaDocente?.estudiante?.email === email,
  JSON.stringify(vistaDocente?.estudiante),
);
const laTarea = (vistaDocente?.entregas ?? []).find((e) => e.tareaId === tarea.tarea.id);
check(
  "…y la entrega de la tarea, con su nota y sus intentos",
  laTarea?.puntaje === 50 && laTarea?.completada === true && laTarea?.intentosUsados === 1,
  JSON.stringify(laTarea),
);
check(
  "…con el desglose COMPLETO, incluida la respuesta correcta —sin el candado del lado del alumno—",
  Array.isArray(laTarea?.detalle) &&
    laTarea.detalle.length === 2 &&
    laTarea.detalle[1]?.respuestaCorrecta === "6" &&
    laTarea.detalle[1]?.correcto === false,
  JSON.stringify(laTarea?.detalle),
);

// ── Candados ─────────────────────────────────────────────────────────────
const sesionOtroDocente = await iniciarSesion(BASE, "docente2@mentoriamath.local", "Docente-2026").catch(() => null);
if (sesionOtroDocente) {
  const rAjeno = await fetch(`${BASE}/api/docente/aulas/${aula.aula.id}/estudiantes/${estudianteId}/entregas`, {
    headers: { cookie: sesionOtroDocente },
  });
  check("un docente que NO es dueño del aula recibe 404, no los datos", rAjeno.status === 404, `HTTP ${rAjeno.status}`);
} else {
  console.log("  · (sin una segunda cuenta docente sembrada, se omite la comprobación de titularidad cruzada)");
}

const rSinMatricular = await api(`/api/docente/aulas/${aula.aula.id}/estudiantes/id-que-no-existe/entregas`);
check(
  "un id de alumno que no está matriculado en esta aula también da 404",
  rSinMatricular.status === 404,
  `HTTP ${rSinMatricular.status}`,
);

const rSinSesion = await fetch(`${BASE}/api/docente/aulas/${aula.aula.id}/estudiantes/${estudianteId}/entregas`);
check("sin sesión, 401", rSinSesion.status === 401, `HTTP ${rSinSesion.status}`);

const rComoAlumno = await apiAlumno(`/api/docente/aulas/${aula.aula.id}/estudiantes/${estudianteId}/entregas`);
check("un estudiante no puede usar esta ruta de docente", rComoAlumno.status !== 200, `HTTP ${rComoAlumno.status}`);

// ── La página (lo que de verdad abre el enlace "Ejercicios desarrollados") ──
const rPagina = await fetch(`${BASE}/docente/aulas/${aula.aula.id}/estudiantes/${estudianteId}`, {
  headers: { cookie: sesionDocente },
});
const html = await rPagina.text();
check("la página responde 200", rPagina.status === 200, `HTTP ${rPagina.status}`);
check("…con el nombre del alumno", html.includes("QA Desarrollados"));
check("…y el título de la tarea entregada", html.includes(`Desarrollados ${sufijo}`));
// El SSR de React intercala comentarios `<!-- -->` entre expresiones
// interpoladas ("Nota: <!-- -->50<!-- -->/100"): el regex los tolera.
check(
  "…mostrando la nota",
  /Nota:\s*(?:<!--\s*-->\s*)?50(?:\s*<!--\s*-->\s*)?\/100/.test(html),
  "no se encontró 'Nota: 50/100'",
);

salir();
