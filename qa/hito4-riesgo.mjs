// HITO 4 (cierre PMV2) — SECCIÓN 5: ALGORITMO DE DETECCIÓN TEMPRANA DE
// RIESGO ACADÉMICO, y los KPIs nuevos de los tres dashboards (sección 2).
//
// «Implementar un algoritmo de clasificación de riesgo (Semáforo: Rojo,
// Ámbar, Verde) basado en: Racha de respuestas incorrectas consecutivas,
// Tareas vencidas sin entregar, Tasa de entregas fuera de plazo.»
//
// Cubre, en este orden:
//
//   A. `riesgoAcademico`, `rachasDeFallosPorAlumno` y `riesgoDeEntregas`
//      (`lib/docente/metricas.ts`), puros, con datos de mentira.
//   B. `rachaDeDiasConsecutivos` (`lib/estudiante/racha.ts`), puro, con un
//      reloj de mentira.
//   C. `tasaDeAciertos` (`lib/director/resumen.ts`), puro.
//
// Y, si hay un servidor levantado, D: que las tres pantallas —panel
// docente, panel institucional y panel del estudiante— de verdad MUESTREN
// lo nuevo (el semáforo, la columna de rendimiento, la racha de práctica),
// no sólo que el cálculo exista.
//
//   node qa/hito4-riesgo.mjs
//   BASE_URL=http://localhost:3000 node qa/hito4-riesgo.mjs

import {
  rachasDeFallosPorAlumno,
  riesgoAcademico,
  riesgoDeEntregas,
} from "../lib/docente/metricas.ts";
import { rachaDeDiasConsecutivos } from "../lib/estudiante/racha.ts";
import { tasaDeAciertos } from "../lib/director/resumen.ts";
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

