"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function FormularioLogin() {
  const router = useRouter();
  const params = useSearchParams();
  const volverA = params.get("volverA");

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const datos = new FormData(e.currentTarget);
    const resultado = await signIn("credentials", {
      email: String(datos.get("email") ?? ""),
      password: String(datos.get("password") ?? ""),
      redirect: false,
    });

    if (!resultado || resultado.error) {
      // Mensaje deliberadamente genérico: no se distingue "no existe ese
      // correo" de "la contraseña no es correcta", para no confirmar qué
      // cuentas están registradas.
      setError("Correo o contraseña incorrectos.");
      setEnviando(false);
      return;
    }

    // La portada redirige a la zona que corresponde al rol, así que no hace
    // falta conocerlo aquí.
    router.push(volverA || "/");
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
          autoComplete="current-password"
          required
        />
      </div>

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {enviando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
