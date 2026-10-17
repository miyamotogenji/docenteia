import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { matriculaAdminSchema } from "@/lib/admin/aulas";
import { conflicto, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/matriculas (checklist actualizado de HITO 4, "Módulo de
 * Matrícula/Asignación: matricular alumnos directamente en un aula
 * específica sin depender únicamente del código de invitación").
 *
 * Mismas dos reglas que `POST /api/estudiante/unirse` —el aula tiene que
 * existir y estar activa, y nadie se matricula dos veces en la misma—, sólo
 * que aquí el SUPERADMIN elige directamente AMBOS lados (alumno y aula) en
 * vez de que el alumno aporte un código.
 */
export async function POST(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, matriculaAdminSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  try {
    const [estudiante, aula] = await Promise.all([
      prisma.usuario.findUnique({ where: { id: datos.estudianteId }, select: { id: true, rol: true } }),
      prisma.aula.findUnique({ where: { id: datos.aulaId }, select: { id: true, activa: true } }),
    ]);
    if (!estudiante) return noEncontrado("Ese alumno");
    if (estudiante.rol !== "ESTUDIANTE") {
      return conflicto("Sólo una cuenta de alumno puede matricularse en un aula.");
    }
    if (!aula) return noEncontrado("Esa aula");
    if (!aula.activa) return conflicto("Esa aula está inactiva: no admite matrículas nuevas.");

    const yaMatriculado = await prisma.matricula.findUnique({
      where: { aulaId_estudianteId: { aulaId: aula.id, estudianteId: estudiante.id } },
    });
    if (yaMatriculado) return conflicto("Ese alumno ya está matriculado en esa aula.");

    const matricula = await prisma.matricula.create({
      data: { aulaId: aula.id, estudianteId: estudiante.id },
    });

    return NextResponse.json({ matricula }, { status: 201 });
  } catch (e) {
    return fallo(e, "admin/matriculas:crear");
  }
}
