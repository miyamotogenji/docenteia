"use client";

import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { ETIQUETA_RIESGO, type NivelDeRiesgo } from "@/lib/docente/metricas";

export interface FilaSeguimiento {
  estudianteId: string;
  nombre: string;
  email: string;
  aulaId: string;
  aulaEtiqueta: string;
  riesgo: NivelDeRiesgo;
  tareasVencidasSinEntregar: number;
}

const COLOR_RIESGO: Record<NivelDeRiesgo, string> = {
  alto: "border-red-200 bg-red-100 text-red-700",
  observacion: "border-amber-200 bg-amber-100 text-amber-700",
  optimo: "border-emerald-200 bg-emerald-100 text-emerald-700",
  sin_datos: "border-transparent bg-secondary text-muted-foreground",
};

type FiltroEstado = "todos" | "al_dia" | "con_vencidas";

interface Props {
  filas: FilaSeguimiento[];
  aulas: { id: string; etiqueta: string }[];
}

/**
 * "Tabla de seguimiento de alumnos matriculados con filtros por aula y
 * estado de tareas" (HITO 4, 2.B — KPIs del Aula del panel docente).
 *
 * Es ADITIVA a la tabla "Estudiantes" de `/docente` (que viene del registro
 * libre de PMV1, sin aula): esta otra es, literalmente, quién está
 * MATRICULADO en una de las aulas del docente (HITO 3) —population distinta,
 * a veces solapada, a veces no—. Los filtros son locales: las filas ya
 * llegan calculadas desde el servidor, no hace falta una ida y vuelta por
 * cada cambio de filtro.
 */
export function SeguimientoMatriculados({ filas, aulas }: Props) {
  const [aulaId, setAulaId] = useState("");
  const [estado, setEstado] = useState<FiltroEstado>("todos");

  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      if (aulaId && f.aulaId !== aulaId) return false;
      if (estado === "al_dia" && f.tareasVencidasSinEntregar > 0) return false;
      if (estado === "con_vencidas" && f.tareasVencidasSinEntregar === 0) return false;
      return true;
    });
  }, [filas, aulaId, estado]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seguimiento de alumnos matriculados</CardTitle>
        <CardDescription>
          {filas.length === 0
            ? "Todavía no tienes alumnos matriculados en ninguna aula."
            : `${filtradas.length} de ${filas.length} alumno(s).`}
        </CardDescription>
      </CardHeader>
      {filas.length > 0 && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="filtro-aula">Aula</Label>
              <Select id="filtro-aula" value={aulaId} onChange={(e) => setAulaId(e.target.value)} className="h-9 w-64">
                <option value="">Todas las aulas</option>
                {aulas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.etiqueta}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="filtro-estado-tareas">Estado de tareas</Label>
              <Select
                id="filtro-estado-tareas"
                value={estado}
                onChange={(e) => setEstado(e.target.value as FiltroEstado)}
                className="h-9 w-56"
              >
                <option value="todos">Todos</option>
                <option value="al_dia">Al día</option>
                <option value="con_vencidas">Con tareas vencidas</option>
              </Select>
            </div>
          </div>

          {filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ningún alumno coincide con el filtro.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Alumno</th>
                    <th className="pb-2 font-medium">Aula</th>
                    <th className="pb-2 font-medium">Tareas vencidas sin entregar</th>
                    <th className="pb-2 font-medium">Riesgo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((f) => (
                    <tr key={`${f.aulaId}-${f.estudianteId}`} className="border-b last:border-0">
                      <td className="py-3">
                        <div className="font-medium">{f.nombre}</div>
                        <div className="text-muted-foreground">{f.email}</div>
                      </td>
                      <td className="py-3 text-muted-foreground">{f.aulaEtiqueta}</td>
                      <td className="py-3 tabular-nums">
                        {f.tareasVencidasSinEntregar === 0 ? (
                          <span className="text-muted-foreground">Al día</span>
                        ) : (
                          f.tareasVencidasSinEntregar
                        )}
                      </td>
                      <td className="py-3">
                        <span
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-xs font-medium",
                            COLOR_RIESGO[f.riesgo],
                          )}
                        >
                          {ETIQUETA_RIESGO[f.riesgo]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
