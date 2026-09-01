// ¿SIGUE EN PIE LO QUE SE ENTREGÓ EN EL PASO 1?
//
// Por qué existe: las demás baterías cubren la lección —el Paso 2— y dan por
// supuesto todo lo de debajo. Pero el contrato del Paso 1 (registro →
// diagnóstico → nivel → persistencia, y el control de roles) no lo comprobaba
// nadie. Un cambio en el middleware que dejara `/admin` abierto, o un retoque
// en la regla de corte que moviera el umbral de Intermedio, pasaría entero por
// la suite sin que ninguna prueba se inmutara.
//
// Aquí se fija ese contrato: la regla de corte, la protección de cada ruta y
// las validaciones del registro. Lo que necesita sesión iniciada —ver el nivel
// ya guardado, el listado del docente— queda fuera del alcance de una batería
// sin navegador, y se dice en lugar de fingir que se cubre.
//
//   node qa/paso1.mjs
import { readFileSync } from "node:fs";

import {
  alumnosDelPanel,
  dificultadesRecurrentes,
  metricasDelGrupo,
} from "../lib/docente/metricas.ts";
import {
  clasificarNivel,
  ETIQUETA_NIVEL,
  DESCRIPCION_NIVEL,
  TOTAL_PREGUNTAS,
  TRAMOS,
} from "../lib/diagnostico/clasificar.ts";

const BASE = process.env.BASE_URL || "http://localhost:3000";

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
console.log(" PASO 1 — fundación: diagnóstico, roles y registro");
console.log("═══════════════════════════════════════════════════════════\n");

// ── A. La regla de corte ─────────────────────────────────────────────────────
// 0-2 Básico · 3-4 Intermedio · 5 Avanzado. Es la regla que el cliente verifica
// a mano en cada entrega ("responde 2 bien y 3 mal → debe salir Básico"), así
// que conviene que falle aquí antes que en su prueba.
console.log(" · Regla de corte del diagnóstico");

const esperado = ["BASICO", "BASICO", "BASICO", "INTERMEDIO", "INTERMEDIO", "AVANZADO"];
for (let aciertos = 0; aciertos <= TOTAL_PREGUNTAS; aciertos++) {
  const nivel = clasificarNivel(aciertos);
  check(
    `${aciertos} de ${TOTAL_PREGUNTAS} aciertos → ${esperado[aciertos]}`,
    nivel === esperado[aciertos],
    `obtenido: ${nivel}`,
  );
}

// Los bordes son lo que se mueve sin querer al tocar los tramos.
check("el umbral de Intermedio está en 3, no en 2", clasificarNivel(2) !== clasificarNivel(3));
check("el umbral de Avanzado está en 5, no en 4", clasificarNivel(4) !== clasificarNivel(5));
check("sólo el pleno es Avanzado", clasificarNivel(TOTAL_PREGUNTAS) === "AVANZADO");

// Los tramos cubren todo el rango, sin huecos ni solapes: un recuento sin
// tramo dejaría el diagnóstico sin nivel que asignar.
let cubierto = true;
for (let n = 0; n <= TOTAL_PREGUNTAS; n++) {
  if (TRAMOS.filter((t) => n >= t.min && n <= t.max).length !== 1) cubierto = false;
}
check("cada recuento cae en un tramo y sólo en uno", cubierto);

// Un recuento imposible es un fallo de programación: se lanza en lugar de
// redondear en silencio hasta el tramo más cercano.
for (const invalido of [-1, TOTAL_PREGUNTAS + 1, 2.5]) {
  let lanzo = false;
  try {
    clasificarNivel(invalido);
  } catch {
    lanzo = true;
  }
  check(`un recuento imposible (${invalido}) se rechaza, no se redondea`, lanzo);
}

// Cada nivel tiene su etiqueta y su descripción: sin ellas, el alumno vería la
// clave interna del enum en pantalla.
for (const tramo of TRAMOS) {
  check(
    `${tramo.nivel} tiene etiqueta y descripción para el alumno`,
    Boolean(ETIQUETA_NIVEL[tramo.nivel]) && Boolean(DESCRIPCION_NIVEL[tramo.nivel]),
  );
}

// ── B. Control de acceso ─────────────────────────────────────────────────────
console.log("\n · Rutas protegidas y rutas públicas");

async function estado(ruta, opciones = {}) {
  const r = await fetch(`${BASE}${ruta}`, { redirect: "manual", ...opciones });
  return { codigo: r.status, destino: r.headers.get("location") || "" };
}

try {
  await fetch(`${BASE}/login`, { redirect: "manual" });
} catch {
  console.log(`\n   ✗ No hay servidor en ${BASE}. Levántalo con: npm run start\n`);
  process.exit(1);
}

