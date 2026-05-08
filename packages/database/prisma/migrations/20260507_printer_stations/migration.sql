-- Fase 5 — KDS multi-estación.
-- Lista de estaciones que un KDS vigila. Vacío = fallback a Printer.type.
ALTER TABLE "Printer" ADD COLUMN "stations" TEXT[] NOT NULL DEFAULT '{}';
