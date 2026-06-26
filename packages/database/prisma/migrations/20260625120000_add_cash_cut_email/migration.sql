-- Corte de caja por correo: toggle + lista de destinatarios por restaurante.
-- cashCutEmailEnabled: si true, al cerrar el turno se manda el corte por email.
-- cashCutEmails: lista separada por coma/; — vacío cae a los correos de los admins.
ALTER TABLE "restaurant_config"
  ADD COLUMN "cashCutEmailEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "cashCutEmails" TEXT;
