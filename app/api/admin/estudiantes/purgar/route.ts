import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { exigirSuperadmin } from "@/lib/admin/api";
import { fallo, leerCuerpo } from "@/lib/docente/api";
import { purgarEstudiantesSchema } from "@/lib/admin/purga";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/estudiantes/purgar — borra todas las cuentas de alumno
 * (`Usuario` con `rol: "ESTUDIANTE"`) EXCEPTO las que vengan en
 * `conservarEmails`. Ver el porqué exacto del alcance en `lib/admin/purga.ts`.
 *
 * Exige repetir `{ confirmar: "PURGAR" }` además de la sesión de SUPERADMIN,
 * igual que `.../actividad-alumnos/reiniciar`: es irreversible y esta es la
 * única base de datos que hay.
 */
export async function POST(req: Request) {
  const permiso = await exigirSuperadmin();
  if (!permiso.ok) return permiso.respuesta;

  const cuerpo = await leerCuerpo(req, purgarEstudiantesSchema);
  if (!cuerpo.ok) return cuerpo.respuesta;

  try {
    const { count } = await prisma.usuario.deleteMany({
      where: {
        rol: "ESTUDIANTE",
        email: { notIn: cuerpo.datos.conservarEmails },
      },
    });

    return NextResponse.json({
      purgado: true,
      purgadoEn: new Date().toISOString(),
      cuentasBorradas: count,
    });
  } catch (e) {
    return fallo(e, "admin/estudiantes:purgar");
  }
}
