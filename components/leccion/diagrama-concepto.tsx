"use client";

import { tieneDiagrama } from "@/lib/leccion/diagramas";

/**
 * Diagramas de la fase de Concepto (Módulo 7).
 *
 * La idea de una derivada es geométrica —la pendiente de la recta tangente en
 * un punto— y contarla sólo con palabras deja fuera lo que mejor la explica.
 * Aquí se dibuja: la curva, el punto y su tangente.
 *
 * Son SVG estáticos y deterministas: nada que generar, nada que pueda salir
 * mal en tiempo de ejecución. Cada tema tiene el suyo cuando aporta algo; si no
 * hay diagrama para un tema, no se dibuja nada y la fase sigue funcionando.
 */

/** Parábola y = x², su punto en x = 1 y la tangente allí (pendiente 2). */
function CurvaYTangente() {
  // Coordenadas del lienzo: x de 0 a 240, y de 0 a 150 (crece hacia abajo).
  // La parábola se dibuja punto a punto para que la curva sea la real y no una
  // aproximación a ojo con curvas de Bézier.
  const puntos: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = -2 + (i * 4) / 40; // de -2 a 2
    const y = x * x; // de 0 a 4
    puntos.push(`${120 + x * 50},${130 - y * 28}`);
  }

  // Punto de tangencia en x = 1 → y = 1, pendiente 2.
  const px = 120 + 1 * 50;
  const py = 130 - 1 * 28;
  // La tangente y = 2x - 1, dibujada de x = 0 a x = 2.
  const t1x = 120 + 0 * 50;
  const t1y = 130 - (2 * 0 - 1) * 28;
  const t2x = 120 + 2 * 50;
  const t2y = 130 - (2 * 2 - 1) * 28;

  return (
    <svg viewBox="0 0 240 150" className="h-auto w-full max-w-sm" role="img"
      aria-label="Una parábola con su recta tangente en un punto: la pendiente de esa recta es la derivada.">
      {/* Ejes */}
      <line x1="20" y1="130" x2="230" y2="130" className="stroke-muted-foreground/40" strokeWidth="1" />
      <line x1="120" y1="10" x2="120" y2="145" className="stroke-muted-foreground/40" strokeWidth="1" />

      {/* La curva */}
      <polyline
        points={puntos.join(" ")}
        fill="none"
        className="stroke-primary"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* La tangente: es la recta cuya pendiente ES la derivada en ese punto */}
      <line
        x1={t1x}
        y1={t1y}
        x2={t2x}
        y2={t2y}
        className="stroke-amber-500"
        strokeWidth="2"
        strokeDasharray="5 3"
      />

      {/* El punto de tangencia */}
      <circle cx={px} cy={py} r="4" className="fill-amber-500" />

      <text x={t2x - 4} y={t2y - 6} className="fill-amber-600 text-[9px]">
        pendiente = 2
      </text>
      <text x="126" y="24" className="fill-muted-foreground text-[9px]">
        y = x²
      </text>
    </svg>
  );
}

/** Un todo dividido en partes iguales: la idea de fracción. */
function PartesDeUnTodo() {
  const partes = [0, 1, 2, 3];
  return (
    <svg viewBox="0 0 240 90" className="h-auto w-full max-w-sm" role="img"
      aria-label="Un rectángulo dividido en cuatro partes iguales, con una sombreada: una de cuatro.">
      {partes.map((i) => (
        <rect
          key={i}
          x={20 + i * 50}
          y="20"
          width="50"
          height="50"
          className={i === 0 ? "fill-primary/60 stroke-primary" : "fill-muted stroke-muted-foreground/40"}
          strokeWidth="1.5"
        />
      ))}
      <text x="120" y="84" textAnchor="middle" className="fill-muted-foreground text-[10px]">
        1 de 4 partes iguales
      </text>
    </svg>
  );
}

/** Una balanza en equilibrio: la idea de ecuación. */
function BalanzaEnEquilibrio() {
  return (
    <svg viewBox="0 0 240 110" className="h-auto w-full max-w-sm" role="img"
      aria-label="Una balanza equilibrada: lo que se hace a un lado hay que hacerlo al otro.">
      {/* Soporte */}
      <line x1="120" y1="30" x2="120" y2="90" className="stroke-muted-foreground" strokeWidth="2.5" />
      <line x1="95" y1="90" x2="145" y2="90" className="stroke-muted-foreground" strokeWidth="2.5" />
      {/* Brazo */}
      <line x1="40" y1="30" x2="200" y2="30" className="stroke-muted-foreground" strokeWidth="2.5" />
      {/* Platillos */}
      <rect x="20" y="32" width="40" height="22" rx="3" className="fill-primary/50 stroke-primary" strokeWidth="1.5" />
      <rect x="180" y="32" width="40" height="22" rx="3" className="fill-primary/50 stroke-primary" strokeWidth="1.5" />
      <text x="40" y="47" textAnchor="middle" className="fill-foreground text-[10px]">2x + 5</text>
      <text x="200" y="47" textAnchor="middle" className="fill-foreground text-[10px]">15</text>
      <text x="120" y="106" textAnchor="middle" className="fill-muted-foreground text-[9px]">
        lo que hagas a un lado, hazlo al otro
      </text>
    </svg>
  );
}

const DIAGRAMAS: Record<string, () => React.ReactElement> = {
  DERIVADAS: CurvaYTangente,
  FRACCIONES: PartesDeUnTodo,
  ECUACIONES_LINEALES: BalanzaEnEquilibrio,
};

/** Diagrama del tema, o nada si ese tema no tiene uno. */
export function DiagramaConcepto({ tema }: { tema: string }) {
  // La lista de temas con diagrama vive en lib/leccion/diagramas.ts, que es la
  // que consulta también la suite; aquí sólo se resuelve el componente.
  if (!tieneDiagrama(tema)) return null;
  const Diagrama = DIAGRAMAS[tema];
  if (!Diagrama) return null;
  return (
    <div className="flex justify-center rounded-md border bg-muted/20 p-3">
      <Diagrama />
    </div>
  );
}
