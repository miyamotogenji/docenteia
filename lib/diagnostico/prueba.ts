import type { NivelAcademico } from "@prisma/client";

import { prisma } from "../prisma.ts";
import { nivelDePartida } from "./grados.ts";
import { componerDiagnostico, type ItemDiagnostico } from "./seleccion.ts";

/**
 * La prueba de un alumno concreto, leída de la base de datos.
 *
 * Vive fuera de la ruta de API porque la componen DOS sitios: el endpoint
 * `/api/diagnostico` y la página `/estudiante/diagnostico`, que renderiza en
 * servidor. Mientras cada uno hacía su propia consulta, la página seguía
 * mostrando el banco entero —derivadas incluidas— aunque la API ya filtrara por
 * nivel. Una sola función evita que vuelvan a separarse.
 */

export interface PerfilParaPrueba {
  nivelActual: NivelAcademico | null;
  ciclo: string | null;
  grado: string | null;
}

export interface PruebaCompuesta {
  /** Nivel con el que se ha armado. */
  nivel: NivelAcademico;
  items: ItemDiagnostico[];
  /** De dónde sale ese nivel, para poder explicárselo al alumno. */
  origen: "diagnostico_previo" | "curso_declarado" | "por_defecto";
}

const CAMPOS_CATALOGO = {
  id: true,
  tema: true,
  nivel: true,
  enunciado: true,
  expresion: true,
  opciones: true,
  orden: true,
} as const;

export async function armarPrueba(perfil: PerfilParaPrueba): Promise<PruebaCompuesta> {
  const nivel = nivelDePartida(perfil);

  const [catalogo, comodines, banco] = await Promise.all([
    prisma.preguntaDiagnostico.findMany({
      where: { activa: true, nivel },
      orderBy: { orden: "asc" },
      select: CAMPOS_CATALOGO,
    }),
    // Comodines: preguntas sin nivel declarado. Sólo entran si el nivel se
    // queda corto de preguntas propias.
    prisma.preguntaDiagnostico.findMany({
      where: { activa: true, nivel: null },
      orderBy: { orden: "asc" },
      select: CAMPOS_CATALOGO,
    }),
    // El banco del docente: sólo lo PUBLICADO y VERIFICADO por el motor, que es
    // lo único que el servidor puede corregir sin margen de duda.
    prisma.ejercicio.findMany({
      where: {
        nivel,
        estado: "PUBLICADO",
        validado: true,
        plantilla: false,
        motor: { not: null },
      },
      // Orden estable: la prueba tiene que recomponerse igual al corregirla, y
      // `creadoEn` con el id de desempate no cambia entre peticiones.
      orderBy: [{ creadoEn: "asc" }, { id: "asc" }],
      take: 10,
      select: {
        id: true,
        enunciado: true,
        nivel: true,
        motor: true,
        respuestaCorrecta: true,
        plantilla: true,
      },
    }),
  ]);

  return {
    nivel,
    items: componerDiagnostico({ catalogo, banco, comodines }),
    origen: perfil.nivelActual
      ? "diagnostico_previo"
      : perfil.ciclo || perfil.grado
        ? "curso_declarado"
        : "por_defecto",
  };
}

/** Lee del perfil lo que hace falta para componer la prueba. */
export async function perfilParaPrueba(
  perfilId: string | null | undefined,
): Promise<(PerfilParaPrueba & { nivelAsignadoEn: Date | null }) | null> {
  if (!perfilId) return null;
  return prisma.perfilEstudiante.findUnique({
    where: { id: perfilId },
    select: { nivelActual: true, nivelAsignadoEn: true, ciclo: true, grado: true },
  });
}
