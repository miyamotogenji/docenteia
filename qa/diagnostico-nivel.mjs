// ¿RECIBE CADA ALUMNO LA PRUEBA DE SU NIVEL?
//
// POR QUÉ EXISTE
// El cliente detectó el fallo de flujo: un alumno se registraba diciendo que
// estaba en 3.º de secundaria y la evaluación diagnóstica le presentaba
// DERIVADAS. El banco era uno solo —cinco preguntas, una por cada tema del
// motor— y se servía entero a todo el mundo, así que la prueba no medía su
// nivel: lo expulsaba.
//
// Aquí se fija el contrato que lo impide:
//
//   A. Del curso declarado sale un nivel de contenido.
//   B. La prueba se compone con el catálogo de ESE nivel y con los ejercicios
//      que el profesorado haya publicado para ese nivel.
//   C. El catálogo sembrado tiene preguntas suficientes en los tres niveles,
//      para que el diagnóstico funcione desde el primer despliegue.
//   D. Y, con servidor levantado: un alumno de 3.º de secundaria NO ve una sola
//      derivada, y uno de bachillerato sí.
//
//   node qa/diagnostico-nivel.mjs
//   BASE_URL=http://localhost:3000 node qa/diagnostico-nivel.mjs

import { readFileSync } from "node:fs";

import { GRADOS, gradoPorValor, nivelDePartida, nivelPorGrado } from "../lib/diagnostico/grados.ts";
import {
  componerDiagnostico,
  partirId,
  sirveParaDiagnostico,
  MAX_DEL_BANCO,
  PREGUNTAS_POR_DIAGNOSTICO,
} from "../lib/diagnostico/seleccion.ts";
import { adaptarBanco } from "../lib/diagnostico/banco.ts";
import { clasificarNivel } from "../lib/diagnostico/clasificar.ts";

import { BASE_URL as BASE } from "./base-url.mjs";
import { registrarAlumno } from "./sesion.mjs";

let ok = 0;
const fallos = [];

