"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TextoMatematico } from "@/components/math";
import { pedir } from "@/lib/docente/cliente";
import { seAcertoElEjercicio } from "@/lib/docente/aulas";
import { cn } from "@/lib/utils";

/**
 * MIS AULAS (HITO 3) — la mesa de trabajo del docente para organizar a sus
 * alumnos por grado y sección.
 *
 * Misma forma que `GestorCurriculo`: un formulario de alta que se despliega
 * sin salir de la pantalla —aquí en vez de un modal, para no introducir un
 * patrón de interfaz (overlay, foco atrapado, cierre con Escape) que el resto
 * del panel no usa en ningún otro sitio—, una rejilla de tarjetas, y el mismo
 * aviso de éxito/error que ya conoce el docente.
 */

export interface AulaVista {
  id: string;
  nombre: string;
  grado: number;
  seccion: string;
  codigoAcceso: string;
  activa: boolean;
  matriculas: number;
  tareas: number;
}

interface TareaVista {
  id: string;
  titulo: string;
  fechaInicio: string;
  fechaVencimiento: string;
  cantidadEjercicios: number;
  limiteReintentos: number;
  entregadas: number;
  pendientes: number;
  /** Del banco de ejercicios, si la tarea se armó así. Vacío = la IA los genera. */
  ejercicioIds: string[];
  /** La dificultad de LA TAREA entera —todos sus ejercicios la comparten—. */
  dificultad: string | null;
  /** El desglose de cada entrega ya completada, para "Ver ejercicios de la tarea". */
  entregas: { detalle: unknown }[];
}

interface FichaAula {
  estudiantes: { id: string; nombre: string; email: string }[];
  tareas: TareaVista[];
}

interface EjercicioVista {
  id: string;
  enunciado: string;
  respuestaCorrecta: string;
  nivel: string | null;
}

interface Props {
  aulas: AulaVista[];
  baseUrl: string;
}

/** Cada cuántos milisegundos se refresca sola la lista, mientras la pestaña esté activa. */
const INTERVALO_SONDEO_MS = 12_000;

