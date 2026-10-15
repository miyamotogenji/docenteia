import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { conflicto, fallo, noEncontrado } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/ejercicios/[id] (HITO 4 — checklist de cierre:
 * "Eliminación controlada" del banco, con su propio contrato bajo /admin).
 *
 * Misma regla que `DELETE /api/docente/ejercicios/[id]` —que `/admin/ejercicios`
 * sigue usando en la pantalla, porque el banco es uno solo para toda la
 * plataforma—: un ejercicio con progreso de algún alumno no se borra, se
 * archiva, para no dejar historial apuntando a un enunciado que ya no existe.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const { id } = await params;

  try {
    const ejercicio = await prisma.ejercicio.findUnique({
      where: { id },
      select: { id: true, _count: { select: { progreso: true } } },
    });
    if (!ejercicio) return noEncontrado("El ejercicio");

    if (ejercicio._count.progreso > 0) {
      return conflicto(
        `Este ejercicio ya lo han respondido ${ejercicio._count.progreso} vez/veces. Archívalo en lugar de borrarlo para no romper el historial de los alumnos.`,
      );
    }

    await prisma.ejercicio.delete({ where: { id } });
    return NextResponse.json({ borrado: true });
  } catch (e) {
    return fallo(e, "admin/ejercicios:borrar");
  }
}
