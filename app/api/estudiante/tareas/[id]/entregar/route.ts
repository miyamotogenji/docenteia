import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { explicarFalloDeBaseDeDatos } from "@/lib/errores-bd";
import { entregaSchema, puedeEntregar } from "@/lib/docente/aulas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EL ALUMNO ENTREGA (O REINTENTA) UNA TAREA (HITO 3).
 *
 * «Registra o actualiza la EntregaTarea, validando que no se exceda
 * limiteReintentos ni se intente entregar pasada la fechaVencimiento.» Las
 * dos puertas las decide `puedeEntregar`, la misma función que calcula el
 * estado que ve el alumno en `GET /api/estudiante/tareas`: no hay una regla
 * para mostrar el botón y otra distinta para aceptar el clic.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await auth();
  if (!sesion?.user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (sesion.user.rol !== "ESTUDIANTE") {
    return NextResponse.json({ error: "Sólo un alumno puede entregar una tarea." }, { status: 403 });
  }
  const { id: tareaId } = await params;

  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    return NextResponse.json({ error: "El cuerpo de la petición no es JSON válido." }, { status: 400 });
  }
  const parsed = entregaSchema.safeParse(cuerpo);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Entrega no válida." },
      { status: 400 },
    );
  }

  try {
    const tarea = await prisma.tarea.findUnique({ where: { id: tareaId } });
    if (!tarea) {
      return NextResponse.json({ error: "Esa tarea no existe." }, { status: 404 });
    }

    // El alumno tiene que estar matriculado en el aula de la tarea: sin esto,
    // cualquier alumno podría entregar una tarea de un aula ajena con sólo
    // saber su id.
    const matricula = await prisma.matricula.findUnique({
      where: { aulaId_estudianteId: { aulaId: tarea.aulaId, estudianteId: sesion.user.id } },
    });
    if (!matricula) {
      return NextResponse.json(
        { error: "No estás matriculado en el aula de esta tarea." },
        { status: 403 },
      );
    }

    const existente = await prisma.entregaTarea.findUnique({
      where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
    });

    const bloqueo = puedeEntregar(tarea, existente);
    if (bloqueo) {
      return NextResponse.json({ error: bloqueo }, { status: 409 });
    }

    // El desglose es del intento que se acaba de entregar: reemplaza al
    // anterior entero, no se acumula ("Ver resultado" muestra el ÚLTIMO
    // intento, igual que `puntaje" ya hacía).
    let detalle = parsed.data.detalle ?? (existente?.detalle as Prisma.InputJsonValue | undefined) ?? [];

    // RESPUESTA CORRECTA, SÓLO DEL SERVIDOR. Un ejercicio del banco trae su
    // `ejercicioId`; el navegador nunca manda su `respuestaCorrecta` —la
    // tarea ya está entregada a esta altura, así que revelarla aquí ya no
    // es un atajo para adivinar—. Se pisa lo que haya llegado, no se confía
    // en lo que mande el cliente para este campo en concreto.
    if (Array.isArray(detalle) && tarea.ejercicioIds.length > 0) {
      const idsDelDetalle = detalle
        .map((d) => (d && typeof d === "object" && "ejercicioId" in d ? (d as { ejercicioId?: string }).ejercicioId : null))
        .filter((id): id is string => Boolean(id));
      if (idsDelDetalle.length > 0) {
        const ejercicios = await prisma.ejercicio.findMany({
          where: { id: { in: idsDelDetalle } },
          select: { id: true, respuestaCorrecta: true },
        });
        const respuestaPorId = new Map(ejercicios.map((e) => [e.id, e.respuestaCorrecta]));
        detalle = detalle.map((d) => {
          if (!d || typeof d !== "object" || !("ejercicioId" in d)) return d;
          const entrada = d as { ejercicioId?: string; respuestaCorrecta?: string | null };
          const real = entrada.ejercicioId ? respuestaPorId.get(entrada.ejercicioId) : undefined;
          return real !== undefined ? { ...entrada, respuestaCorrecta: real } : d;
        });
      }
    }

    const entrega = await prisma.entregaTarea.upsert({
      where: { tareaId_estudianteId: { tareaId, estudianteId: sesion.user.id } },
      create: {
        tareaId,
        estudianteId: sesion.user.id,
        intentosUsados: 1,
        puntaje: parsed.data.puntaje ?? null,
        completada: parsed.data.completada ?? false,
        fechaEntrega: parsed.data.completada ? new Date() : null,
        detalle,
      },
      update: {
        intentosUsados: { increment: 1 },
        puntaje: parsed.data.puntaje ?? existente?.puntaje ?? null,
        completada: parsed.data.completada ?? existente?.completada ?? false,
        fechaEntrega: parsed.data.completada ? new Date() : (existente?.fechaEntrega ?? null),
        detalle,
      },
    });

    return NextResponse.json({ entrega });
  } catch (e) {
    const infra = explicarFalloDeBaseDeDatos(e);
    if (infra) {
      console.error(`[estudiante/tareas/entregar] ${infra.registro}`);
      return NextResponse.json({ error: infra.mensaje }, { status: infra.status });
    }
    console.error("[estudiante/tareas/entregar] fallo al registrar:", e);
    return NextResponse.json({ error: "No se pudo registrar la entrega." }, { status: 500 });
  }
}
