/**
 * Qué retroalimentación sigue en pantalla y cuál se retira.
 *
 * En la práctica conviven dos jueces. El servidor recalcula la solución y
 * devuelve el veredicto —con una pista del método cuando el alumno falla—, y el
 * motor local lleva su propia ramificación pedagógica y canta el acierto en
 * cuanto lo detecta. Cada uno pinta su caja: la del servidor y el mensaje del
 * tutor.
 *
 * Al acertar, el alumno veía a la vez el "¡Correcto! Continuemos." en verde y,
 * justo encima, la caja roja con la pista del intento ANTERIOR. Pasa por dos
 * caminos distintos, y por eso no basta con arreglar uno:
 *
 *   · la corrección del servidor no llega —sesión caducada, un 401, un fallo de
 *     red— y el veredicto viejo se queda tal cual estaba;
 *   · o llega, pero el motor local ya ha cantado el acierto antes.
 *
 * La regla es la misma en los dos casos: una pista pertenece al intento que la
 * provocó. Si el alumno ya ha acertado, esa pista sobra.
 *
 * Vive en `lib/` y no dentro del componente para que la suite pueda comprobarla
 * sin montar React, y sin arrastrar el motor determinista al paquete del
 * navegador.
 */

export interface VeredictoVisible {
  correcto: boolean | null;
  verificable: boolean;
  mensaje?: string;
  pista?: string;
}

/**
 * El veredicto que debe quedar en pantalla cuando el alumno acierta.
 *
 * Se conserva el del servidor si también dice que es correcto —es el que lleva
 * la confirmación— y se retira cualquier otro: la pista de un intento fallado
 * no puede sobrevivir al acierto.
 */
export function veredictoTrasAcierto(actual: VeredictoVisible | null): VeredictoVisible | null {
  return actual?.correcto === true ? actual : null;
}

/**
 * ¿Se compone la caja de ayuda? Sólo con una pista o un mensaje que decir, y
 * nunca sobre un veredicto correcto.
 */
export function hayQueMostrarAyuda(v: VeredictoVisible | null): boolean {
  if (!v || v.correcto === true) return false;
  return Boolean(v.pista ?? v.mensaje);
}
