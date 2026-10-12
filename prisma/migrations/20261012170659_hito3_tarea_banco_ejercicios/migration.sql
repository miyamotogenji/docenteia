-- AlterTable
ALTER TABLE "tareas" ADD COLUMN     "dificultad" "NivelAcademico",
ADD COLUMN     "ejercicioIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
