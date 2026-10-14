import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirDocente, fallo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * "EJERCICIOS DESARROLLADOS" (corrección QA): qué entregó un alumno
 * concreto, en las tareas de ESTA aula —lo que abre el enlace que aparece
 * debajo de cada matriculado en la ficha del aula.
 *
 * Reutiliza `EntregaTarea.detalle` —el mismo desglose por ejercicio que ya
 * usa el alumno en "Ver resultado"—, pero aquí sin ningún candado: el
 * docente SÍ puede ver la respuesta correcta de inmediato, entregada o no.
 * El anti-copia de esa otra ruta protege a un alumno de otro alumno, no al
 * docente de ver el trabajo de su propia clase.
 *
 * Mismo candado de titularidad que el resto de `/api/docente/aulas/[id]`:
 * sólo el docente DUEÑO del aula, y sólo sobre un alumno de verdad
 * matriculado en ella —conocer el id de un alumno ajeno no debe bastar
 * para ver su historial—.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; estudianteId: string }> },
) {
  const permiso = await exigirDocente();
  if (!permiso.ok) return permiso.respuesta;
  const { id: aulaId, estudianteId } = await params;

  try {
    const aula = await prisma.aula.findUnique({ where: { id: aulaId }, select: { docenteId: true } });
    if (!aula || aula.docenteId !== permiso.quien.usuarioId) return noEncontrado("El aula");

    const matricula = await prisma.matricula.findUnique({
      where: { aulaId_estudianteId: { aulaId, estudianteId } },
      select: { estudiante: { select: { id: true, nombre: true, email: true } } },
    });
    if (!matricula) return noEncontrado("Ese alumno, matriculado en esta aula,");

    const entregas = await prisma.entregaTarea.findMany({
      where: { estudianteId, tarea: { aulaId } },
      orderBy: { actualizadoEn: "desc" },
      select: {
        puntaje: true,
        intentosUsados: true,
        completada: true,
        fechaEntrega: true,
        detalle: true,
        tarea: {
          select: {
            id: true,
            titulo: true,
            fechaVencimiento: true,
            cantidadEjercicios: true,
            limiteReintentos: true,
          },
        },
      },
    });

    return NextResponse.json({
      estudiante: matricula.estudiante,
      entregas: entregas.map((e) => ({
        tareaId: e.tarea.id,
        titulo: e.tarea.titulo,
        fechaVencimiento: e.tarea.fechaVencimiento,
        cantidadEjercicios: e.tarea.cantidadEjercicios,
        limiteReintentos: e.tarea.limiteReintentos,
        puntaje: e.puntaje,
        intentosUsados: e.intentosUsados,
        completada: e.completada,
        fechaEntrega: e.fechaEntrega,
        detalle: e.detalle,
      })),
    });
  } catch (e) {
    return fallo(e, "docente/aulas/[id]/estudiantes/[estudianteId]/entregas:leer");
  }
}