// ── A. El semáforo de riesgo académico ───────────────────────────────────────
console.log("\n · A. riesgoAcademico / rachasDeFallosPorAlumno / riesgoDeEntregas");
{
  const sinDatos = { rachaMaximaDeFallos: null, tasaAciertos: null, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: null };
  check("sin ninguna señal, sin_datos (no un color cualquiera)", riesgoAcademico(sinDatos) === "sin_datos");

  check(
    "4 fallos seguidos (>3) es ALTO, aunque el resto vaya bien",
    riesgoAcademico({ rachaMaximaDeFallos: 4, tasaAciertos: 95, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: true }) === "alto",
  );
  check(
    "3 fallos seguidos NO es alto todavía (el umbral es >3, no >=3)",
    riesgoAcademico({ rachaMaximaDeFallos: 3, tasaAciertos: 95, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: true }) === "optimo",
  );
  check(
    "2 tareas vencidas sin entregar es ALTO, aunque no haya fallado nunca",
    riesgoAcademico({ rachaMaximaDeFallos: 0, tasaAciertos: 100, tareasVencidasSinEntregar: 2, todasEntregadasEnPlazo: true }) === "alto",
  );

  check(
    "menos del 60% de aciertos es Observación",
    riesgoAcademico({ rachaMaximaDeFallos: 1, tasaAciertos: 59, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: true }) === "observacion",
  );
  check(
    "exactamente 1 tarea vencida sin entregar es Observación (2 ya es Alto)",
    riesgoAcademico({ rachaMaximaDeFallos: 0, tasaAciertos: 90, tareasVencidasSinEntregar: 1, todasEntregadasEnPlazo: true }) === "observacion",
  );

  check(
    "80% o más de aciertos y nada entregado tarde es ÓPTIMO",
    riesgoAcademico({ rachaMaximaDeFallos: 1, tasaAciertos: 80, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: true }) === "optimo",
  );
  check(
    "80% de aciertos pero con algo entregado FUERA de plazo no es óptimo todavía",
    riesgoAcademico({ rachaMaximaDeFallos: 0, tasaAciertos: 85, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: false }) === "observacion",
  );
  check(
    "el hueco de en medio (70% de aciertos, nada vencido) cae en Observación, no se queda sin clasificar",
    riesgoAcademico({ rachaMaximaDeFallos: 0, tasaAciertos: 70, tareasVencidasSinEntregar: 0, todasEntregadasEnPlazo: true }) === "observacion",
  );

  // rachasDeFallosPorAlumno: la racha es la ACTUAL (más reciente), no un máximo histórico.
  const intentos = [
    { perfilId: "p1", tema: "FRACCIONES", acierto: false, en: "2026-01-01" },
    { perfilId: "p1", tema: "FRACCIONES", acierto: false, en: "2026-01-02" },
    { perfilId: "p1", tema: "FRACCIONES", acierto: false, en: "2026-01-03" },
    { perfilId: "p1", tema: "FRACCIONES", acierto: false, en: "2026-01-04" },
    { perfilId: "p1", tema: "FRACCIONES", acierto: false, en: "2026-01-05" },
    // Desde entonces, acierta: la racha de HOY es 0, no 5.
    { perfilId: "p1", tema: "FRACCIONES", acierto: true, en: "2026-01-06" },
    // Pero en otro tema sigue fallando ahora mismo.
    { perfilId: "p1", tema: "ALGEBRA", acierto: false, en: "2026-01-07" },
    { perfilId: "p1", tema: "ALGEBRA", acierto: false, en: "2026-01-08" },
  ];
  const rachas = rachasDeFallosPorAlumno(intentos);
  check(
    "un alumno que ya superó su mala racha en un tema, pero sigue fallando en otro, muestra la racha VIVA (2), no la vieja (5)",
    rachas.get("p1") === 2,
    `obtuvo ${rachas.get("p1")}`,
  );
  check(
    "el orden de entrada no importa: la función reordena por fecha ella misma",
    rachasDeFallosPorAlumno([...intentos].reverse()).get("p1") === 2,
  );

  // riesgoDeEntregas
  const ahora = new Date("2026-06-15T00:00:00Z");
  const tareas = [
    {
      fechaVencimiento: "2026-06-01T00:00:00Z", // vencida
      estudiantesMatriculados: ["e1", "e2"],
      entregas: [{ estudianteId: "e1", completada: true, fechaEntrega: "2026-05-30T00:00:00Z" }],
    },
    {
      fechaVencimiento: "2026-06-10T00:00:00Z", // vencida
      estudiantesMatriculados: ["e1", "e2"],
      entregas: [{ estudianteId: "e1", completada: true, fechaEntrega: "2026-06-11T00:00:00Z" }], // tarde
    },
  ];
  const entregas = riesgoDeEntregas(tareas, ahora);
  check("e1 entregó ambas, pero una tarde: todasEntregadasEnPlazo es false", entregas.get("e1")?.todasEntregadasEnPlazo === false);
  check("e1 no tiene tareas vencidas SIN entregar (entregó las dos)", entregas.get("e1")?.tareasVencidasSinEntregar === 0);
  check("e2 nunca entregó ninguna de las dos vencidas: 2 vencidas sin entregar", entregas.get("e2")?.tareasVencidasSinEntregar === 2);
  check("e2 no tiene ninguna entrega con la que juzgar el plazo: null, no true", entregas.get("e2")?.todasEntregadasEnPlazo === null);
}

// ── B. Racha de días consecutivos del estudiante ─────────────────────────────
console.log("\n · B. rachaDeDiasConsecutivos");
{
  const hoy = new Date("2026-06-15T12:00:00Z");
  check("sin ningún rastro, la racha es 0", rachaDeDiasConsecutivos([], hoy) === 0);
  check(
    "práctica hoy, ayer y antier: racha de 3",
    rachaDeDiasConsecutivos(["2026-06-13T08:00:00Z", "2026-06-14T20:00:00Z", "2026-06-15T09:00:00Z"], hoy) === 3,
  );
  check(
    "todavía no practicó HOY, pero sí ayer y antier: la racha sigue viva (2), no se rompe a medianoche",
    rachaDeDiasConsecutivos(["2026-06-13T08:00:00Z", "2026-06-14T20:00:00Z"], hoy) === 2,
  );
  check(
    "un hueco de dos días atrás SÍ rompe la racha: sólo cuenta hoy",
    rachaDeDiasConsecutivos(["2026-06-15T09:00:00Z", "2026-06-10T09:00:00Z"], hoy) === 1,
  );
  check(
    "practicó hace dos días, pero NADA hoy ni ayer: la racha ya está rota (0)",
    rachaDeDiasConsecutivos(["2026-06-13T09:00:00Z"], hoy) === 0,
  );
  check(
    "varias prácticas el mismo día sólo cuentan como un día",
    rachaDeDiasConsecutivos(["2026-06-15T11:00:00Z", "2026-06-15T13:00:00Z"], hoy) === 1,
  );
}

