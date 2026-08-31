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

// ── Veredicto ────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════════════════════");
console.log(` Aprobadas: ${ok} · Fallidas: ${fallos.length}`);

if (fallos.length) {
  console.log("\n ❌ PASO 1 RECHAZADO. Fallos:");
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}

console.log("\n ✅ PASO 1 APROBADO — fundación, roles y diagnóstico en pie.\n");
