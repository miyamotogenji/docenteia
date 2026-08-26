import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Button } from "@/components/ui/button";
import { INICIO_POR_ROL } from "@/lib/rbac";

export default async function Portada() {
  const sesion = await auth();

  // Con la sesión abierta no hay portada que enseñar: cada rol tiene su sitio.
  if (sesion?.user) redirect(INICIO_POR_ROL[sesion.user.rol]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <div className="max-w-2xl space-y-4 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Producto mínimo viable 1
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          MentorIA Math
        </h1>
        <p className="text-lg text-muted-foreground">
          Un tutor de matemáticas que explica paso a paso, corrige con un motor
          determinista en servidor y adapta cada lección al nivel real del
          estudiante.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/registro">Crear cuenta de estudiante</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/login">Iniciar sesión</Link>
        </Button>
      </div>

      <p className="max-w-md text-center text-sm text-muted-foreground">
        Al crear tu cuenta harás una evaluación breve de cinco preguntas que
        determina tu punto de partida.
      </p>
    </main>
  );
}
