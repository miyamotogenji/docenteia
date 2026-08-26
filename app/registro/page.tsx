import Link from "next/link";
import type { Metadata } from "next";

import { FormularioRegistro } from "@/components/formulario-registro";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function PaginaRegistro() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Crear cuenta de estudiante</CardTitle>
          <CardDescription>
            Al terminar harás una evaluación de cinco preguntas para situar tu
            nivel de partida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioRegistro />
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Inicia sesión
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
