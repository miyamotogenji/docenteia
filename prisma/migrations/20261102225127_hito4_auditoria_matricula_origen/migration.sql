-- CreateEnum
CREATE TYPE "OrigenMatricula" AS ENUM ('CODIGO_INVITACION', 'ADMIN', 'DOCENTE');

-- AlterTable
ALTER TABLE "matriculas" ADD COLUMN     "creadoPorId" TEXT,
ADD COLUMN     "origen" "OrigenMatricula" NOT NULL DEFAULT 'CODIGO_INVITACION';

-- CreateTable
CREATE TABLE "logs_auditoria" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT,
    "accion" TEXT NOT NULL,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "datosPrevios" JSONB,
    "datosNuevos" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "logs_auditoria_entidad_entidadId_idx" ON "logs_auditoria"("entidad", "entidadId");

-- CreateIndex
CREATE INDEX "logs_auditoria_usuarioId_idx" ON "logs_auditoria"("usuarioId");

-- AddForeignKey
ALTER TABLE "matriculas" ADD CONSTRAINT "matriculas_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logs_auditoria" ADD CONSTRAINT "logs_auditoria_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