export function GestorAulas({ aulas, baseUrl }: Props) {
  const router = useRouter();
  const [, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [copiado, setCopiado] = useState<{ aulaId: string; que: "codigo" | "enlace" } | null>(null);
  const [abierta, setAbierta] = useState<{ aulaId: string; vista: "estudiantes" | "tareas" } | null>(
    null,
  );
  const [fichas, setFichas] = useState<Record<string, FichaAula | "cargando">>({});
  const [actualizando, setActualizando] = useState(false);

  // SONDEO LIGERO (HITO 3 — corrección QA): el cliente vio que un alumno que
  // acaba de matricularse con el código no aparece hasta que el docente pulsa
  // F5 a mano. `router.refresh()` vuelve a pedir los datos del servidor sin
  // perder el estado de la pantalla (formularios abiertos, panel desplegado…),
  // así que basta con llamarlo cada pocos segundos mientras la pestaña esté a
  // la vista. En segundo plano no tiene sentido: nadie está mirando el
  // contador para que valga la pena gastar la petición.
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, INTERVALO_SONDEO_MS);
    return () => clearInterval(id);
  }, [router]);

  const actualizarAhora = () => {
    setActualizando(true);
    router.refresh();
    // No hay forma de saber cuándo termina un `refresh()`: el giro del ícono
    // es sólo la confirmación visual de que el clic se registró.
    setTimeout(() => setActualizando(false), 600);
  };

  /**
   * Abre (o cierra) el panel de "Ver estudiantes" o "Ver tarea asignada" de
   * una tarjeta. Las dos vistas leen de la MISMA ficha del aula —la ruta ya
   * trae alumnos y tareas juntos—, así que una sola caché evita pedirla dos
   * veces si el docente mira primero una pestaña y luego la otra.
   */
  const verDetalle = (aulaId: string, vista: "estudiantes" | "tareas") => {
    if (abierta?.aulaId === aulaId && abierta.vista === vista) {
      setAbierta(null);
      return;
    }
    setAbierta({ aulaId, vista });
    if (!fichas[aulaId]) {
      setFichas((f) => ({ ...f, [aulaId]: "cargando" }));
      iniciar(async () => {
        const r = await pedir<FichaAula & { aula: unknown }>(`/api/docente/aulas/${aulaId}`);
        setFichas((f) => ({
          ...f,
          [aulaId]: r.ok ? { estudiantes: r.datos.estudiantes, tareas: r.datos.tareas } : { estudiantes: [], tareas: [] },
        }));
        if (!r.ok) setAviso({ tono: "mal", texto: r.error });
      });
    }
  };

  // "Ver ejercicios de la tarea" (corrección QA): sólo existe para una tarea
  // armada desde el banco —`ejercicioIds` no vacío—; con la IA cada alumno
  // recibe el suyo, generado en el momento, así que no hay un conjunto fijo
  // que previsualizar.
  const [verEjerciciosDe, setVerEjerciciosDe] = useState<string | null>(null);
  const [ejerciciosVistos, setEjerciciosVistos] = useState<
    Record<string, EjercicioVista[] | "cargando">
  >({});

  const verEjerciciosDeLaTarea = (tareaId: string, ejercicioIds: string[]) => {
    if (verEjerciciosDe === tareaId) {
      setVerEjerciciosDe(null);
      return;
    }
    setVerEjerciciosDe(tareaId);
    if (!ejerciciosVistos[tareaId]) {
      setEjerciciosVistos((e) => ({ ...e, [tareaId]: "cargando" }));
      iniciar(async () => {
        const r = await pedir<{ ejercicios: EjercicioVista[] }>(
          `/api/docente/ejercicios?ids=${ejercicioIds.join(",")}`,
        );
        setEjerciciosVistos((e) => ({ ...e, [tareaId]: r.ok ? r.datos.ejercicios : [] }));
        if (!r.ok) setAviso({ tono: "mal", texto: r.error });
      });
    }
  };

  const copiar = async (aulaId: string, que: "codigo" | "enlace", texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado({ aulaId, que });
      setTimeout(() => setCopiado(null), 2000);
    } catch {
      setAviso({ tono: "mal", texto: "No se pudo copiar. Cópialo a mano: " + texto });
    }
  };

  return (
    <div className="space-y-6">
      {aviso && (
        <div
          role="status"
          className={cn(
            "rounded-md border px-4 py-3 text-sm",
            aviso.tono === "ok"
              ? "border-emerald-600/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
              : "border-destructive/30 bg-destructive/10 text-destructive",
          )}
        >
          {aviso.texto}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h2 className="text-xl font-semibold tracking-tight">Mis aulas</h2>
          <p className="text-sm text-muted-foreground">
            Un aula es un grado y una sección: reparte su código a tus alumnos para que se
            matriculen.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Actualizar mis aulas"
            onClick={actualizarAhora}
          >
            <RefreshCw className={cn("h-4 w-4", actualizando && "animate-spin")} />
            Actualizar
          </Button>
        </div>
      </div>

      {aulas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Todavía no tienes ninguna aula asignada. El administrador de la plataforma crea las aulas
          y te asigna como titular desde su panel.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {aulas.map((a) => {
            const enlace = `${baseUrl}/estudiante/unirse?codigo=${a.codigoAcceso}`;
            return (
              <Card key={a.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="text-lg">
                      {a.grado}.º {a.seccion}
                    </CardTitle>
                    {!a.activa && <Badge variant="contorno">Inactiva</Badge>}
                  </div>
                  <CardDescription>{a.nombre}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2">
                    <code className="rounded-md border bg-muted/40 px-3 py-1.5 font-mono text-lg font-semibold tracking-widest">
                      {a.codigoAcceso}
                    </code>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copiar(a.id, "codigo", a.codigoAcceso)}
                    >
                      {copiado?.aulaId === a.id && copiado.que === "codigo" ? "¡Copiado!" : "Copiar código"}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copiar(a.id, "enlace", enlace)}
                    >
                      {copiado?.aulaId === a.id && copiado.que === "enlace" ? "¡Copiado!" : "Copiar enlace"}
                    </Button>
                  </div>
                  <div className="flex items-center justify-between pt-1 text-sm">
                    <Badge variant="neutro">
                      {a.matriculas} alumno{a.matriculas === 1 ? "" : "s"}
                    </Badge>
                    <span className="text-muted-foreground">
                      {a.tareas} tarea{a.tareas === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1"
                      onClick={() => verDetalle(a.id, "estudiantes")}
                    >
                      {abierta?.aulaId === a.id && abierta.vista === "estudiantes"
                        ? "Ocultar alumnos"
                        : "Ver estudiantes"}
                    </Button>
                    {a.tareas === 0 ? (
                      <Link href={`/docente/asignar-tarea?aulaId=${a.id}`} className="flex-1">
                        <Button size="sm" className="w-full">
                          Asignar tarea
                        </Button>
                      </Link>
                    ) : (
                      <Button size="sm" className="flex-1" onClick={() => verDetalle(a.id, "tareas")}>
                        {abierta?.aulaId === a.id && abierta.vista === "tareas"
                          ? "Ocultar tarea"
                          : "Ver tarea asignada"}
                      </Button>
                    )}
                  </div>
                  {/* "Ver tarea asignada" dice qué YA hay; esto es cómo programar una
                      más sin perder la de encima. Antes el único botón —"Asignar
                      tarea"— desaparecía en cuanto el aula ya tenía una, y el
                      cliente preguntó "la tarea se asignó mas no se visualiza; quiero
                      visualizar la tarea, ¿qué hago?": no es que no se viera, es que
                      ya no había cómo abrir una segunda. */}
                  {a.tareas > 0 && (
                    <Link
                      href={`/docente/asignar-tarea?aulaId=${a.id}`}
                      className="block text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                    >
                      + Asignar otra tarea
                    </Link>
                  )}
                  {abierta?.aulaId === a.id && (
                    <div className="rounded-md border bg-muted/30 p-3 text-sm">
                      {fichas[a.id] === "cargando" ? (
                        <p className="text-muted-foreground">Cargando…</p>
                      ) : !fichas[a.id] ? null : abierta.vista === "estudiantes" ? (
                        (fichas[a.id] as FichaAula).estudiantes.length === 0 ? (
                          <p className="text-muted-foreground">
                            Todavía no hay alumnos matriculados en esta aula.
                          </p>
                        ) : (
                          <ul className="space-y-1.5">
                            {(fichas[a.id] as FichaAula).estudiantes.map((al) => (
                              <li key={al.email} className="space-y-0.5">
                                <div className="flex items-baseline justify-between gap-2">
                                  <span className="font-medium">{al.nombre}</span>
                                  <span className="truncate text-xs text-muted-foreground">{al.email}</span>
                                </div>
                                {/* "Ejercicios desarrollados" (corrección QA): el
                                    docente pueda auditar, alumno por alumno, qué
                                    resolvió en esta aula —enunciado, su
                                    respuesta, la correcta y el puntaje—. */}
                                <Link
                                  href={`/docente/aulas/${a.id}/estudiantes/${al.id}`}
                                  className="text-xs font-medium text-primary hover:underline"
                                >
                                  Ejercicios desarrollados
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )
                      ) : (fichas[a.id] as FichaAula).tareas.length === 0 ? (
                        <p className="text-muted-foreground">Esta aula todavía no tiene tareas.</p>
                      ) : (
                        <ul className="space-y-3">
                          {(fichas[a.id] as FichaAula).tareas.map((t) => (
                            <li key={t.id} className="space-y-1 border-b pb-2 last:border-0 last:pb-0">
                              <p className="font-medium">{t.titulo}</p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(t.fechaInicio).toLocaleDateString("es")} –{" "}
                                {new Date(t.fechaVencimiento).toLocaleDateString("es")} ·{" "}
                                {t.cantidadEjercicios} ejercicio{t.cantidadEjercicios === 1 ? "" : "s"} ·{" "}
                                {t.limiteReintentos === 0
                                  ? "intentos sin límite"
                                  : `${t.limiteReintentos} intento${t.limiteReintentos === 1 ? "" : "s"}`}
                              </p>
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-xs">
                                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                    {t.entregadas} entregada{t.entregadas === 1 ? "" : "s"}
                                  </span>
                                  {" · "}
                                  <span className="text-muted-foreground">
                                    {t.pendientes} pendiente{t.pendientes === 1 ? "" : "s"}
                                  </span>
                                </p>
                                {/* La dificultad es de LA TAREA: se dice una sola
                                    vez aquí, no en cada fila del desglose de
                                    ejercicios (corrección QA). */}
                                {t.dificultad && (
                                  <Badge variant="contorno" className="text-[0.65rem]">
                                    {t.dificultad}
                                  </Badge>
                                )}
                              </div>
                              {t.ejercicioIds.length > 0 && (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => verEjerciciosDeLaTarea(t.id, t.ejercicioIds)}
                                  >
                                    {verEjerciciosDe === t.id ? "Ocultar ejercicios" : "Ver ejercicios de la tarea"}
                                  </Button>
                                  {verEjerciciosDe === t.id && (
                                    <div className="rounded border bg-background p-2 text-xs">
                                      {ejerciciosVistos[t.id] === "cargando" ? (
                                        <p className="text-muted-foreground">Cargando…</p>
                                      ) : (
                                        <ul className="space-y-2">
                                          {(ejerciciosVistos[t.id] as EjercicioVista[]).map((e, i) => {
                                            // "A la derecha de cada ejercicio se
                                            // repite 'AVANZADO' en cada fila"
                                            // (corrección QA): lo que cambia
                                            // ejercicio a ejercicio no es la
                                            // dificultad —ya está en la
                                            // cabecera—, es si se acertó.
                                            const acerto = seAcertoElEjercicio(t.entregas, e.id);
                                            return (
                                              <li key={i} className="flex items-start justify-between gap-2">
                                                <div className="space-y-0.5">
                                                  <TextoMatematico texto={e.enunciado} />
                                                  <p className="text-muted-foreground">
                                                    Respuesta: {e.respuestaCorrecta}
                                                  </p>
                                                </div>
                                                {acerto != null && (
                                                  <span
                                                    title={acerto ? "Acertado" : "Fallado"}
                                                    className={cn(
                                                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                                                      acerto
                                                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                                                        : "bg-destructive/15 text-destructive",
                                                    )}
                                                  >
                                                    {acerto ? "✓" : "✗"}
                                                  </span>
                                                )}
                                              </li>
                                            );
                                          })}
                                        </ul>
                                      )}
                                    </div>
                                  )}
                                </>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
