import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { FormularioDiagnostico } from "@/components/formulario-diagnostico";

export const metadata: Metadata = { title: "Evaluación diagnóstica" };

export default async function PaginaDiagnostico() {
  const sesion = await auth();
  if (!sesion?.user?.perfilId) redirect("/login");

  const perfil = await prisma.perfilEstudiante.findUnique({
    where: { id: sesion.user.perfilId },
    select: { nivelActual: true },
  });

  // Ya tiene nivel: no se repite el diagnóstico inicial por su cuenta. Volver a
  // hacerlo sería reescribir su punto de partida sin criterio pedagógico.
  if (perfil?.nivelActual) redirect("/estudiante");

  // Las preguntas se cargan en el servidor SIN la respuesta correcta.
  const preguntas = await prisma.preguntaDiagnostico.findMany({
    where: { activa: true },
    orderBy: { orden: "asc" },
    select: {
      id: true,
      orden: true,
      tema: true,
      enunciado: true,
      expresion: true,
      opciones: true,
    },
  });

  if (preguntas.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Evaluación no disponible</h1>
        <p className="text-muted-foreground">
          El banco de preguntas está vacío. Ejecuta la semilla de la base de
          datos: <code className="rounded bg-muted px-1 py-0.5">npm run db:seed</code>
        </p>
      </div>
    );
  }

  return (
    <FormularioDiagnostico
      preguntas={preguntas.map((p) => ({
        id: p.id,
        orden: p.orden,
        tema: p.tema,
        enunciado: p.enunciado,
        expresion: p.expresion,
        opciones: p.opciones as Array<{ id: string; texto: string }>,
      }))}
    />
  );
}
