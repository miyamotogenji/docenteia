import { NextResponse } from "next/server";

import { salud } from "@/src/queryCore.js";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Salud del servicio. Amplía la del prototipo con el estado de la base de
 * datos, que en el PMV 1 es una dependencia dura: sin ella no hay login,
 * ni diagnóstico, ni progreso.
 *
 * No revela la API key ni la cadena de conexión, sólo si están configuradas.
 */
export async function GET() {
  const base = salud();

  let bd: "ok" | "sin_configurar" | "error" = "sin_configurar";
  if (process.env.DATABASE_URL) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      bd = "ok";
    } catch {
      bd = "error";
    }
  }

  return NextResponse.json(
    { ...base, base_datos: bd, app: "docenteia", paso: 1 },
    { status: bd === "error" ? 503 : 200 },
  );
}
