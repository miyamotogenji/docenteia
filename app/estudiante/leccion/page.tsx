import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Aula, type ReglaVista } from "@/components/leccion/aula";

export const metadata: Metadata = { title: "Lección" };
export const dynamic = "force-dynamic";

export default async function PaginaLeccion() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El diagnóstico decide el nivel de partida, así que se hace antes de la
  // primera lección.
  if (sesion.user.rol === "ESTUDIANTE" && !sesion.user.nivelActual) {
    redirect("/estudiante/diagnostico");
  }

  // El catálogo de reglas se carga entero (son unas pocas decenas) y la
  // interfaz filtra por tema. Si la tabla todavía no existe —base sin migrar—
  // la lección debe funcionar igual, sólo que sin el catálogo formal.
  let reglas: ReglaVista[] = [];
  try {
    reglas = await prisma.reglaMatematica.findMany({
      orderBy: [{ tema: "asc" }, { orden: "asc" }],
      select: {
        clave: true,
        tema: true,
        nombre: true,
        enunciado: true,
        descripcion: true,
        ejemplo: true,
        nivel: true,
        practicable: true,
      },
    });
  } catch (e) {
    console.error("[leccion] no se pudo cargar el catálogo de reglas:", e);
  }

  return <Aula reglas={reglas} />;
}
