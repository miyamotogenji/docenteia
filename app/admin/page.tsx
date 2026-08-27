import type { Metadata } from "next";

import { Cabecera } from "@/components/cabecera";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Administración" };

// Muestra el estado real de la base de datos en cada visita: prerenderizarla
// en el build la congelaría con las cifras del momento de compilar (y obligaría
// a tener la base disponible para poder compilar).
export const dynamic = "force-dynamic";

/**
 * Panel de administración — versión del Paso 1: estado del sistema.
 * Comprueba de un vistazo que la persistencia y la semilla están en su sitio.
 */
export default async function PanelAdmin() {
  const [usuarios, estudiantes, docentes, preguntas, nodos, ejercicios, diagnosticos] =
    await Promise.all([
      prisma.usuario.count(),
      prisma.usuario.count({ where: { rol: "ESTUDIANTE" } }),
      prisma.usuario.count({ where: { rol: "DOCENTE" } }),
      prisma.preguntaDiagnostico.count({ where: { activa: true } }),
      prisma.nodoConocimiento.count(),
      prisma.ejercicio.count(),
      prisma.intentoDiagnostico.count({ where: { completado: true } }),
    ]);

  const fichas = [
    { etiqueta: "Usuarios", valor: usuarios },
    { etiqueta: "Estudiantes", valor: estudiantes },
    { etiqueta: "Docentes", valor: docentes },
    { etiqueta: "Preguntas activas", valor: preguntas },
    { etiqueta: "Nodos del árbol", valor: nodos },
    { etiqueta: "Ejercicios en banco", valor: ejercicios },
    { etiqueta: "Diagnósticos completados", valor: diagnosticos },
  ];

  return (
    <div className="min-h-screen">
      <Cabecera />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Administración</h1>
          <p className="text-muted-foreground">Estado del sistema.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {fichas.map((f) => (
            <Card key={f.etiqueta}>
              <CardHeader className="pb-2">
                <CardDescription>{f.etiqueta}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums">{f.valor}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {preguntas === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Falta la semilla</CardTitle>
              <CardDescription>
                No hay preguntas de diagnóstico activas. Ejecuta{" "}
                <code className="rounded bg-muted px-1 py-0.5">npm run db:seed</code>.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </main>
    </div>
  );
}
