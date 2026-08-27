-- CreateTable
CREATE TABLE "reglas_matematicas" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "tema" "Tema" NOT NULL,
    "orden" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "enunciado" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "ejemplo" TEXT,
    "nivel" "NivelAcademico",
    "practicable" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglas_matematicas_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reglas_matematicas_clave_key" ON "reglas_matematicas"("clave");

-- CreateIndex
CREATE INDEX "reglas_matematicas_tema_orden_idx" ON "reglas_matematicas"("tema", "orden");

