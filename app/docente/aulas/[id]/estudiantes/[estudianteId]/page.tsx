import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextoMatematico } from "@/components/math";
import { cn } from "@/lib/utils";
import type { DetalleEjercicio } from "@/lib/docente/aulas";

export const metadata: Metadata = { title: "Ejercicios desarrollados · Panel docente" };
export const dynamic = "force-dynamic";

/**
 * "EJERCICIOS DESARROLLADOS" (corrección QA): lo que abre el enlace que
 * aparece debajo de cada alumno matriculado, en la ficha del aula —"el
 * docente pueda auditar y visualizar en detalle qué ejercicios resolvió ese
 * alumno específico, sus respuestas enviadas, intentos utilizados y el
 * puntaje obtenido"—.
 *
 * Reutiliza `EntregaTarea.detalle`, el mismo desglose por ejercicio que ya
 * usa "Ver resultado" del lado del alumno, pero sin ninguno de sus candados:
 * el docente ve la respuesta correcta de inmediato, entregada la tarea o no
 * —ese anti-copia protege a un alumno de otro alumno, no al docente de ver
 * el trabajo de su propia clase—.
 */
export default async function PaginaEjerciciosDesarrollados({
  params,
}: {
  params: Promise<{ id: string; estudianteId: string }>;
}) {
  const { id: aulaId, estudianteId } = await params;
  const sesion = await auth();
  if (!sesion?.user) notFound();

  const aula = await prisma.aula.findUnique({
    where: { id: aulaId },
    select: { id: true, nombre: true, grado: true, seccion: true, docenteId: true },
  });
  // Mismo candado de titularidad que el resto de `/docente/aulas/[id]`: sólo
  // el docente DUEÑO del aula.
  if (!aula || aula.docenteId !== sesion.user.id) notFound();

  const matricula = await prisma.matricula.findUnique({
    where: { aulaId_estudianteId: { aulaId, estudianteId } },
    select: { estudiante: { select: { id: true, nombre: true, email: true } } },
  });
  if (!matricula) notFound();

  const entregas = await prisma.entregaTarea.findMany({
    where: { estudianteId, tarea: { aulaId } },
    orderBy: { actualizadoEn: "desc" },
    select: {
      puntaje: true,
      intentosUsados: true,
      completada: true,
      fechaEntrega: true,
      detalle: true,
      tarea: {
        select: {
          id: true,
          titulo: true,
          fechaVencimiento: true,
          cantidadEjercicios: true,
          limiteReintentos: true,
        },
      },
    },
  });

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-4xl space-y-6 px-6 py-10">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/docente/aulas">← Volver a aulas</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{matricula.estudiante.nombre}</h1>
          <p className="text-muted-foreground">
            {matricula.estudiante.email} · {aula.grado}.º {aula.seccion} — {aula.nombre}
          </p>
        </div>

        {entregas.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Este alumno todavía no ha entregado ninguna tarea de esta aula.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {entregas.map((e) => (
              <Card key={e.tarea.id}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                    <span>{e.tarea.titulo}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        e.completada
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {e.completada ? "Entregada" : "Sin entregar"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Vence el {e.tarea.fechaVencimiento.toLocaleDateString("es")} ·{" "}
                    {e.tarea.cantidadEjercicios} ejercicio{e.tarea.cantidadEjercicios === 1 ? "" : "s"} ·{" "}
                    {e.tarea.limiteReintentos === 0
                      ? "intentos sin límite"
                      : `${e.tarea.limiteReintentos} intento${e.tarea.limiteReintentos === 1 ? "" : "s"}`}
                  </p>
                  <p className="text-sm">
                    <span className="font-medium">Nota: {e.puntaje ?? "—"}/100</span>
                    {" · "}
                    {e.intentosUsados} intento{e.intentosUsados === 1 ? "" : "s"} utilizado
                    {e.intentosUsados === 1 ? "" : "s"}
                    {e.fechaEntrega && <> · entregada el {e.fechaEntrega.toLocaleDateString("es")}</>}
                  </p>

                  {Array.isArray(e.detalle) && e.detalle.length > 0 ? (
                    <div className="space-y-1.5">
                      {(e.detalle as unknown as DetalleEjercicio[]).map((d, i) => (
                        <details key={i} className="group rounded-md border bg-muted/30 open:bg-muted/50">
                          <summary className="flex cursor-pointer list-none items-center gap-2 p-2 text-sm font-medium">
                            <span
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                d.correcto
                                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                  : "bg-destructive/15 text-destructive",
                              )}
                            >
                              {d.correcto ? "✓" : "✗"}
                            </span>
                            Ejercicio {i + 1}
                          </summary>
                          <div className="space-y-1 px-3 pb-3 text-sm">
                            <p className="text-muted-foreground">
                              <TextoMatematico texto={d.enunciado} />
                            </p>
                            <p>
                              Respuesta del alumno: <TextoMatematico texto={d.respuestaDada ?? "—"} />
                            </p>
                            <p className="text-emerald-700 dark:text-emerald-400">
                              Respuesta correcta: <TextoMatematico texto={d.respuestaCorrecta ?? "—"} />
                            </p>
                          </div>
                        </details>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Esta entrega no tiene desglose por ejercicio guardado.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
