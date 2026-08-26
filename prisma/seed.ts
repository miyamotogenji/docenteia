/**
 * Semilla de la base de datos.
 *
 * Deja el sistema en un estado desde el que se puede probar el flujo completo
 * del Paso 1 sin tocar SQL a mano:
 *   1. La materia y el árbol de conocimiento de los cinco temas de PRE Light.
 *   2. El banco de preguntas del diagnóstico (desde el JSON del repositorio).
 *   3. Un usuario DOCENTE y uno ADMIN, que el registro público no puede crear.
 *
 * Es idempotente: se puede ejecutar las veces que haga falta.
 *   npm run db:seed
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

import {
  adaptarBanco,
  type PreguntaOficial,
  type TemaEnum,
} from "../lib/diagnostico/banco.ts";

const prisma = new PrismaClient();
const aqui = dirname(fileURLToPath(import.meta.url));

// ── Árbol de conocimiento base ───────────────────────────────────────────────
// Un nodo raíz por tema garantizado y sus subtemas. Es la estructura mínima
// sobre la que el Paso 2 colgará el banco de ejercicios generados.
const ARBOL: Array<{
  clave: string;
  tema: TemaEnum;
  titulo: string;
  descripcion: string;
  hijos: Array<{ clave: string; titulo: string; nivel: "BASICO" | "INTERMEDIO" | "AVANZADO" }>;
}> = [
  {
    clave: "aritmetica",
    tema: "ARITMETICA",
    titulo: "Aritmética básica",
    descripcion: "Las cuatro operaciones y la jerarquía entre ellas.",
    hijos: [
      { clave: "aritmetica.jerarquia", titulo: "Jerarquía de operaciones", nivel: "BASICO" },
      { clave: "aritmetica.negativos", titulo: "Números negativos", nivel: "INTERMEDIO" },
      { clave: "aritmetica.potencias", titulo: "Potencias y raíces", nivel: "AVANZADO" },
    ],
  },
  {
    clave: "fracciones",
    tema: "FRACCIONES",
    titulo: "Fracciones",
    descripcion: "Operar con fracciones y simplificar el resultado.",
    hijos: [
      { clave: "fracciones.suma", titulo: "Suma y resta con igual denominador", nivel: "BASICO" },
      { clave: "fracciones.comun", titulo: "Denominador común", nivel: "INTERMEDIO" },
      { clave: "fracciones.producto", titulo: "Producto y cociente", nivel: "AVANZADO" },
    ],
  },
  {
    clave: "ecuaciones-lineales",
    tema: "ECUACIONES_LINEALES",
    titulo: "Ecuaciones lineales",
    descripcion: "Despejar la incógnita en ecuaciones de primer grado.",
    hijos: [
      { clave: "lineales.despeje", titulo: "Despeje directo", nivel: "BASICO" },
      { clave: "lineales.parentesis", titulo: "Con paréntesis", nivel: "INTERMEDIO" },
      { clave: "lineales.denominador", titulo: "Con denominador o decimales", nivel: "AVANZADO" },
    ],
  },
  {
    clave: "factorizacion",
    tema: "FACTORIZACION",
    titulo: "Factorización",
    descripcion: "Diferencia de cuadrados y factor común.",
    hijos: [
      { clave: "factorizacion.comun", titulo: "Factor común", nivel: "BASICO" },
      { clave: "factorizacion.cuadrados", titulo: "Diferencia de cuadrados", nivel: "INTERMEDIO" },
    ],
  },
  {
    clave: "derivadas",
    tema: "DERIVADAS",
    titulo: "Derivadas",
    descripcion: "Regla de la potencia y derivada de polinomios.",
    hijos: [
      { clave: "derivadas.potencia", titulo: "Regla de la potencia", nivel: "INTERMEDIO" },
      { clave: "derivadas.polinomio", titulo: "Polinomios término a término", nivel: "AVANZADO" },
    ],
  },
];

// Credenciales de demostración. Están documentadas en el README y DEBEN
// cambiarse antes de cualquier despliegue público; se pueden sobrescribir por
// variables de entorno para no fijarlas en el código de un entorno real.
const DEMO = {
  admin: {
    email: process.env.SEED_ADMIN_EMAIL || "admin@mentoriamath.local",
    password: process.env.SEED_ADMIN_PASSWORD || "Admin-2026",
    nombre: "Administrador del sistema",
  },
  docente: {
    email: process.env.SEED_DOCENTE_EMAIL || "docente@mentoriamath.local",
    password: process.env.SEED_DOCENTE_PASSWORD || "Docente-2026",
    nombre: "Docente de demostración",
  },
};

async function main() {
  console.log("→ Sembrando la base de datos…");

  // 1. Materia
  const matematicas = await prisma.materia.upsert({
    where: { codigo: "MAT" },
    update: {},
    create: { codigo: "MAT", nombre: "Matemáticas" },
  });
  console.log(`  ✓ Materia: ${matematicas.nombre}`);

  // 2. Árbol de conocimiento
  let nodos = 0;
  for (const raiz of ARBOL) {
    const padre = await prisma.nodoConocimiento.upsert({
      where: { clave: raiz.clave },
      update: { titulo: raiz.titulo, descripcion: raiz.descripcion },
      create: {
        clave: raiz.clave,
        tema: raiz.tema,
        titulo: raiz.titulo,
        descripcion: raiz.descripcion,
      },
    });
    nodos++;
    for (const [i, hijo] of raiz.hijos.entries()) {
      await prisma.nodoConocimiento.upsert({
        where: { clave: hijo.clave },
        update: { titulo: hijo.titulo, nivel: hijo.nivel, padreId: padre.id, orden: i },
        create: {
          clave: hijo.clave,
          tema: raiz.tema,
          titulo: hijo.titulo,
          nivel: hijo.nivel,
          padreId: padre.id,
          orden: i,
        },
      });
      nodos++;
    }
  }
  console.log(`  ✓ Árbol de conocimiento: ${nodos} nodos`);

  // 3. Banco de preguntas del diagnóstico (formato oficial del cliente)
  const ruta = join(aqui, "seed-data", "preguntas-diagnostico.json");
  const oficial = JSON.parse(readFileSync(ruta, "utf8")) as PreguntaOficial[];

  // adaptarBanco valida además lo que sólo se ve mirando el conjunto: claves
  // repetidas y dos preguntas activas para el mismo tema. Si algo no cuadra,
  // lanza y la semilla se detiene antes de escribir nada.
  const preguntas = adaptarBanco(oficial);

  for (const p of preguntas) {
    await prisma.preguntaDiagnostico.upsert({
      where: { clave: p.clave },
      update: {
        orden: p.orden,
        tema: p.tema,
        enunciado: p.enunciado,
        opciones: p.opciones,
        respuestaCorrecta: p.respuestaCorrecta,
        activa: true,
      },
      create: {
        clave: p.clave,
        orden: p.orden,
        tema: p.tema,
        enunciado: p.enunciado,
        opciones: p.opciones,
        respuestaCorrecta: p.respuestaCorrecta,
      },
    });
  }

  // Lo que ya no está en el fichero deja de estar vigente. Se DESACTIVA en vez
  // de borrarse: eliminar una pregunta se llevaría por delante, en cascada, las
  // respuestas de los alumnos que ya la contestaron.
  const retiradas = await prisma.preguntaDiagnostico.updateMany({
    where: { clave: { notIn: preguntas.map((p) => p.clave) }, activa: true },
    data: { activa: false },
  });

  console.log(`  ✓ Diagnóstico: ${preguntas.length} preguntas activas`);
  if (retiradas.count > 0) {
    console.log(`    (${retiradas.count} pregunta(s) anterior(es) desactivada(s), historial intacto)`);
  }

  // 4. Usuarios que el registro público no crea
  for (const [rol, datosUsuario] of [
    ["ADMIN", DEMO.admin],
    ["DOCENTE", DEMO.docente],
  ] as const) {
    const passwordHash = await bcrypt.hash(datosUsuario.password, 10);
    await prisma.usuario.upsert({
      where: { email: datosUsuario.email },
      update: { rol, nombre: datosUsuario.nombre },
      create: {
        email: datosUsuario.email,
        nombre: datosUsuario.nombre,
        passwordHash,
        rol,
      },
    });
    console.log(`  ✓ Usuario ${rol}: ${datosUsuario.email}`);
  }

  console.log("\n  Semilla completada.");
  console.log("  Credenciales de demostración (cámbialas antes de desplegar):");
  console.log(`    ADMIN   → ${DEMO.admin.email} / ${DEMO.admin.password}`);
  console.log(`    DOCENTE → ${DEMO.docente.email} / ${DEMO.docente.password}`);
  console.log("    ESTUDIANTE → regístrate en http://localhost:3000/registro\n");
}

main()
  .catch((e) => {
    console.error("La semilla falló:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
