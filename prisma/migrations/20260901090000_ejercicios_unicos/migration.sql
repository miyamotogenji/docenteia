-- Un mismo enunciado, en su tema y su nivel, es UN ejercicio.
--
-- La semilla vuelve a sembrar el banco en cada despliegue. Sin esta
-- restricción no habría con qué reconocerlo, así que cada despliegue
-- duplicaría las 393 filas en lugar de actualizarlas.
--
-- Se limpian antes los duplicados que pudiera haber, conservando el más
-- antiguo de cada grupo: es el que ya tiene el progreso colgado.
DELETE FROM "ejercicios" a
USING "ejercicios" b
WHERE a."tema" = b."tema"
  AND a."nivel" = b."nivel"
  AND a."enunciado" = b."enunciado"
  AND a."creadoEn" > b."creadoEn";

CREATE UNIQUE INDEX "ejercicios_tema_nivel_enunciado_key"
  ON "ejercicios" ("tema", "nivel", "enunciado");
