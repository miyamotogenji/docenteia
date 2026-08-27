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
import { ETIQUETA_NIVEL } from "@/lib/diagnostico/clasificar";

export const metadata: Metadata = { title: "Panel docente" };

// El listado refleja los estudiantes existentes en cada visita, así que no se
// prerenderiza en el build.
export const dynamic = "force-dynamic";

/**
 * Panel docente — versión del Paso 1.
 *
 * El cuadro de mando con métricas, mapa de calor y recomendaciones es el Paso
 * 4. Aquí sólo se muestra lo que el Paso 1 ya persiste: quién se ha registrado
 * y en qué nivel lo situó el diagnóstico. Sirve además como comprobación
 * visible de que el RBAC funciona: esta ruta sólo la abren DOCENTE y ADMIN.
 */
export default async function PanelDocente() {
  const perfiles = await prisma.perfilEstudiante.findMany({
    orderBy: { creadoEn: "desc" },
    take: 50,
    include: {
      usuario: { select: { nombre: true, email: true } },
      intentosDiagnostico: {
        orderBy: { iniciadoEn: "desc" },
        take: 1,
        select: { aciertos: true, totalPreguntas: true },
      },
    },
  });

  return (
    <div className="min-h-screen">
      <Cabecera />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Panel docente</h1>
          <p className="text-muted-foreground">
            Estudiantes registrados y nivel asignado por el diagnóstico inicial.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Estudiantes</CardTitle>
            <CardDescription>
              {perfiles.length === 0
                ? "Todavía no hay estudiantes registrados."
                : `${perfiles.length} estudiante(s).`}
            </CardDescription>
          </CardHeader>
          {perfiles.length > 0 && (
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Nombre</th>
                    <th className="pb-2 font-medium">Ciclo / grado</th>
                    <th className="pb-2 font-medium">Nivel</th>
                    <th className="pb-2 font-medium">Diagnóstico</th>
                  </tr>
                </thead>
                <tbody>
                  {perfiles.map((p) => {
                    const intento = p.intentosDiagnostico[0];
                    return (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="py-3">
                          <div className="font-medium">{p.usuario.nombre}</div>
                          <div className="text-muted-foreground">{p.usuario.email}</div>
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {[p.ciclo, p.grado].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="py-3">
                          {p.nivelActual ? (
                            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium">
                              {ETIQUETA_NIVEL[p.nivelActual]}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Sin diagnosticar</span>
                          )}
                        </td>
                        <td className="py-3 text-muted-foreground">
                          {intento
                            ? `${intento.aciertos} / ${intento.totalPreguntas}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Métricas y mapa de calor</CardTitle>
            <CardDescription>
              Corresponden al Paso 4. Las tablas que los alimentan (progreso,
              sesiones y catálogo de errores) ya están creadas en este paso.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    </div>
  );
}
