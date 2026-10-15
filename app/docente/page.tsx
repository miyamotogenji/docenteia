import type { Metadata } from "next";
import Link from "next/link";

import { auth } from "@/auth";
import { Cabecera } from "@/components/cabecera";
import { NavegacionDocente } from "@/components/docente/navegacion";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ETIQUETA_NIVEL } from "@/lib/diagnostico/clasificar";
import {
  alumnosDelPanel,
  dificultadesRecurrentes,
  metricasDelGrupo,
  riesgoAcademico,
  riesgoDeEntregas,
  rachasDeFallosPorAlumno,
  ETIQUETA_ESTADO,
  ETIQUETA_RIESGO,
  type NivelDeRiesgo,
  type SenalesDeRiesgo,
  type TareaEnBruto,
} from "@/lib/docente/metricas";

/** Insignia de color del semáforo de riesgo (sección 5 del HITO 4). */
const COLOR_RIESGO: Record<NivelDeRiesgo, string> = {
  alto: "border-red-200 bg-red-100 text-red-700",
  observacion: "border-amber-200 bg-amber-100 text-amber-700",
  optimo: "border-emerald-200 bg-emerald-100 text-emerald-700",
  sin_datos: "border-transparent bg-secondary text-muted-foreground",
};

export const metadata: Metadata = { title: "Panel docente" };

// El listado refleja los estudiantes existentes en cada visita, así que no se
// prerenderiza en el build.
export const dynamic = "force-dynamic";

/**
 * Panel docente.
 *
 * Lee la persistencia REAL: quién se ha registrado, en qué nivel lo situó el
 * diagnóstico, cuántas sesiones ha terminado, cómo va de aciertos y en qué se
 * atasca el grupo. Todo sale de las tablas que la lección lleva llenando:
 * sesiones_aprendizaje, registros_progreso y registros_error.
 *
 * Sirve además como comprobación visible de que el RBAC funciona: esta ruta la
 * abren DOCENTE, DIRECTOR y SUPERADMIN.
 *
 * MVP 2. El panel gana una portada de AUTORÍA: desde aquí se entra al currículo,
 * al alta de temas y al banco de ejercicios, con el recuento de lo que hay en
 * cada sitio. Es lo primero que ve el docente al entrar y responde a la pregunta
 * con la que llega: "¿qué tengo montado y qué me falta?".
 */
