"use client";

import { useEffect, useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { pedir } from "@/lib/docente/cliente";
import { ROLES, ETIQUETA_ROL } from "@/lib/rbac";
import { cn } from "@/lib/utils";

interface UsuarioVista {
  id: string;
  nombre: string;
  email: string;
  rol: (typeof ROLES)[number];
  activo: boolean;
  creadoEn: string;
  institucionId: string | null;
  institucion: string | null;
}

interface Props {
  /** El id de quien está viendo el panel: sus propios controles se desactivan. */
  miPropioId: string;
}

// Mismo criterio que `rolUsaInstitucion` en lib/admin/usuarios.ts: un
// SUPERADMIN también puede vincularse a un colegio, para crear aulas o
// entrar a un panel institucional con su propia cuenta.
const USA_INSTITUCION = new Set(["DOCENTE", "DIRECTOR", "SUPERADMIN"]);

/**
 * "3.B Control de Accesos y Gestión de Usuarios" (HITO 4 — cierre PMV2):
 * listado filtrable por rol, activar/suspender, reasignar rol, vincular a
 * una institución.
 */
export function GestorUsuarios({ miPropioId }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioVista[] | "cargando">("cargando");
  const [instituciones, setInstituciones] = useState<{ id: string; nombre: string }[]>([]);
  const [filtroRol, setFiltroRol] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [aviso, setAviso] = useState<{ tono: "ok" | "mal"; texto: string } | null>(null);
  const [guardando, setGuardando] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  const cargar = () => {
    setUsuarios("cargando");
    iniciar(async () => {
      const parametros = new URLSearchParams();
      if (filtroRol) parametros.set("rol", filtroRol);
      if (busqueda.trim()) parametros.set("q", busqueda.trim());
      const r = await pedir<{ usuarios: UsuarioVista[]; instituciones: { id: string; nombre: string }[] }>(
        `/api/admin/usuarios?${parametros.toString()}`,
      );
      if (r.ok) {
        setUsuarios(r.datos.usuarios);
        setInstituciones(r.datos.instituciones);
      } else {
        setUsuarios([]);
        setAviso({ tono: "mal", texto: r.error });
      }
    });
  };

  // Se recarga cuando cambian los filtros —con un pequeño respiro para la
  // búsqueda de texto, que si no dispara una petición por cada tecla—.
  useEffect(() => {
    const t = setTimeout(cargar, busqueda ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroRol, busqueda]);

  const actualizar = async (id: string, cambios: Record<string, unknown>) => {
    setGuardando(id);
    const r = await pedir<{ usuario: UsuarioVista }>(`/api/admin/usuarios/${id}`, {
      metodo: "PATCH",
      cuerpo: cambios,
    });
    setGuardando(null);
    if (!r.ok) {
      setAviso({ tono: "mal", texto: r.error });
      return;
    }
    setUsuarios((us) => (us === "cargando" ? us : us.map((u) => (u.id === id ? r.datos.usuario : u))));
    setAviso(null);
  };

  return (
    <div className="space-y-4">
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

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="filtro-rol">Rol</Label>
          <Select id="filtro-rol" value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ETIQUETA_ROL[r]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filtro-busqueda">Buscar</Label>
          <Input
            id="filtro-busqueda"
            placeholder="Nombre o correo"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {usuarios === "cargando" ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay usuarios que coincidan con el filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Nombre</th>
                <th className="px-3 py-2">Correo</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Institución</th>
                <th className="px-3 py-2">Acceso</th>
              </tr>
            </thead>
            <tbody>
              {usuarios.map((u) => {
                const esUnoMismo = u.id === miPropioId;
                return (
                  <tr key={u.id} className="border-t">
                    <td className="px-3 py-2 font-medium">
                      {u.nombre}
                      {esUnoMismo && (
                        <Badge variant="contorno" className="ml-2 text-[0.65rem]">
                          tú
                        </Badge>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{u.email}</td>
                    <td className="px-3 py-2">
                      <Select
                        value={u.rol}
                        disabled={esUnoMismo || guardando === u.id}
                        onChange={(e) => actualizar(u.id, { rol: e.target.value })}
                        className="h-8 py-0 text-xs"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ETIQUETA_ROL[r]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-3 py-2">
                      {USA_INSTITUCION.has(u.rol) ? (
                        <Select
                          value={u.institucionId ?? ""}
                          disabled={guardando === u.id}
                          onChange={(e) => actualizar(u.id, { institucionId: e.target.value || null })}
                          className="h-8 py-0 text-xs"
                        >
                          <option value="">Sin institución</option>
                          {instituciones.map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.nombre}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        size="sm"
                        variant={u.activo ? "outline" : "destructive"}
                        disabled={esUnoMismo || guardando === u.id}
                        onClick={() => actualizar(u.id, { activo: !u.activo })}
                      >
                        {u.activo ? "Activo" : "Suspendido"}
                      </Button>
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
