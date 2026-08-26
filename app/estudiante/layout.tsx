import { Cabecera } from "@/components/cabecera";

export default function LayoutEstudiante({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen">
      <Cabecera />
      <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
    </div>
  );
}
