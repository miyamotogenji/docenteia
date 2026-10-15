/**
 * LÍMITE DE TASA (HITO 4 — cierre PMV2), en memoria.
 *
 * El pliego pide Upstash Redis o Vercel KV "o caché en memoria con ventana
 * deslizante" como alternativa válida. Es la única que se puede construir
 * aquí: ni Upstash ni Vercel KV se pueden aprovisionar desde este entorno
 * —hacen falta cuenta y credenciales que no existen—, así que esto es la
 * opción en memoria que el propio pliego contempla, no un atajo.
 *
 * SU LÍMITE REAL, CON TODAS LAS LETRAS: en una función serverless de Vercel
 * cada petición puede caer en una instancia distinta (o una fría, con la
 * memoria vacía), así que el conteo es "mejor esfuerzo" por instancia, NO un
 * tope global estricto entre todas las instancias a la vez —un atacante con
 * tráfico repartido entre varias instancias frías podría superar el número
 * nominal—. Sigue cerrando el caso simple (un cliente insistiendo en bucle
 * desde la misma conexión, que es lo que de verdad se ha visto), y deja listo
 * el punto exacto —estas dos funciones— para cambiar a Redis compartido el
 * día que haya credenciales de verdad, sin tocar las rutas que las llaman.
 *
 * Vive en un módulo de servidor aparte, puro en su lógica (sin Next.js ni
 * Prisma), para que la suite de QA pueda probar las reglas con relojes de
 * mentira, sin levantar servidor.
 */

interface VentanaDeslizante {
  intentos: number[]; // timestamps, ms
}

interface EstadoDeBloqueo {
  fallosConsecutivos: number;
  bloqueadoHasta: number | null;
}

const ventanas = new Map<string, VentanaDeslizante>();
const bloqueos = new Map<string, EstadoDeBloqueo>();

// Limpieza perezosa: sin temporizador en segundo plano —un runtime
// serverless no garantiza que siga vivo entre peticiones—, se purgan
// entradas agotadas cada cierto número de llamadas, repartido entre los dos
// mapas para que ninguno crezca sin límite en un proceso de larga vida
// (`next start`, o una instancia que Vercel mantiene caliente).
let llamadas = 0;
const CADA_CUANTO_LIMPIAR = 200;

function limpiarSiToca(ahora: number) {
  llamadas++;
  if (llamadas % CADA_CUANTO_LIMPIAR !== 0) return;
  for (const [clave, v] of ventanas) {
    if (v.intentos.length === 0 || ahora - v.intentos[v.intentos.length - 1] > 10 * 60_000) {
      ventanas.delete(clave);
    }
  }
  for (const [clave, b] of bloqueos) {
    if (!b.bloqueadoHasta && b.fallosConsecutivos === 0) bloqueos.delete(clave);
    else if (b.bloqueadoHasta && ahora - b.bloqueadoHasta > 60 * 60_000) bloqueos.delete(clave);
  }
}

export interface ResultadoDeTasa {
  permitido: boolean;
  /** Milisegundos hasta que se pueda reintentar. 0 si `permitido` es true. */
  reintentarEnMs: number;
}

/**
 * ¿Puede `clave` hacer un intento más dentro de `maximo` por `ventanaMs`?
 *
 * Cuenta el intento EN LA MISMA LLAMADA si lo permite —no hay un segundo
 * paso para "ahora sí cuenta", que es donde se cuelan los bypasses—. La
 * clave debe llevar su propio prefijo de uso (p. ej. `"unirse:" + userId`):
 * este módulo no distingue para qué se está limitando, sólo cuenta.
 */
export function permiteIntento(
  clave: string,
  maximo: number,
  ventanaMs: number,
  ahora: number = Date.now(),
): ResultadoDeTasa {
  limpiarSiToca(ahora);

  const v = ventanas.get(clave) ?? { intentos: [] };
  const vigentes = v.intentos.filter((t) => ahora - t < ventanaMs);

  if (vigentes.length >= maximo) {
    ventanas.set(clave, { intentos: vigentes });
    return { permitido: false, reintentarEnMs: Math.max(0, ventanaMs - (ahora - vigentes[0])) };
  }

  vigentes.push(ahora);
  ventanas.set(clave, { intentos: vigentes });
  return { permitido: true, reintentarEnMs: 0 };
}

/**
 * El bloqueo de inicio de sesión: no es una ventana de N intentos, es N
 * FALLOS SEGUIDOS → bloqueo por un tiempo fijo. Un acierto intercalado
 * reinicia la cuenta (`registrarExito`): es el ataque de fuerza bruta real
 * —muchos fallos en fila— el que se corta, no un alumno que se equivoca una
 * vez de tanto en tanto en semanas distintas.
 */
export function bloqueoDeLogin(clave: string, ahora: number = Date.now()): ResultadoDeTasa {
  limpiarSiToca(ahora);
  const estado = bloqueos.get(clave);
  if (!estado?.bloqueadoHasta) return { permitido: true, reintentarEnMs: 0 };
  if (ahora >= estado.bloqueadoHasta) {
    bloqueos.delete(clave);
    return { permitido: true, reintentarEnMs: 0 };
  }
  return { permitido: false, reintentarEnMs: estado.bloqueadoHasta - ahora };
}

/** Registra un fallo de login; bloquea `clave` si llega a `maximoFallos` seguidos. */
export function registrarFalloDeLogin(
  clave: string,
  maximoFallos: number,
  bloqueoMs: number,
  ahora: number = Date.now(),
): void {
  const estado = bloqueos.get(clave) ?? { fallosConsecutivos: 0, bloqueadoHasta: null };
  estado.fallosConsecutivos++;
  if (estado.fallosConsecutivos >= maximoFallos) {
    estado.bloqueadoHasta = ahora + bloqueoMs;
  }
  bloqueos.set(clave, estado);
}

/** Un acierto borra el historial de fallos de `clave` por completo. */
export function registrarExitoDeLogin(clave: string): void {
  bloqueos.delete(clave);
}

/** Sólo para la suite de QA: vacía los mapas entre pruebas independientes. */
export function reiniciarLimitesParaPruebas(): void {
  ventanas.clear();
  bloqueos.clear();
  llamadas = 0;
}

/**
 * `reintentarEnMs`, en segundos enteros —lo que de verdad espera la
 * cabecera HTTP `Retry-After`—. Puro a propósito: construir la
 * `NextResponse` con ella es cosa de la ruta, que es quien importa
 * `next/server` —este módulo no lo hace, para que la suite de QA pueda
 * importarlo con Node a secas, sin el empaquetador de Next en medio—.
 */
export function segundosParaReintentar(reintentarEnMs: number): number {
  return Math.max(1, Math.ceil(reintentarEnMs / 1000));
}

/**
 * La IP del cliente, del único cabecero que Vercel garantiza rellenar en
 * cada petición (`x-forwarded-for`, el primero de la lista —entre el
 * cliente y el primer proxy de confianza—). Sin cabecero —entorno local,
 * sin proxy— cae a un valor fijo: en desarrollo no hay ataque real que
 * limitar, y usar `null`/vacío como clave mezclaría a todo el mundo en el
 * mismo cubo.
 */
export function ipDeLaPeticion(req: Request): string {
  const reenviada = req.headers.get("x-forwarded-for");
  if (reenviada) return reenviada.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "desconocida";
}
