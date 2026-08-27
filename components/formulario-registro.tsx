"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioRegistro() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const datos = new FormData(e.currentTarget);
    const cuerpo = {
      nombre: String(datos.get("nombre") ?? ""),
      email: String(datos.get("email") ?? ""),
      password: String(datos.get("password") ?? ""),
      ciclo: String(datos.get("ciclo") ?? ""),
      grado: String(datos.get("grado") ?? ""),
    };

    const respuesta = await fetch("/api/registro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });

    if (!respuesta.ok) {
      const datosError = await respuesta.json().catch(() => ({}));
      setError(datosError.error ?? "No se pudo completar el registro.");
      setEnviando(false);
      return;
    }

    // Se entra directamente: pedirle al alumno que vuelva a escribir lo que
    // acaba de escribir no aporta nada.
    const acceso = await signIn("credentials", {
      email: cuerpo.email,
      password: cuerpo.password,
      redirect: false,
    });

    if (!acceso || acceso.error) {
      router.push("/login");
      return;
    }

    router.push("/estudiante/diagnostico");
    router.refresh();
  }

  return (
    <form onSubmit={alEnviar} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre completo</Label>
        <Input id="nombre" name="nombre" required minLength={2} maxLength={120} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="tu@correo.com"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="ciclo">Ciclo</Label>
          <Input id="ciclo" name="ciclo" placeholder="Secundaria" maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="grado">Grado</Label>
          <Input id="grado" name="grado" placeholder="3º" maxLength={80} />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {enviando ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
