-- Recuperación de contraseña por email (forgot/reset-password).
-- Token de un solo uso + expiry en la tabla users.
ALTER TABLE "users" ADD COLUMN "passwordResetToken" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordResetExpiry" TIMESTAMP(3);

CREATE UNIQUE INDEX "users_passwordResetToken_key" ON "users"("passwordResetToken");
