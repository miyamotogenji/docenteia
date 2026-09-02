"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { GRADOS, gradoPorValor } from "@/lib/diagnostico/grados";

export function FormularioRegistro() {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function alEnviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);

    const datos = new FormData(e.currentTarget);
    // El curso se elige de una lista cerrada y de él salen el ciclo y el grado.
    // De este dato depende QUÉ PRUEBA se le presenta al alumno, y "3º" escrito
    // de seis maneras distintas son seis alumnos que no se pueden clasificar.
    const curso = gradoPorValor(String(datos.get("curso") ?? ""));
    const cuerpo = {
      nombre: String(datos.get("nombre") ?? ""),
      email: String(datos.get("email") ?? ""),
      password: String(datos.get("password") ?? ""),
      ciclo: curso?.ciclo ?? "",
      grado: curso?.grado ?? "",
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

      <div className="space-y-2">
        <Label htmlFor="curso">¿En qué curso estás?</Label>
        <Select id="curso" name="curso" defaultValue="">
          <option value="">Prefiero no decirlo</option>
          {GRADOS.map((g) => (
            <option key={g.valor} value={g.valor}>
              {g.etiqueta}
            </option>
          ))}
        </Select>
        <p className="text-xs text-muted-foreground">
          Con esto ajustamos la evaluación inicial a tu curso. Si no lo dices, empezaremos por lo
          más básico.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
        {enviando ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
