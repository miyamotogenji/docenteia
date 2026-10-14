/**
 * Racha de días consecutivos de práctica (HITO 4, sección 2.A — dashboard del
 * estudiante).
 *
 * Cuenta días de calendario DISTINTOS con al menos un rastro de práctica
 * (una respuesta calificada o una sesión terminada), consecutivos hacia
 * atrás desde hoy. Si hoy todavía no hay nada pero AYER sí, la racha sigue
 * viva —el alumno puede no haber abierto la plataforma todavía hoy, y
 * romperle la racha a medianoche sería injusto—; sólo se rompe cuando pasan
 * dos días sin rastro.
 *
 * Puro y sin base de datos, como `lib/docente/metricas.ts`: la consulta trae
 * las fechas en bruto, esto sólo cuenta.
 */
export function rachaDeDiasConsecutivos(
  fechas: readonly (Date | string)[],
  ahora: Date = new Date(),
): number {
  const dias = new Set(fechas.map((f) => claveDeDia(new Date(f))));

  const cursor = new Date(ahora);
  if (!dias.has(claveDeDia(cursor))) cursor.setDate(cursor.getDate() - 1);

  let racha = 0;
  while (dias.has(claveDeDia(cursor))) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}

function claveDeDia(fecha: Date): string {
  return `${fecha.getFullYear()}-${fecha.getMonth()}-${fecha.getDate()}`;
}
