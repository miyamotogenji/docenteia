import type { Metadata } from "next";

import { ProveedorSesion } from "@/components/proveedor-sesion";

import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "MentorIA Math",
    template: "%s · MentorIA Math",
  },
  description:
    "Plataforma educativa de matemáticas con tutor de IA, validación determinista en servidor y seguimiento del progreso.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <ProveedorSesion>{children}</ProveedorSesion>
      </body>
    </html>
  );
}
