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
      select: { id: true, rol: true, activo: true, institucionId: true },
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
    // El valor DE VERDAD resultante de institucionId —igual a `institucionResultante`
    // salvo por el autolimpiado de arriba—, para que la auditoría registre
    // exactamente lo que se escribe, no lo que se pidió.
    const institucionIdFinal =
      datos.institucionId !== undefined
        ? datos.institucionId
        : !rolUsaInstitucion(rolResultante) && actual.institucionId
          ? null
          : actual.institucionId;

    // Trazabilidad (observación del cliente, cierre HITO 4: "no queda
    // registro de qué administrador modificó el rol, aplicó la suspensión,
    // o vinculó la cuenta a una institución"). Una fila por campo que de
    // verdad cambió —no una genérica "se actualizó"—, para que el registro
    // se lea solo, sin cruzarlo con otra consulta.
    const cambios: { accion: string; datosPrevios: Prisma.InputJsonValue; datosNuevos: Prisma.InputJsonValue }[] = [];
    if (datos.rol !== undefined && datos.rol !== actual.rol) {
      cambios.push({ accion: "ROL_MODIFICADO", datosPrevios: { rol: actual.rol }, datosNuevos: { rol: datos.rol } });
    }
    if (datos.activo !== undefined && datos.activo !== actual.activo) {
      cambios.push({
        accion: datos.activo ? "CUENTA_ACTIVADA" : "CUENTA_SUSPENDIDA",
        datosPrevios: { activo: actual.activo },
        datosNuevos: { activo: datos.activo },
      });
    }
    if (institucionIdFinal !== actual.institucionId) {
      cambios.push({
        accion: institucionIdFinal ? "INSTITUCION_VINCULADA" : "INSTITUCION_DESVINCULADA",
        datosPrevios: { institucionId: actual.institucionId },
        datosNuevos: { institucionId: institucionIdFinal },
      });
    }

    // Una sola transacción: el cambio y su rastro de auditoría se escriben
    // juntos o no se escribe ninguno —así nunca queda una modificación real
    // sin su registro, ni un registro de un cambio que al final no se aplicó—.
    const [usuario] = await prisma.$transaction([
      prisma.usuario.update({
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
      }),
      prisma.logAuditoria.createMany({
        data: cambios.map((c) => ({
          usuarioId: permiso.quien.usuarioId,
          accion: c.accion,
          entidad: "Usuario",
          entidadId: id,
          datosPrevios: c.datosPrevios,
          datosNuevos: c.datosNuevos,
        })),
      }),
    ]);

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