function check(nombre, condicion, detalle = "") {
  if (condicion) {
    ok++;
    console.log(`   ✓ ${nombre}`);
  } else {
    fallos.push(nombre + (detalle ? ` — ${detalle}` : ""));
    console.log(`   ✗ ${nombre}${detalle ? `  (${detalle})` : ""}`);
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(" DIAGNÓSTICO POR NIVEL — la prueba se ajusta al curso");
console.log("═══════════════════════════════════════════════════════════\n");

// ── A. Del curso al nivel ────────────────────────────────────────────────────
console.log(" · A. El curso declarado decide el nivel de partida");

check(
  "3.º de secundaria NO es nivel avanzado",
  nivelPorGrado("Secundaria", "3.º") === "INTERMEDIO",
  String(nivelPorGrado("Secundaria", "3.º")),
);
check("1.º de secundaria empieza en básico", nivelPorGrado("Secundaria", "1º") === "BASICO");
check("5.º de primaria es básico", nivelPorGrado("Primaria", "5º") === "BASICO");
check("bachillerato es avanzado", nivelPorGrado("Bachillerato", "2º") === "AVANZADO");
check("preuniversitario es avanzado", nivelPorGrado("Preuniversitario", "") === "AVANZADO");

// Cómo lo escribe la gente de verdad.
for (const [ciclo, grado] of [
  ["Secundaria", "3.º"],
  ["secundaria", "3º"],
  ["SECUNDARIA", "3"],
  ["Secundaria", "tercero"],
  ["Secundaria", "3er grado"],
  ["", "secundaria-3"],
  ["3 ESO", ""],
]) {
  check(
    `"${ciclo} ${grado}".trim() → INTERMEDIO`,
    nivelPorGrado(ciclo, grado) === "INTERMEDIO",
    String(nivelPorGrado(ciclo, grado)),
  );
}

check("un curso irreconocible no se inventa", nivelPorGrado("", "") === null);
check("un ordinal sin ciclo tampoco", nivelPorGrado("", "3º") === null);
check(
  "sin curso se empieza por lo básico, no por lo avanzado",
  nivelDePartida({ nivelActual: null, ciclo: null, grado: null }) === "BASICO",
);
check(
  "el nivel ya diagnosticado manda sobre el curso",
  nivelDePartida({ nivelActual: "AVANZADO", ciclo: "Secundaria", grado: "1º" }) === "AVANZADO",
);
check("el catálogo de cursos cubre primaria, secundaria y superior", GRADOS.length >= 13);
check("cada curso del catálogo trae su nivel", GRADOS.every((g) => g.nivel));
check("el catálogo se busca por su valor", gradoPorValor("secundaria-3")?.nivel === "INTERMEDIO");

// ── B. Cómo se compone la prueba ─────────────────────────────────────────────
console.log("\n · B. Composición de la prueba");

const pregunta = (id, tema, nivel, orden) => ({
  id,
  tema,
  nivel,
  enunciado: `¿Pregunta ${id}?`,
  expresion: null,
  opciones: [
    { id: "a", texto: "1" },
    { id: "b", texto: "2" },
  ],
  orden,
});

const ejercicio = (id, extra = {}) => ({
  id,
  enunciado: `2x = ${id}`,
  nivel: "INTERMEDIO",
  motor: "ECUACIONES_LINEALES",
  respuestaCorrecta: "4",
  plantilla: false,
  ...extra,
});

const catalogoIntermedio = [
  pregunta("c1", "ARITMETICA", "INTERMEDIO", 1),
  pregunta("c2", "FRACCIONES", "INTERMEDIO", 2),
  pregunta("c3", "ECUACIONES_LINEALES", "INTERMEDIO", 3),
  pregunta("c4", "FACTORIZACION", "INTERMEDIO", 4),
  pregunta("c5", "ARITMETICA", "INTERMEDIO", 5),
];

const soloCatalogo = componerDiagnostico({ catalogo: catalogoIntermedio, banco: [] });
check(
  "sin banco del docente, la prueba son las preguntas del catálogo",
  soloCatalogo.length === PREGUNTAS_POR_DIAGNOSTICO &&
    soloCatalogo.every((i) => i.origen === "catalogo"),
  `${soloCatalogo.length} items`,
);
check(
  "y todas son de opción múltiple",
  soloCatalogo.every((i) => i.tipo === "opcion_multiple" && (i.opciones ?? []).length === 2),
);

// El reparto por tema: lo que impide que la prueba mida un solo asunto.
const desordenado = [
  pregunta("f1", "FACTORIZACION", "AVANZADO", 1),
  pregunta("f2", "FACTORIZACION", "AVANZADO", 2),
  pregunta("d1", "DERIVADAS", "AVANZADO", 3),
  pregunta("d2", "DERIVADAS", "AVANZADO", 4),
  pregunta("l1", "ECUACIONES_LINEALES", "AVANZADO", 5),
];
const dosDeCinco = componerDiagnostico({
  catalogo: desordenado,
  banco: [ejercicio("e1"), ejercicio("e2"), ejercicio("e3")],
});
const temasDelCatalogo = dosDeCinco
  .filter((i) => i.origen === "catalogo")
  .map((i) => i.tema);
check(
  "cuando sólo caben dos preguntas del catálogo, son de temas distintos",
  new Set(temasDelCatalogo).size === temasDelCatalogo.length,
  temasDelCatalogo.join(", "),
);

const conBanco = componerDiagnostico({
  catalogo: catalogoIntermedio,
  banco: [ejercicio("e1"), ejercicio("e2"), ejercicio("e3"), ejercicio("e4"), ejercicio("e5")],
});
check("la prueba sigue teniendo cinco preguntas", conBanco.length === PREGUNTAS_POR_DIAGNOSTICO);
check(
  "el banco del docente entra en la prueba",
  conBanco.filter((i) => i.origen === "banco").length === MAX_DEL_BANCO,
  `${conBanco.filter((i) => i.origen === "banco").length} del banco`,
);
check(
  "pero no la copa entera: el catálogo calibrado sigue presente",
  conBanco.some((i) => i.origen === "catalogo"),
);
check(
  "las del banco son de respuesta abierta",
  conBanco.filter((i) => i.origen === "banco").every((i) => i.tipo === "respuesta_abierta"),
);
check(
  "el identificador dice de dónde sale cada pregunta",
  conBanco.every((i) => partirId(i.id)?.origen === i.origen),
);

// Lo que NO puede entrar en un diagnóstico.
check(
  "una plantilla con huecos no se le enseña a un alumno",
  !sirveParaDiagnostico(ejercicio("p1", { plantilla: true })),
);
check(
  "un ejercicio sin motor no entra: no se podría corregir",
  !sirveParaDiagnostico(ejercicio("p2", { motor: null })),
);
check(
  "ni uno sin respuesta guardada",
  !sirveParaDiagnostico(ejercicio("p3", { respuestaCorrecta: "" })),
);
check(
  "el filtro se aplica al componer",
  componerDiagnostico({
    catalogo: [],
    banco: [ejercicio("p1", { plantilla: true }), ejercicio("e1")],
  }).length === 1,
);

// Comodines: sólo cuando el nivel se queda corto.
const conComodines = componerDiagnostico({
  catalogo: [pregunta("c1", "ARITMETICA", "BASICO", 1)],
  banco: [],
  comodines: [
    pregunta("x1", "ARITMETICA", null, 90),
    pregunta("x2", "FRACCIONES", null, 91),
  ],
});
check(
  "si faltan preguntas del nivel, se completa con las transversales",
  conComodines.length === 3,
  `${conComodines.length} items`,
);
check(
  "los comodines no se usan cuando el nivel ya tiene preguntas suficientes",
  componerDiagnostico({
    catalogo: catalogoIntermedio,
    banco: [],
    comodines: [pregunta("x1", "ARITMETICA", null, 90)],
  }).every((i) => i.id !== "catalogo:x1"),
);

// ── C. El catálogo sembrado ──────────────────────────────────────────────────
console.log("\n · C. Preguntas sembradas por nivel");

const banco = adaptarBanco(
  JSON.parse(readFileSync(new URL("../prisma/seed-data/preguntas-diagnostico.json", import.meta.url), "utf8")),
);
const porNivel = new Map();
for (const p of banco) {
  const clave = p.nivel ?? "SIN_NIVEL";
  porNivel.set(clave, [...(porNivel.get(clave) ?? []), p]);
}

for (const nivel of ["BASICO", "INTERMEDIO", "AVANZADO"]) {
  const preguntas = porNivel.get(nivel) ?? [];
  check(
    `${nivel}: al menos 3 preguntas sembradas`,
    preguntas.length >= 3,
    `${preguntas.length} preguntas`,
  );
  check(
    `${nivel}: la prueba se puede completar entera`,
    preguntas.length >= PREGUNTAS_POR_DIAGNOSTICO,
    `${preguntas.length} de ${PREGUNTAS_POR_DIAGNOSTICO}`,
  );
  check(`${nivel}: pregunta por más de un tema`, new Set(preguntas.map((p) => p.tema)).size >= 2);
}

const basicas = porNivel.get("BASICO") ?? [];
check(
  "NINGUNA pregunta de nivel básico es de derivadas",
  basicas.every((p) => p.tema !== "DERIVADAS"),
  basicas.map((p) => p.tema).join(", "),
);
check(
  "ni de factorización",
  basicas.every((p) => p.tema !== "FACTORIZACION"),
);
const intermedias = porNivel.get("INTERMEDIO") ?? [];
check(
  "ninguna pregunta de nivel intermedio es de derivadas",
  intermedias.every((p) => p.tema !== "DERIVADAS"),
  intermedias.map((p) => p.tema).join(", "),
);
check(
  "las derivadas viven en el nivel avanzado",
  (porNivel.get("AVANZADO") ?? []).some((p) => p.tema === "DERIVADAS"),
);

// La regla de corte del cliente sigue en pie con cinco preguntas por nivel.
check("2 de 5 aciertos siguen siendo BÁSICO", clasificarNivel(2, 5) === "BASICO");
check("3 de 5 siguen siendo INTERMEDIO", clasificarNivel(3, 5) === "INTERMEDIO");
check("5 de 5 siguen siendo AVANZADO", clasificarNivel(5, 5) === "AVANZADO");

// ── D. De punta a punta ──────────────────────────────────────────────────────
console.log("\n · D. Un alumno real, de punta a punta");

const salud = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((r) => r.json())
  .catch(() => null);

if (!salud || (salud.base_datos && salud.base_datos !== "ok")) {
  console.log(`   · Sin servidor o sin base de datos en ${BASE}: se omite esta sección.`);
} else {
  const sufijo = Date.now().toString(36);

  /** Registra un alumno con su curso y devuelve la prueba que le arma el servidor. */
  async function pruebaDe(curso, { ciclo, grado }) {
    const email = `qa.${curso}.${sufijo}@mentoriamath.local`;
    const { ok: registrado, sesion } = await registrarAlumno(BASE, {
      nombre: `QA ${curso}`,
      email,
      password: "Diagnostico-2026",
      ciclo,
      grado,
    });
    if (!registrado || !sesion) return { registrado, prueba: null, sesion: null };

    const r = await fetch(`${BASE}/api/diagnostico`, { headers: { cookie: sesion } });
    return { registrado, prueba: await r.json().catch(() => null), sesion };
  }

  // El caso exacto que reportó el cliente.
  const tercero = await pruebaDe("sec3", { ciclo: "Secundaria", grado: "3.º" });
  check("se registra un alumno de 3.º de secundaria", tercero.registrado);

  if (tercero.prueba) {
    check(
      "la prueba se arma con nivel INTERMEDIO",
      tercero.prueba.nivelDePartida === "INTERMEDIO",
      String(tercero.prueba.nivelDePartida),
    );
    check(
      "el servidor dice que el nivel sale del curso declarado",
      tercero.prueba.origenDelNivel === "curso_declarado",
      String(tercero.prueba.origenDelNivel),
    );
    check(
      "NO le aparece ninguna pregunta de derivadas (el fallo reportado)",
      (tercero.prueba.preguntas ?? []).every((p) => p.tema !== "DERIVADAS"),
      (tercero.prueba.preguntas ?? []).map((p) => p.tema).join(", "),
    );
    check(
      "la prueba tiene las cinco preguntas",
      (tercero.prueba.preguntas ?? []).length === PREGUNTAS_POR_DIAGNOSTICO,
      `${(tercero.prueba.preguntas ?? []).length}`,
    );
    check(
      "ninguna pregunta viaja con su respuesta correcta",
      JSON.stringify(tercero.prueba.preguntas ?? []).includes("respuestaCorrecta") === false,
    );

    // Y el diagnóstico se puede terminar: se responde a todo y sale un nivel.
    const envio = await fetch(`${BASE}/api/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: tercero.sesion },
      body: JSON.stringify({
        respuestas: (tercero.prueba.preguntas ?? []).map((p) => ({
          preguntaId: p.id,
          respuestaDada: p.tipo === "opcion_multiple" ? "a" : "0",
          tiempoMs: 1000,
        })),
      }),
    });
    const resultado = await envio.json().catch(() => ({}));
    check(
      "el diagnóstico se corrige y asigna un nivel",
      envio.status === 200 && Boolean(resultado.nivel),
      `HTTP ${envio.status}`,
    );
    check(
      "y cuenta sobre el total de SU prueba",
      resultado.total === PREGUNTAS_POR_DIAGNOSTICO,
      `total: ${resultado.total}`,
    );

    // No se admite media prueba: sería un recuento que no significa nada.
    const parcial = await fetch(`${BASE}/api/diagnostico`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: tercero.sesion },
      body: JSON.stringify({
        respuestas: [{ preguntaId: tercero.prueba.preguntas[0].id, respuestaDada: "a" }],
      }),
    });
    check("un envío incompleto se rechaza", parcial.status === 400, `HTTP ${parcial.status}`);
  }

  // El otro extremo: bachillerato sí ve derivadas.
  const bachiller = await pruebaDe("bach2", { ciclo: "Bachillerato", grado: "2.º" });
  if (bachiller.prueba) {
    check(
      "un alumno de bachillerato SÍ recibe nivel avanzado",
      bachiller.prueba.nivelDePartida === "AVANZADO",
      String(bachiller.prueba.nivelDePartida),
    );
    check(
      "y en su prueba sí hay derivadas",
      (bachiller.prueba.preguntas ?? []).some((p) => p.tema === "DERIVADAS"),
      (bachiller.prueba.preguntas ?? []).map((p) => p.tema).join(", "),
    );
  }

  // Y el que no dice su curso empieza por lo básico.
  const sinCurso = await pruebaDe("sincurso", { ciclo: "", grado: "" });
  if (sinCurso.prueba) {
    check(
      "sin curso declarado, la prueba es de nivel básico",
      sinCurso.prueba.nivelDePartida === "BASICO",
      String(sinCurso.prueba.nivelDePartida),
    );
    check(
      "y tampoco ve derivadas",
      (sinCurso.prueba.preguntas ?? []).every((p) => p.tema !== "DERIVADAS"),
    );
  }
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log(` ${ok} comprobaciones superadas · ${fallos.length} fallidas`);
if (fallos.length > 0) {
  console.log("\n Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
}
console.log("═══════════════════════════════════════════════════════════\n");
process.exit(fallos.length > 0 ? 1 : 0);
