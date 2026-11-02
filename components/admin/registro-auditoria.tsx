"use client";

import { useEffect, useState, useTransition } from "react";

import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pedir } from "@/lib/docente/cliente";

interface EntradaAuditoria {
  id: string;
  accion: string;
  entidad: string;
  entidadId: string;
  datosPrevios: Record<string, unknown> | null;
  datosNuevos: Record<string, unknown> | null;
  creadoEn: string;
  autor: string | null;
  autorEmail: string | null;
}

const ETIQUETA_ACCION: Record<string, string> = {
  ROL_MODIFICADO: "Rol modificado",
  CUENTA_ACTIVADA: "Cuenta activada",
  CUENTA_SUSPENDIDA: "Cuenta suspendida",
  INSTITUCION_VINCULADA: "Institución vinculada",
  INSTITUCION_DESVINCULADA: "Institución desvinculada",
  MATRICULA_CREADA: "Matrícula creada",
};

function textoValor(v: unknown): string {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

/**
 * "Auditoría y control de trazabilidad" (observación del cliente, cierre
 * HITO 4: "el sistema no registra qué usuario ejecuta las acciones
 * administrativas... se sugiere incorporar una tabla de auditoría").
 *
 * Sólo lectura, a propósito: esta pantalla no tiene ninguna acción que
 * deshacer o repetir, es el historial de lo que YA pasó en las otras.
 */
export function RegistroAuditoria() {
  const [entradas, setEntradas] = useState<EntradaAuditoria[] | "cargando">("cargando");
  const [filtroEntidad, setFiltroEntidad] = useState("");
  const [, iniciar] = useTransition();

  useEffect(() => {
    iniciar(async () => {
      const parametros = new URLSearchParams();
      if (filtroEntidad) parametros.set("entidad", filtroEntidad);
      const r = await pedir<{ entradas: EntradaAuditoria[] }>(`/api/admin/auditoria?${parametros.toString()}`);
      setEntradas(r.ok ? r.datos.entradas : []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEntidad]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-entidad-auditoria">Tipo</Label>
          <Select
            id="filtro-entidad-auditoria"
            value={filtroEntidad}
            onChange={(e) => setFiltroEntidad(e.target.value)}
          >
            <option value="">Todo</option>
            <option value="Usuario">Usuarios</option>
            <option value="Matricula">Matrículas</option>
          </Select>
        </div>
      </div>

      {entradas === "cargando" ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : entradas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay acciones registradas.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Quién</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Sobre</th>
                <th className="px-3 py-2">Cambio</th>
              </tr>
            </thead>
            <tbody>
              {entradas.map((e) => {
                const previos = e.datosPrevios ?? {};
                const nuevos = e.datosNuevos ?? {};
                const campos = Array.from(new Set([...Object.keys(previos), ...Object.keys(nuevos)]));
                return (
                  <tr key={e.id} className="border-t align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                      {new Date(e.creadoEn).toLocaleString("es")}
                    </td>
                    <td className="px-3 py-2">{e.autor ?? "—"}</td>
                    <td className="px-3 py-2 font-medium">{ETIQUETA_ACCION[e.accion] ?? e.accion}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {e.entidad} · {e.entidadId.slice(0, 8)}…
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {campos.length === 0
                        ? "—"
                        : campos.map((campo) => (
                            <div key={campo}>
                              {campo}: {textoValor(previos[campo])} → {textoValor(nuevos[campo])}
                            </div>
                          ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