export default async function PanelDocente() {
  const sesion = await auth();

  const [
    perfiles,
    intentos,
    errores,
    temasPublicados,
    temasBorrador,
    ejerciciosValidados,
    ejerciciosTotales,
    reglas,
    tareasDelDocente,
  ] = await Promise.all([
    prisma.perfilEstudiante.findMany({
      orderBy: { creadoEn: "desc" },
      take: 50,
      include: {
        usuario: { select: { nombre: true, email: true } },
        intentosDiagnostico: {
          orderBy: { iniciadoEn: "desc" },
          take: 1,
          select: { aciertos: true, totalPreguntas: true },
        },
        // Sesiones TERMINADAS: una empezada y abandonada no es trabajo hecho.
        sesiones: {
          where: { finalizadaEn: { not: null } },
          orderBy: { finalizadaEn: "desc" },
          select: { finalizadaEn: true },
        },
      },
    }),
    // Un registro por intento de práctica calificado.
    prisma.registroProgreso.findMany({
      select: { perfilId: true, tema: true, acierto: true, creadoEn: true },
    }),
    // El catálogo de debilidades acumuladas del grupo.
    prisma.registroError.findMany({
      select: { tema: true, tipoError: true, ocurrencias: true },
    }),
    prisma.nodoConocimiento.count({ where: { estado: "PUBLICADO" } }),
    prisma.nodoConocimiento.count({ where: { estado: "BORRADOR" } }),
    prisma.ejercicio.count({ where: { validado: true } }),
    prisma.ejercicio.count(),
    prisma.reglaMatematica.count(),
    // Las tareas de SUS aulas (HITO 3), para el semáforo de riesgo: cuáles
    // están vencidas sin que un alumno matriculado las entregara. Un
    // DIRECTOR o SUPERADMIN que visita este panel sin ser dueño de ningún
    // aula simplemente no tiene tareas aquí, y el semáforo lo refleja como
    // "sin datos" en vez de romperse.
    prisma.tarea.findMany({
      where: { aula: { docenteId: sesion?.user?.id ?? "" } },
      select: {
        fechaVencimiento: true,
        aula: { select: { matriculas: { select: { estudianteId: true } } } },
        entregas: { select: { estudianteId: true, completada: true, fechaEntrega: true } },
      },
    }),
  ]);

  const autoria = [
    {
      href: "/docente/curriculo",
      titulo: "Currículo",
      descripcion: "Asignaturas, temas y subtemas.",
      cifra: `${temasPublicados} publicado(s)`,
      pie: `${temasBorrador} en borrador`,
    },
    {
      href: "/docente/crear-tema",
      titulo: "Crear tema",
      descripcion: "Nuevo tema con sus reglas pedagógicas.",
      cifra: `${reglas} regla(s)`,
      pie: "en todo el temario",
    },
    {
      href: "/docente/ejercicios",
      titulo: "Ejercicios",
      descripcion: "Banco con validación matemática en servidor.",
      cifra: `${ejerciciosValidados} de ${ejerciciosTotales}`,
      pie: "verificados por el motor",
    },
  ];

  const enBruto = perfiles.map((p) => ({
    perfilId: p.id,
    nombre: p.usuario.nombre,
    email: p.usuario.email,
    nivel: p.nivelActual as string | null,
    sesionesCompletadas: p.sesiones.length,
    ultimaSesion: p.sesiones[0]?.finalizadaEn ?? null,
  }));

  const alumnos = alumnosDelPanel(enBruto, intentos);
  const metricas = metricasDelGrupo(enBruto, intentos, errores);
  const dificultades = dificultadesRecurrentes(errores);
  const cifraDe = (perfilId: string) => alumnos.find((a) => a.perfilId === perfilId);

  // SECCIÓN 5 del HITO 4: semáforo de riesgo académico (Rojo/Ámbar/Verde).
  // `rachasDeFallosPorAlumno` indexa por `perfilId`; `riesgoDeEntregas`
  // indexa por `estudianteId` (el `Usuario.id` matriculado en el aula) —son
  // dos espacios de id distintos que sólo se cruzan por `usuarioId`.
  const rachas = rachasDeFallosPorAlumno(
    intentos.map((i) => ({ perfilId: i.perfilId, tema: i.tema, acierto: i.acierto, en: i.creadoEn })),
  );
  const tareasEnBruto: TareaEnBruto[] = tareasDelDocente.map((t) => ({
    fechaVencimiento: t.fechaVencimiento,
    estudiantesMatriculados: t.aula.matriculas.map((m) => m.estudianteId),
    entregas: t.entregas,
  }));
  const entregasPorAlumno = riesgoDeEntregas(tareasEnBruto);

  const riesgoPorPerfil = new Map<string, NivelDeRiesgo>();
  for (const p of perfiles) {
    const entregas = entregasPorAlumno.get(p.usuarioId);
    const senales: SenalesDeRiesgo = {
      rachaMaximaDeFallos: rachas.get(p.id) ?? null,
      tasaAciertos: cifraDe(p.id)?.tasaAciertos ?? null,
      tareasVencidasSinEntregar: entregas?.tareasVencidasSinEntregar ?? 0,
      todasEntregadasEnPlazo: entregas?.todasEntregadasEnPlazo ?? null,
    };
    riesgoPorPerfil.set(p.id, riesgoAcademico(senales));
  }

  const conteoRiesgo: Record<NivelDeRiesgo, number> = { alto: 0, observacion: 0, optimo: 0, sin_datos: 0 };
  for (const nivel of riesgoPorPerfil.values()) conteoRiesgo[nivel]++;

  return (
    <div className="min-h-screen">
      <Cabecera />
      <NavegacionDocente />
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Panel docente</h1>
            <p className="text-muted-foreground">
              Estudiantes registrados y nivel asignado por el diagnóstico inicial.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/api/docente/exportar/pdf">Descargar PDF</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/api/docente/exportar/excel">Descargar Excel</a>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {autoria.map((a) => (
            <Card key={a.href} className="flex flex-col">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{a.titulo}</CardTitle>
                <CardDescription>{a.descripcion}</CardDescription>
              </CardHeader>
              <CardContent className="mt-auto space-y-3">
                <div>
                  <p className="text-2xl font-semibold tabular-nums">{a.cifra}</p>
                  <p className="text-xs text-muted-foreground">{a.pie}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="w-full">
                  <Link href={a.href}>Abrir</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { rotulo: "Estudiantes", valor: String(metricas.totalAlumnos) },
            {
              rotulo: "Diagnóstico completado",
              valor:
                metricas.diagnosticoCompletado == null
                  ? "—"
                  : `${metricas.diagnosticoCompletado}%`,
              pie: `${metricas.conDiagnostico} de ${metricas.totalAlumnos}`,
            },
            {
              rotulo: "Aciertos del grupo",
              valor:
                metricas.tasaAciertosGlobal == null ? "—" : `${metricas.tasaAciertosGlobal}%`,
              pie: "sobre las prácticas calificadas",
            },
            {
              rotulo: "Sesiones completadas",
              valor: String(metricas.sesionesCompletadas),
              pie: metricas.temaMasDificil
                ? `más difícil: ${metricas.temaMasDificil.toLowerCase().replace(/_/g, " ")}`
                : undefined,
            },
          ].map((m) => (
            <Card key={m.rotulo}>
              <CardHeader className="pb-2">
                <CardDescription>{m.rotulo}</CardDescription>
                <CardTitle className="text-3xl tabular-nums">{m.valor}</CardTitle>
              </CardHeader>
              {m.pie && (
                <CardContent className="pt-0 text-xs text-muted-foreground">{m.pie}</CardContent>
              )}
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Semáforo de riesgo académico</CardTitle>
            <CardDescription>
              Quién demanda una intervención prioritaria, de un vistazo.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {(["alto", "observacion", "optimo", "sin_datos"] as const).map((nivel) => (
              <span
                key={nivel}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm font-medium tabular-nums",
                  COLOR_RIESGO[nivel],
                )}
              >
                {ETIQUETA_RIESGO[nivel]}: {conteoRiesgo[nivel]}
              </span>
            ))}
          </CardContent>
        </Card>

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
                    <th className="pb-2 font-medium">Sesiones</th>
                    <th className="pb-2 font-medium">Aciertos</th>
                    <th className="pb-2 font-medium">Estado</th>
                    <th className="pb-2 font-medium">Riesgo</th>
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
                        <td className="py-3 tabular-nums text-muted-foreground">
                          {cifraDe(p.id)?.sesionesCompletadas ?? 0}
                        </td>
                        <td className="py-3 tabular-nums text-muted-foreground">
                          {cifraDe(p.id)?.tasaAciertos == null
                            ? "—"
                            : `${cifraDe(p.id)!.tasaAciertos}% (${cifraDe(p.id)!.aciertos}/${cifraDe(p.id)!.intentos})`}
                        </td>
                        <td className="py-3">
                          <span className="rounded-full border px-2.5 py-1 text-xs font-medium">
                            {ETIQUETA_ESTADO[cifraDe(p.id)?.estado ?? "sin_empezar"]}
                          </span>
                        </td>
                        <td className="py-3">
                          {(() => {
                            const riesgo = riesgoPorPerfil.get(p.id) ?? "sin_datos";
                            return (
                              <span
                                className={cn(
                                  "rounded-full border px-2.5 py-1 text-xs font-medium",
                                  COLOR_RIESGO[riesgo],
                                )}
                              >
                                {ETIQUETA_RIESGO[riesgo]}
                              </span>
                            );
                          })()}
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
            <CardTitle>Dificultades recurrentes</CardTitle>
            <CardDescription>
              {dificultades.length === 0
                ? "Aún no hay errores registrados: aparecerán en cuanto los estudiantes practiquen."
                : "En qué se atasca el grupo, de lo más frecuente a lo menos."}
            </CardDescription>
          </CardHeader>
          {dificultades.length > 0 && (
            <CardContent className="space-y-3">
              {dificultades.map((d) => (
                <div key={`${d.tema}-${d.tipoError}`} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span>
                      {d.tema.toLowerCase().replace(/_/g, " ")}
                      <span className="text-muted-foreground">
                        {" · "}
                        {d.tipoError.replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {d.peso}% ({d.ocurrencias})
                    </span>
                  </div>
                  {/* La barra es una lectura de un vistazo; la cifra de al lado
                      es la que manda, porque la barra se satura al 100%. */}
                  <div className="h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.max(2, Math.min(100, d.peso))}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      </main>
    </div>
  );
}
