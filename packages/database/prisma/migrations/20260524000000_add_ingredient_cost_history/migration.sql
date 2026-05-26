-- CreateTable
CREATE TABLE "ingredient_cost_history" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "purchaseCost" DOUBLE PRECISION,
    "purchaseUnit" TEXT,
    "conversionFactor" DOUBLE PRECISION,
    "changedBy" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_cost_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ingredient_cost_history_ingredientId_createdAt_idx"
    ON "ingredient_cost_history"("ingredientId", "createdAt");

-- AddForeignKey
ALTER TABLE "ingredient_cost_history"
    ADD CONSTRAINT "ingredient_cost_history_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
