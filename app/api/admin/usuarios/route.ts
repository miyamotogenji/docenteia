import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { fallo } from "@/lib/docente/api";
import { ROLES } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EL MÓDULO DE USUARIOS DEL ADMIN (HITO 4 — cierre PMV2, "3.B"): listado
 * completo, filtrable por rol, con las instituciones para el selector de
 * vinculación —se mandan juntas para que la pantalla no necesite una
 * segunda ruta sólo para esa lista corta—.
 */
export async function GET(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const url = new URL(req.url);
  const rol = url.searchParams.get("rol");
  const busqueda = (url.searchParams.get("q") ?? "").trim();

  try {
    const [usuarios, instituciones] = await Promise.all([
      prisma.usuario.findMany({
        where: {
          ...(rol && (ROLES as readonly string[]).includes(rol) ? { rol: rol as (typeof ROLES)[number] } : {}),
          ...(busqueda
            ? {
                OR: [
                  { nombre: { contains: busqueda, mode: "insensitive" } },
                  { email: { contains: busqueda, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ rol: "asc" }, { nombre: "asc" }],
        select: {
          id: true,
          nombre: true,
          email: true,
          rol: true,
          activo: true,
          creadoEn: true,
          institucionId: true,
          institucion: { select: { nombre: true } },
        },
        // Sin filtro, el orden es por rol y ESTUDIANTE es, con mucha
        // diferencia, el más numeroso: un tope bajo aquí podía dejar fuera
        // de la respuesta al ÚNICO SUPERADMIN sembrado —el propio
        // administrador, que ordena DESPUÉS de ESTUDIANTE alfabéticamente—
        // en cuanto hubiera más estudiantes que el tope. 5000 es sobrado
        // para lo que de verdad tiene un colegio o unos pocos; si la
        // plataforma crece mucho más allá de eso, lo que hace falta es
        // paginar esta lista, no subir el número otra vez.
        take: 5000,
      }),
      prisma.institucion.findMany({
        orderBy: { nombre: "asc" },
        select: { id: true, nombre: true },
      }),
    ]);

    return NextResponse.json({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        email: u.email,
        rol: u.rol,
        activo: u.activo,
        creadoEn: u.creadoEn,
        institucionId: u.institucionId,
        institucion: u.institucion?.nombre ?? null,
      })),
      instituciones,
    });
  } catch (e) {
    return fallo(e, "admin/usuarios:listar");
  }
}
