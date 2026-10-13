import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TextoMatematico } from "@/components/math";
import { cn } from "@/lib/utils";
import type { DetalleEjercicio } from "@/lib/docente/aulas";

interface Props {
  titulo: string;
  puntaje: number | null;
  detalle: DetalleEjercicio[];
  /** Si `puedeEntregar` ya no bloquea un nuevo intento. */
  puedeReintentar: boolean;
  tareaId: string;
  /** Por qué no se puede reintentar, si no se puede —vencida, sin reintentos—. */
  mensajeBloqueo?: string | null;
}

/**
 * "VER RESULTADO" (HITO 3 — corrección QA): la tarea YA entregada, revisitada
 * más tarde desde /estudiante/tareas.
 *
 * Antes, esto no existía: el desglose de un intento sólo vivía en el estado
 * de React de la sesión en la que se terminaba la tarea —en cuanto el
 * alumno volvía desde "Mis tareas", "Ver resultado" lo mandaba de vuelta a
 * `puedeEntregar` bloqueado, con el aviso en texto plano y nada más—. Ahora
 * lee el desglose PERSISTIDO (`EntregaTarea.detalle`), así que da igual
 * cuándo se abra.
 *
 * Son `<details>` nativos a propósito, sin JavaScript de por medio: esta es
 * una pantalla de servidor, no hace falta un componente cliente sólo para
 * desplegar una fila.
 */
export function ResultadoTarea({ titulo, puntaje, detalle, puedeReintentar, tareaId, mensajeBloqueo }: Props) {
  const aciertos = detalle.filter((d) => d.correcto).length;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
      <Card className="mx-auto max-w-lg border-2 border-primary">
        <CardHeader>
          <CardTitle>Tarea completada</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-lg font-semibold">Nota: {puntaje ?? "—"}/100</p>
          {detalle.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {aciertos} de {detalle.length} ejercicios correctos.
            </p>
          )}
          {mensajeBloqueo && !puedeReintentar && (
            <p className="text-sm text-muted-foreground">{mensajeBloqueo}</p>
          )}

          {detalle.length > 0 ? (
            <div className="space-y-1.5">
              {detalle.map((d, i) => (
                <details
                  key={i}
                  className="group rounded-md border bg-muted/30 open:bg-muted/50"
                >
                  <summary
                    className={cn(
                      "flex cursor-pointer list-none items-center gap-2 p-2 text-sm font-medium",
                    )}
                  >
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
                      Tu respuesta: <TextoMatematico texto={d.respuestaDada ?? "—"} />
                    </p>
                    {!d.correcto && (
                      <p className="text-emerald-700 dark:text-emerald-400">
                        Respuesta correcta: <TextoMatematico texto={d.respuestaCorrecta ?? "—"} />
                      </p>
                    )}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Esta tarea se entregó antes de que hubiera un desglose por ejercicio: sólo queda la
              nota.
            </p>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild size="sm">
              <Link href="/estudiante/tareas">Volver a mis tareas</Link>
            </Button>
            {puedeReintentar && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/estudiante/leccion?tareaId=${tareaId}&intentar=1`}>
                  Reintentar para mejorar la nota
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