// Sin sesión, toda zona privada devuelve al login, y con la ruta a la que se
// quería ir: si no, el alumno entra y aterriza en un sitio que no pidió.
for (const ruta of [
  "/estudiante",
  "/estudiante/leccion",
  "/estudiante/diagnostico",
  "/docente",
  "/admin",
]) {
  const { codigo, destino } = await estado(ruta);
  check(
    `sin sesión, ${ruta} devuelve al login`,
    codigo >= 300 && codigo < 400 && destino.includes("/login"),
    `status=${codigo} destino=${destino || "ninguno"}`,
  );
  check(
    `${ruta} conserva a dónde se quería ir`,
    destino.includes("volverA"),
    `destino=${destino || "ninguno"}`,
  );
}

// Y las públicas siguen abiertas: proteger de más deja fuera a quien viene a
// registrarse.
for (const ruta of ["/", "/login", "/registro"]) {
  const { codigo } = await estado(ruta);
  check(`${ruta} es pública`, codigo === 200, `status=${codigo}`);
}

// Las rutas de API no redirigen: responden 401. Un 302 a una página HTML
// rompería a cualquier cliente que espere JSON.
const diagnosticoSinSesion = await estado("/api/diagnostico");
check(
  "la API del diagnóstico responde 401 sin sesión, no un redirect",
  diagnosticoSinSesion.codigo === 401,
  `status=${diagnosticoSinSesion.codigo}`,
);

const enviarDiagnostico = await estado("/api/diagnostico", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ respuestas: [] }),
});
check(
  "enviar un diagnóstico sin sesión se rechaza",
  enviarDiagnostico.codigo === 401,
  `status=${enviarDiagnostico.codigo}`,
);

// ── C. El registro valida antes de crear ─────────────────────────────────────
console.log("\n · Validación del registro");

const registros = [
  { nombre: "sin datos", cuerpo: {} },
  { nombre: "correo que no es un correo", cuerpo: { email: "noesuncorreo", password: "12345678", nombre: "Ana" } },
  { nombre: "contraseña demasiado corta", cuerpo: { email: "ana@ejemplo.com", password: "123", nombre: "Ana" } },
  { nombre: "sin nombre", cuerpo: { email: "ana@ejemplo.com", password: "12345678" } },
];
for (const caso of registros) {
  const r = await fetch(`${BASE}/api/registro`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(caso.cuerpo),
  });
  check(`el registro rechaza: ${caso.nombre}`, r.status === 400, `status=${r.status}`);
}

// Un cuerpo que no es JSON no puede tumbar la ruta.
const registroRoto = await fetch(`${BASE}/api/registro`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: "{esto no es json",
});
check(
  "un cuerpo mal formado se rechaza sin romper la ruta",
  registroRoto.status === 400,
  `status=${registroRoto.status}`,
);

// ── D. El banco del diagnóstico ──────────────────────────────────────────────
// La corrección la hace el SERVIDOR. Que la respuesta correcta no viaje al
// navegador no es un detalle: si viajara, bastaría con abrir las herramientas
// de desarrollo para sacar Avanzado.
console.log("\n · El diagnóstico no entrega sus respuestas");

const fuenteRuta = await import("node:fs").then((fs) =>
  fs.readFileSync(new URL("../app/api/diagnostico/route.ts", import.meta.url), "utf8"),
);

/** El código sin comentarios: el campo se NOMBRA al documentar por qué no viaja. */
const sinComentarios = (fuente) =>
  fuente.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ 	]*\/\/.*$/gm, "");

const codigo = sinComentarios(fuenteRuta);
const inicioPost = codigo.indexOf("export async function POST");
const listado = codigo.slice(0, inicioPost);
check(
  "el listado de preguntas no selecciona la respuesta correcta",
  !/respuestaCorrecta/.test(listado),
  "la clave de corrección se sirve al navegador",
);
check(
  "la corrección sí la lee, en el servidor",
  /respuestaCorrecta/.test(codigo.slice(inicioPost)),
);
check(
  "el diagnóstico son 5 preguntas",
  TOTAL_PREGUNTAS === 5,
  `TOTAL_PREGUNTAS=${TOTAL_PREGUNTAS}`,
);


// ── El despliegue se actualiza solo ──────────────────────────────────────────
// El catálogo de reglas viaja en la SEMILLA. Un despliegue con código nuevo y
// semilla vieja se ve perfecto por fuera y enseña la regla equivocada por
// dentro: la fase de "Reglas y propiedades" compone una tarjeta que no es la
// que se está narrando. Por eso la semilla tiene que correr en cada despliegue,
// y el estado tiene que poder comprobarse sin consola.
console.log("\n · La base de datos se actualiza en cada despliegue");

