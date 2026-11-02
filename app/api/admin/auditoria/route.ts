import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { fallo } from "@/lib/docente/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/auditoria (cierre HITO 4 — observación del cliente:
 * "se sugiere incorporar una tabla de auditoría... con, como mínimo, los
 * campos de autoría en dichas operaciones"). Lee `LogAuditoria`, lo más
 * reciente primero, con el nombre de quien hizo cada cosa ya resuelto —sin
 * que el panel tenga que cruzarlo con /api/admin/usuarios—.
 *
 * Filtrable por `entidad` ("Usuario" | "Matricula") y por `entidadId`, para
 * poder ver el historial de una sola fila concreta en vez de todo el
 * registro.
 */
export async function GET(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const entidad = url.searchParams.get("entidad");
  const entidadId = url.searchParams.get("entidadId");

  try {
    const entradas = await prisma.logAuditoria.findMany({
      where: {
        ...(entidad ? { entidad } : {}),
        ...(entidadId ? { entidadId } : {}),
      },
      orderBy: { creadoEn: "desc" },
      // Un registro de auditoría crece sin tope natural —cada acción
      // administrativa suma una fila más—; 300 alcanza de sobra para "qué
      // ha pasado últimamente", que es para lo que existe esta pantalla. Si
      // algún día hace falta mirar más atrás, lo que hace falta es paginar
      // esta lista, no subir el número otra vez.
      take: 300,
      select: {
        id: true,
        accion: true,
        entidad: true,
        entidadId: true,
        datosPrevios: true,
        datosNuevos: true,
        creadoEn: true,
        usuario: { select: { nombre: true, email: true } },
      },
    });

    return NextResponse.json({
      entradas: entradas.map((e) => ({
        id: e.id,
        accion: e.accion,
        entidad: e.entidad,
        entidadId: e.entidadId,
        datosPrevios: e.datosPrevios,
        datosNuevos: e.datosNuevos,
        creadoEn: e.creadoEn,
        autor: e.usuario?.nombre ?? null,
        autorEmail: e.usuario?.email ?? null,
      })),
    });
  } catch (e) {
    return fallo(e, "admin/auditoria:listar");
  }
}