// ── C. Rendimiento por aula del director ─────────────────────────────────────
console.log("\n · C. tasaDeAciertos (panel institucional)");
{
  check(
    "10 intentos con 7 aciertos es 70%",
    tasaDeAciertos({ intentosRegistrados: 10, aciertosRegistrados: 7 }) === 70,
  );
  check(
    "sin intentos registrados, sin tasa (null, no 0%)",
    tasaDeAciertos({ intentosRegistrados: 0, aciertosRegistrados: 0 }) === null,
  );
  check(
    "sin los campos informados (aula de antes de este hito), tampoco revienta: null",
    tasaDeAciertos({}) === null,
  );
}

// ── D. Las tres pantallas, de verdad, contra un servidor levantado ───────────
console.log("\n · D. Las pantallas muestran lo nuevo");
const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud) {
  console.log(`\n  · No hay servidor en ${BASE}: se omite esta sección.`);
  console.log("    Arráncalo con `npm run dev` (o `npm run start`) y vuelve a ejecutarla.");
  salir();
}
console.log(`  Servidor: ${BASE}  ·  modo IA: ${salud.modo_ia}`);

const sesionDocente = await iniciarSesion(BASE, "docente@mentoriamath.local", "Docente-2026");
const sesionDirector = await iniciarSesion(BASE, "director@mentoriamath.local", "Director-2026");
const sufijo = Date.now().toString(36);
const altaAlumno = await registrarAlumno(BASE, {
  email: `qa.riesgo.${sufijo}@mentoriamath.local`,
  password: "Alumno-2026",
  nombre: "QA Riesgo",
});
const sesionAlumno = altaAlumno.sesion;

if (sesionDocente) {
  const r = await fetch(`${BASE}/docente`, { headers: { cookie: sesionDocente } });
  const html = await r.text();
  check("el panel docente trae el semáforo de riesgo académico", html.includes("Semáforo de riesgo académico"));
  check("…con sus cuatro niveles", html.includes("Riesgo alto") && html.includes("En observación") && html.includes("Óptimo"));
  check("…y una columna Riesgo en la tabla de estudiantes", html.includes(">Riesgo<"));
} else {
  check("sesión de docente de la semilla", false, "no se pudo iniciar sesión; se omiten sus comprobaciones");
}

if (sesionDirector) {
  const r = await fetch(`${BASE}/director`, { headers: { cookie: sesionDirector } });
  const html = await r.text();
  check(
    "el panel institucional trae la columna de Rendimiento por aula",
    html.includes(">Rendimiento<") || html.includes("Sin colegio asignado"),
  );
  check(
    "…y la tarjeta de temas con mayor tasa de error del colegio",
    html.includes("Temas con mayor tasa de error") || html.includes("Sin colegio asignado"),
  );
} else {
  check("sesión de director de la semilla", false, "no se pudo iniciar sesión; se omiten sus comprobaciones");
}

if (sesionAlumno) {
  const r = await fetch(`${BASE}/estudiante`, { headers: { cookie: sesionAlumno } });
  const html = await r.text();
  check(
    "el panel del estudiante trae su racha de práctica (o la invitación a empezar una, sin nivel aún)",
    html.includes("Racha de práctica") || html.includes("Evaluación diagnóstica"),
  );
} else {
  check("sesión de un alumno de prueba", false, "no se pudo iniciar sesión con alumno@mentoriamath.local/Alumno-2026; se omiten sus comprobaciones");
}

salir();
