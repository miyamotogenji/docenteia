import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { conflicto, fallo, leerCuerpo, noEncontrado } from "@/lib/docente/api";
import { patchUsuarioSchema, rolUsaInstitucion } from "@/lib/admin/usuarios";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Activar/suspender, reasignar rol, vincular a una institución (HITO 4 —
 * cierre PMV2, "3.B Control de Accesos y Gestión de Usuarios").
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;
  const { id } = await params;

  const cuerpo = await leerCuerpo(req, patchUsuarioSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;
  const datos = cuerpo.datos;

  // Nadie se suspende ni se degrada el rol a sí mismo desde aquí: un
  // SUPERADMIN que se quita su propio rol, o que se suspende por error, se
  // deja fuera de /admin sin que quede nadie dentro que pueda deshacerlo —el
  // panel no tiene "recuperar acceso", sólo Prisma Studio o una migración a
  // mano—. Vincularse a sí mismo a una institución SÍ se permite: a
  // diferencia de rol/activo, no reduce su propio acceso ni lo bloquea de
  // nada —es lo que necesita para poder crear aulas y probar el flujo de
  // docente con su propia cuenta—.
  if (id === permiso.quien.usuarioId && (datos.rol !== undefined || datos.activo !== undefined)) {
    return conflicto(
      "No puedes cambiar tu propio rol ni activar/suspender tu propia cuenta desde el panel de administración.",
    );
  }

  if (datos.activo === undefined && datos.rol === undefined && datos.institucionId === undefined) {
    return conflicto("No se pidió ningún cambio.");
  }

  try {
    const actual = await prisma.usuario.findUnique({
      where: { id },
      select: { id: true, rol: true, institucionId: true },
    });
    if (!actual) return noEncontrado("Ese usuario");

    const rolResultante = datos.rol ?? actual.rol;
    // Si el rol resultante no usa institución, cambiarle SÓLO el rol no debe
    // dejar colgada una institución que ya no significa nada para él —se
    // limpia sola, en vez de exigirle al admin un segundo clic para
    // "institucionId: null" que, además, nadie le pediría—.
    const institucionResultante = datos.institucionId !== undefined ? datos.institucionId : actual.institucionId;
    if (institucionResultante && !rolUsaInstitucion(rolResultante)) {
      if (datos.institucionId !== undefined) {
        return conflicto(
          "Sólo un docente, un director o el administrador de la plataforma pueden vincularse a una institución.",
        );
      }
    }

    const usuario = await prisma.usuario.update({
      where: { id },
      data: {
        ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
        ...(datos.rol !== undefined ? { rol: datos.rol } : {}),
        ...(datos.institucionId !== undefined
          ? { institucionId: datos.institucionId }
          : !rolUsaInstitucion(rolResultante) && actual.institucionId
            ? { institucionId: null }
            : {}),
      },
      select: {
        id: true,
        nombre: true,
        email: true,
        rol: true,
        activo: true,
        institucionId: true,
        institucion: { select: { nombre: true } },
      },
    });

    return NextResponse.json({
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre,
        email: usuario.email,
        rol: usuario.rol,
        activo: usuario.activo,
        institucionId: usuario.institucionId,
        institucion: usuario.institucion?.nombre ?? null,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") {
      return noEncontrado("Ese usuario");
    }
    return fallo(e, "admin/usuarios:actualizar");
  }
}
