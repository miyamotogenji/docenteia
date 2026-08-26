import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";

import { FormularioLogin } from "@/components/formulario-login";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function PaginaLogin() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Accede con tu correo y contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams obliga a un límite de Suspense en Next 15. */}
          <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
            <FormularioLogin />
          </Suspense>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-primary hover:underline">
              Regístrate como estudiante
            </Link>
          </p>
        </CardFooter>
      </Card>
    </main>
  );
}
