import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { FormularioDiagnostico } from "@/components/formulario-diagnostico";
import { armarPrueba, perfilParaPrueba } from "@/lib/diagnostico/prueba";

export const metadata: Metadata = { title: "Evaluación diagnóstica" };
export const dynamic = "force-dynamic";

/**
 * La evaluación diagnóstica, compuesta para ESTE alumno.
 *
 * La página monta la prueba con la misma función que usa `/api/diagnostico`
 * (`armarPrueba`), y no con una consulta propia. Antes tenía la suya, y por eso
 * un alumno de 3.º de secundaria seguía viendo derivadas en pantalla: la
 * corrección ya sabía filtrar por nivel, pero lo que se le enseñaba salía de
 * otro sitio. Con una sola función, lo que se pregunta y lo que se corrige no
 * pueden volver a discrepar.
 */
export default async function PaginaDiagnostico() {
  const sesion = await auth();
  if (!sesion?.user?.perfilId) redirect("/login");

  const perfil = await perfilParaPrueba(sesion.user.perfilId);

  // Ya tiene nivel: no se repite el diagnóstico inicial por su cuenta. Volver a
  // hacerlo sería reescribir su punto de partida sin criterio pedagógico.
  if (perfil?.nivelActual) redirect("/estudiante");

  const { items, nivel } = await armarPrueba({
    nivelActual: perfil?.nivelActual ?? null,
    ciclo: perfil?.ciclo ?? null,
    grado: perfil?.grado ?? null,
  });

  if (items.length === 0) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">Evaluación no disponible</h1>
        <p className="text-muted-foreground">
          Todavía no hay preguntas para tu nivel. Si acabas de instalar la aplicación, ejecuta la
          semilla de la base de datos:{" "}
          <code className="rounded bg-muted px-1 py-0.5">npm run db:seed</code>
        </p>
      </div>
    );
  }

  return (
    <FormularioDiagnostico
      preguntas={items.map((i) => ({
        id: i.id,
        tipo: i.tipo,
        tema: i.tema,
        enunciado: i.enunciado,
        expresion: i.expresion ?? null,
        opciones: i.opciones,
      }))}
      nivel={nivel}
      curso={[perfil?.ciclo, perfil?.grado].filter(Boolean).join(" ") || null}
    />
  );
}
