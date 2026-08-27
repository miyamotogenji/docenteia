import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { auth } from "@/auth";
import { Aula } from "@/components/leccion/aula";

export const metadata: Metadata = { title: "Lección" };

export default async function PaginaLeccion() {
  const sesion = await auth();
  if (!sesion?.user) redirect("/login");

  // El diagnóstico decide el nivel de partida, así que se hace antes de la
  // primera lección.
  if (sesion.user.rol === "ESTUDIANTE" && !sesion.user.nivelActual) {
    redirect("/estudiante/diagnostico");
  }

  return <Aula />;
}