{
  const paquete = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  const construccionVercel = paquete.scripts?.["vercel-build"] ?? "";

  check(
    "el build de despliegue aplica las migraciones",
    /prisma migrate deploy/.test(construccionVercel),
    `vercel-build: ${construccionVercel}`,
  );
  check(
    "el build de despliegue siembra la base",
    /prisma\/seed\.ts/.test(construccionVercel),
    `vercel-build: ${construccionVercel}`,
  );
  // El orden importa: sembrar antes de migrar fallaría, y compilar antes de
  // sembrar dejaría el primer arranque sin datos.
  check(
    "migra, siembra y luego compila, en ese orden",
    construccionVercel.indexOf("migrate deploy") < construccionVercel.indexOf("seed.ts") &&
      construccionVercel.indexOf("seed.ts") < construccionVercel.indexOf("next build"),
    `vercel-build: ${construccionVercel}`,
  );

  // Y que Vercel use ESE script, y no el `build` de siempre: el ajuste del
  // panel no se ve desde el repositorio, así que se fija aquí.
  let vercel = null;
  try {
    vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  } catch {
    vercel = null;
  }
  check(
    "vercel.json fija el comando de construcción",
    vercel?.buildCommand === "npm run vercel-build",
    `buildCommand: ${vercel?.buildCommand ?? "(sin vercel.json)"}`,
  );

  // La semilla ACTUALIZA lo que ya existe: si sólo creara, una regla que cambia
  // de nombre o de enunciado se quedaría con el texto viejo para siempre.
  const semilla = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
  check(
    "la semilla actualiza las reglas que ya existen, no sólo las crea",
    /reglaMatematica\.upsert\(\{[\s\S]{0,120}where: \{ clave: r\.clave \}[\s\S]{0,60}update:/.test(semilla),
  );

  // Y el estado se puede comprobar desde el navegador, sin consola: la salud
  // dice cuántas reglas hay y cuántas trae el código.
  const salud = readFileSync(new URL("../app/api/health/route.ts", import.meta.url), "utf8");
  check(
    "la salud informa del catálogo de reglas",
    /reglas_en_base:/.test(salud) && /reglas_esperadas:/.test(salud),
  );
  check(
    "un catálogo desfasado se declara sin sembrar, no ok",
    /reglasEnBase < reglasEsperadas/.test(salud) && /estado = "sin_sembrar"/.test(salud),
  );
}


// ── El panel docente lee la persistencia real ───────────────────────────────
// El panel mostraba los estudiantes y su nivel, y las métricas eran una tarjeta
// vacía con un "corresponden al Paso 4". Las tablas que las alimentan —sesiones,
// progreso y catálogo de errores— llevan tiempo llenándose con lo que hacen los
// alumnos. El cálculo se comprueba aquí con datos de mentira: no hace falta que
// haya alumnos reales para saber que los porcentajes salen bien.
console.log("\n · Métricas del panel docente");

{
  const alumnosBase = [
    { perfilId: "p1", nombre: "Frances", email: "f@x.com", nivel: "INTERMEDIO", sesionesCompletadas: 4, ultimaSesion: null },
    { perfilId: "p2", nombre: "Juan", email: "j@x.com", nivel: "BASICO", sesionesCompletadas: 2, ultimaSesion: null },
    { perfilId: "p3", nombre: "María", email: "m@x.com", nivel: "AVANZADO", sesionesCompletadas: 6, ultimaSesion: null },
    { perfilId: "p4", nombre: "Sin diagnosticar", email: "s@x.com", nivel: null, sesionesCompletadas: 0, ultimaSesion: null },
  ];
  // p1: 17 de 20 → 85 %. p2: 5 de 8 → 63 %. p3: 19 de 20 → 95 %. p4: nada.
  const intentos = [
    ...Array.from({ length: 20 }, (_, i) => ({ perfilId: "p1", tema: "ARITMETICA", acierto: i < 17 })),
    ...Array.from({ length: 8 }, (_, i) => ({ perfilId: "p2", tema: "ARITMETICA", acierto: i < 5 })),
    ...Array.from({ length: 20 }, (_, i) => ({ perfilId: "p3", tema: "DERIVADAS", acierto: i < 19 })),
  ];
  const errores = [
    { tema: "ARITMETICA", tipoError: "llevada", ocurrencias: 18 },
    { tema: "DERIVADAS", tipoError: "exponente", ocurrencias: 7 },
    { tema: "ARITMETICA", tipoError: "llevada", ocurrencias: 4 },
  ];

  const alumnos = alumnosDelPanel(alumnosBase, intentos);
  const porNombre = (n) => alumnos.find((a) => a.nombre === n);

  check("cada alumno lleva su tasa de aciertos", porNombre("Frances").tasaAciertos === 85, `obtenido: ${porNombre("Frances").tasaAciertos}`);
  check("y se redondea a entero", porNombre("Juan").tasaAciertos === 63, `obtenido: ${porNombre("Juan").tasaAciertos}`);
  check("quien no ha respondido nada no tiene tasa", porNombre("Sin diagnosticar").tasaAciertos === null);
  // El estado se lee de un vistazo, y no se inventa para quien no ha empezado.
  check("un 95 % es óptimo", porNombre("María").estado === "optimo");
  check("un 85 % va al día", porNombre("Frances").estado === "al_dia");
  check("un 63 % necesita refuerzo", porNombre("Juan").estado === "refuerzo");
  check(
    "sin diagnóstico no se inventa un estado",
    porNombre("Sin diagnosticar").estado === "sin_empezar",
  );
  // Primero quien más ha trabajado: es a quien el docente puede seguir.
  check(
    "los alumnos vienen del que más ha practicado al que menos",
    alumnos.map((a) => a.nombre).join(",") === "Frances,María,Juan,Sin diagnosticar",
    `obtenido: ${alumnos.map((a) => a.nombre).join(",")}`,
  );

  const metricas = metricasDelGrupo(alumnosBase, intentos, errores);
  check("el total de alumnos", metricas.totalAlumnos === 4);
  check("cuántos hicieron el diagnóstico", metricas.conDiagnostico === 3);
  check("y su porcentaje", metricas.diagnosticoCompletado === 75, `obtenido: ${metricas.diagnosticoCompletado}`);
  // 41 aciertos de 48 intentos → 85 %.
  check("la tasa global del grupo", metricas.tasaAciertosGlobal === 85, `obtenido: ${metricas.tasaAciertosGlobal}`);
  check("las sesiones COMPLETADAS se suman", metricas.sesionesCompletadas === 12, `obtenido: ${metricas.sesionesCompletadas}`);
  check("y el tema con más errores", metricas.temaMasDificil === "ARITMETICA", `obtenido: ${metricas.temaMasDificil}`);

  // Un grupo vacío no puede dar un porcentaje: se dice que no hay dato en vez
  // de enseñar un 0 %, que se lee como "fallan todo".
  const vacio = metricasDelGrupo([], [], []);
  check("sin alumnos no se inventa un porcentaje", vacio.diagnosticoCompletado === null && vacio.tasaAciertosGlobal === null);
  check("ni un tema más difícil", vacio.temaMasDificil === null);

  const dificultades = dificultadesRecurrentes(errores);
  check(
    "las dificultades se agrupan por tema y tipo",
    dificultades.length === 2,
    `obtenidas: ${dificultades.length}`,
  );
  check(
    "y se acumulan las repetidas",
    dificultades[0].ocurrencias === 22,
    `obtenido: ${dificultades[0].ocurrencias}`,
  );
  // 22 de 29 → 76 %; 7 de 29 → 24 %.
  check("con su peso sobre el total", dificultades[0].peso === 76 && dificultades[1].peso === 24,
    `obtenidos: ${dificultades.map((d) => d.peso).join(", ")}`);
  check("de la más frecuente a la menos", dificultades[0].ocurrencias >= dificultades[1].ocurrencias);
  check("sin errores, el mapa está vacío", dificultadesRecurrentes([]).length === 0);
  check(
    "un error con cero ocurrencias no cuenta",
    dificultadesRecurrentes([{ tema: "X", tipoError: "y", ocurrencias: 0 }]).length === 0,
  );

  // Y la página consulta de verdad esas tablas.
  const fuentePanel = readFileSync(
    new URL("../app/docente/page.tsx", import.meta.url),
    "utf8",
  );
  check(
    "el panel lee las sesiones terminadas",
    /sesiones: \{\s*\n?\s*where: \{ finalizadaEn: \{ not: null \} \}/.test(fuentePanel),
    "una sesión empezada y abandonada no es trabajo hecho",
  );
  check("lee el progreso calificado", /prisma\.registroProgreso\.findMany/.test(fuentePanel));
  check("y el catálogo de errores", /prisma\.registroError\.findMany/.test(fuentePanel));
  check(
    "ya no dice que las métricas son de otro paso",
    !/corresponden al Paso 4/i.test(fuentePanel),
  );
}


// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(` Aprobadas: ${ok} · Fallidas: ${fallos.length}`);

if (fallos.length) {
  console.log("\n ❌ PASO 1 RECHAZADO. Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}

console.log("\n ✅ PASO 1 APROBADO — fundación, roles y diagnóstico en pie.\n");
