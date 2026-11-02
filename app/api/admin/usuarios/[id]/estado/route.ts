import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { conflicto, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { estadoUsuarioSchema } from "@/lib/admin/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/usuarios/[id]/estado (HITO 4 — checklist de cierre:
 * "Activar / Suspender acceso" como endpoint propio).
 *
 * Hace exactamente lo mismo que `PATCH /api/admin/usuarios/[id]` con
 * `{ activo }` —esa ruta ya lo cubre, y es la que usa el panel
 * `/admin/usuarios`—; ésta existe aparte porque el pliego de cierre la pide
 * con su propio contrato, separado de rol e institución. Misma protección:
 * ni auto-suspensión, ni cuenta inexistente en silencio.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  if (id === permiso.quien.usuarioId) {
    return conflicto("No puedes activar ni suspender tu propia cuenta desde el panel de administración.");
  }

  const cuerpo = await leerCuerpo(req, estadoUsuarioSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;

  try {
    const actual = await prisma.usuario.findUnique({ where: { id }, select: { activo: true } });
    if (!actual) return noEncontrado("Ese usuario");

    // Mismo rastro de auditoría que PATCH /api/admin/usuarios/[id] (cierre
    // HITO 4). Si el valor pedido es el que ya tenía, no hay cambio real que
    // registrar —`createMany` con `data: []` es un no-op, no hace falta
    // ramificar la transacción—.
    const cambio = cuerpo.datos.activo !== actual.activo;

    const [usuario] = await prisma.$transaction([
      prisma.usuario.update({
        where: { id },
        data: { activo: cuerpo.datos.activo },
        select: { id: true, nombre: true, email: true, rol: true, activo: true },
      }),
      prisma.logAuditoria.createMany({
        data: cambio
          ? [
              {
                usuarioId: permiso.quien.usuarioId,
                accion: cuerpo.datos.activo ? "CUENTA_ACTIVADA" : "CUENTA_SUSPENDIDA",
                entidad: "Usuario",
                entidadId: id,
                datosPrevios: { activo: actual.activo },
                datosNuevos: { activo: cuerpo.datos.activo },
              },
            ]
          : [],
      }),
    ]);

    return NextResponse.json({ usuario });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return noEncontrado("Ese usuario");
    }
    return fallo(e, "admin/usuarios:estado");
  }
}
