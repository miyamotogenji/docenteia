import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { clasificarNivel } from "@/lib/diagnostico/clasificar";

export const runtime = "nodejs";

/**
 * GET /api/diagnostico
 *
 * Devuelve el banco de preguntas activo, ordenado.
 *
 * IMPORTANTE: `respuestaCorrecta` NO se incluye en la respuesta. La corrección
 * es competencia exclusiva del servidor; si la clave viajara al navegador, el
 * diagnóstico sería trivial de falsear abriendo las herramientas de desarrollo.
 */
export async function GET() {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }

  const preguntas = await prisma.preguntaDiagnostico.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      clave: true,
      orden: true,
      tema: true,
      enunciado: true,
      expresion: true,
      opciones: true,
    },
  });

  if (preguntas.length === 0) {
    return NextResponse.json(
      {
        error:
          "El banco de preguntas está vacío. Ejecuta la semilla: npm run db:seed",
      },
      { status: 503 },
    );
  }

  // Si ya hizo el diagnóstico, se informa: la interfaz muestra el resultado en
  // lugar de volver a preguntar.
  const perfil = sesion.user.perfilId
    ? await prisma.perfilEstudiante.findUnique({
        where: { id: sesion.user.perfilId },
        select: { nivelActual: true, nivelAsignadoEn: true },
      })
    : null;

  return NextResponse.json({
    preguntas,
    total: preguntas.length,
    yaCompletado: Boolean(perfil?.nivelActual),
    nivelActual: perfil?.nivelActual ?? null,
    nivelAsignadoEn: perfil?.nivelAsignadoEn ?? null,
  });
}

const envioSchema = z.object({
  respuestas: z
    .array(
      z.object({
        preguntaId: z.string().min(1),
        respuestaDada: z.string().min(1).max(200),
        tiempoMs: z.number().int().nonnegative().max(3_600_000).optional(),
      }),
    )
    .min(1)
    .max(20),
});

/**
 * POST /api/diagnostico
 *
 * Corrige el intento, clasifica el nivel con la regla de corte determinista
 * (0–2 BÁSICO · 3–4 INTERMEDIO · 5 AVANZADO) y lo persiste en el perfil.
 * En ningún punto interviene la IA.
 */
export async function POST(req: Request) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json(
      { error: "Sólo un estudiante realiza el diagnóstico inicial." },
      { status: 403 },
    );
  }

  const perfilId = sesion.user.perfilId;
  if (!perfilId) {
    return NextResponse.json(
      { error: "La cuenta no tiene perfil académico asociado." },
      { status: 409 },
    );
  }

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json(
      { error: "El cuerpo de la petición no es JSON válido." },
      { status: 400 },
    );
  }

  const parsed = envioSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Respuestas no válidas.", detalles: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { respuestas } = parsed.data;

  // Se cargan las preguntas activas CON su clave, del lado del servidor.
  const preguntas = await prisma.preguntaDiagnostico.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: { id: true, tema: true, respuestaCorrecta: true },
  });
  if (preguntas.length === 0) {
    return NextResponse.json(
      { error: "El banco de preguntas está vacío." },
      { status: 503 },
    );
  }

  const porId = new Map(preguntas.map((p) => [p.id, p]));

  // Se exige que el envío cubra exactamente el banco activo: ni preguntas
  // desconocidas, ni respuestas repetidas, ni un diagnóstico a medias que
  // luego se clasificaría con un recuento que no significa nada.
  const idsEnviados = new Set(respuestas.map((r) => r.preguntaId));
  if (idsEnviados.size !== respuestas.length) {
    return NextResponse.json(
      { error: "Hay respuestas duplicadas para la misma pregunta." },
      { status: 400 },
    );
  }
  const desconocida = respuestas.find((r) => !porId.has(r.preguntaId));
  if (desconocida) {
    return NextResponse.json(
      { error: `Pregunta no reconocida: ${desconocida.preguntaId}` },
      { status: 400 },
    );
  }
  if (idsEnviados.size !== preguntas.length) {
    return NextResponse.json(
      {
        error: `El diagnóstico está incompleto: se esperaban ${preguntas.length} respuestas y llegaron ${idsEnviados.size}.`,
      },
      { status: 400 },
    );
  }

  // ── Corrección determinista ───────────────────────────────────────────────
  const corregidas = respuestas.map((r) => {
    const pregunta = porId.get(r.preguntaId)!;
    const correcta =
      r.respuestaDada.trim().toLowerCase() ===
      pregunta.respuestaCorrecta.trim().toLowerCase();
    return { ...r, tema: pregunta.tema, correcta };
  });

  const aciertos = corregidas.filter((r) => r.correcta).length;
  const nivel = clasificarNivel(aciertos, preguntas.length);

  try {
    const resultado = await prisma.$transaction(async (tx) => {
      const perfil = await tx.perfilEstudiante.findUnique({
        where: { id: perfilId },
        select: { nivelActual: true },
      });
      if (!perfil) throw new Error("PERFIL_NO_ENCONTRADO");

      const intento = await tx.intentoDiagnostico.create({
        data: {
          perfilId,
          aciertos,
          totalPreguntas: preguntas.length,
          nivelResultante: nivel,
          completado: true,
          finalizadoEn: new Date(),
          respuestas: {
            create: corregidas.map((r) => ({
              preguntaId: r.preguntaId,
              respuestaDada: r.respuestaDada,
              correcta: r.correcta,
              tiempoMs: r.tiempoMs ?? null,
            })),
          },
        },
        select: { id: true },
      });

      await tx.perfilEstudiante.update({
        where: { id: perfilId },
        data: { nivelActual: nivel, nivelAsignadoEn: new Date() },
      });

      await tx.historialNivel.create({
        data: {
          perfilId,
          nivelAnterior: perfil.nivelActual,
          nivelNuevo: nivel,
          motivo: "DIAGNOSTICO_INICIAL",
          detalle: `${aciertos} de ${preguntas.length} aciertos en el diagnóstico inicial.`,
        },
      });

      return intento;
    });

    return NextResponse.json({
      ok: true,
      intentoId: resultado.id,
      aciertos,
      total: preguntas.length,
      nivel,
      // Se devuelve qué temas falló, no cuál era la respuesta correcta: el
      // alumno debe aprenderlas, no copiarlas.
      temasFallados: corregidas.filter((r) => !r.correcta).map((r) => r.tema),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "PERFIL_NO_ENCONTRADO") {
      return NextResponse.json(
        { error: "El perfil académico ya no existe." },
        { status: 409 },
      );
    }
    console.error("[diagnostico] fallo al guardar el intento:", e);
    return NextResponse.json(
      { error: "No se pudo guardar el diagnóstico." },
      { status: 500 },
    );
  }
}
