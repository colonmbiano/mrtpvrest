-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'RETAIL', 'BAR', 'CAFE', 'FAST_FOOD');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CUSTOMER', 'ADMIN', 'KITCHEN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED', 'OPEN');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD_PRESENT', 'TRANSFER', 'COURTESY', 'PENDING', 'CARD', 'OXXO', 'SPEI', 'CASH_ON_DELIVERY', 'QR_CODE');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "LoyaltyTier" AS ENUM ('BRONZE', 'SILVER', 'GOLD');

-- CreateEnum
CREATE TYPE "LoyaltyTxType" AS ENUM ('EARNED', 'REDEEMED', 'EXPIRED', 'BONUS');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('MOTO', 'CARRO', 'BICI');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('GASOLINA', 'REFACCION', 'PONCHADURA', 'OTROS');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY');

-- CreateEnum
CREATE TYPE "PrinterConnection" AS ENUM ('NETWORK', 'USB', 'BLUETOOTH');

-- CreateEnum
CREATE TYPE "TaxType" AS ENUM ('VAT', 'EXCISE', 'SERVICE_CHARGE', 'TIP_SUGGESTION');

-- CreateEnum
CREATE TYPE "IngredientBaseUnit" AS ENUM ('GRAM', 'ML', 'PIECE');

-- CreateEnum
CREATE TYPE "StockMovementReason" AS ENUM ('PURCHASE', 'SALE', 'WASTE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'PREP_CONSUME', 'PREP_YIELD', 'PHYSICAL_COUNT', 'RETURN');

-- CreateEnum
CREATE TYPE "WasteReason" AS ENUM ('EXPIRED', 'DAMAGED', 'COURTESY', 'OVERPREP', 'CONTAMINATION', 'STAFF_MEAL', 'TEST_KITCHEN', 'OTHER');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "logoUrl" TEXT,
    "primaryColor" TEXT,
    "onboardingStep" INTEGER NOT NULL DEFAULT 0,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "businessType" TEXT,
    "isOnboarded" BOOLEAN NOT NULL DEFAULT false,
    "activeModules" JSONB NOT NULL DEFAULT '[]',
    "hasInventory" BOOLEAN NOT NULL DEFAULT false,
    "hasDelivery" BOOLEAN NOT NULL DEFAULT false,
    "hasWebStore" BOOLEAN NOT NULL DEFAULT false,
    "enabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "whatsappNumber" TEXT,
    "themeConfig" JSONB,
    "stripeCustomerId" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "emailVerificationExpiry" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 15,
    "maxLocations" INTEGER NOT NULL DEFAULT 1,
    "maxEmployees" INTEGER NOT NULL DEFAULT 5,
    "hasKDS" BOOLEAN NOT NULL DEFAULT false,
    "hasLoyalty" BOOLEAN NOT NULL DEFAULT false,
    "hasInventory" BOOLEAN NOT NULL DEFAULT false,
    "hasReports" BOOLEAN NOT NULL DEFAULT false,
    "hasAPIAccess" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowedModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "stripePriceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "priceSnapshot" DOUBLE PRECISION NOT NULL,
    "externalId" TEXT,
    "paymentGateway" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_configs" (
    "id" TEXT NOT NULL DEFAULT 'saas-config',
    "basicPlanPrice" DOUBLE PRECISION NOT NULL DEFAULT 29,
    "proPlanPrice" DOUBLE PRECISION NOT NULL DEFAULT 59,
    "unlimitedPlanPrice" DOUBLE PRECISION NOT NULL DEFAULT 99,
    "trialDays" INTEGER NOT NULL DEFAULT 15,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "supportEmail" TEXT,
    "openRegistration" BOOLEAN NOT NULL DEFAULT true,
    "autoTrial" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceMode" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "global_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "requests24h" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saas_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saas_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "context" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saas_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT,
    "accentColor" TEXT,
    "businessType" TEXT NOT NULL DEFAULT 'RESTAURANT',
    "aiApiKey" TEXT,
    "aiKeyValidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "businessType" "BusinessType" NOT NULL DEFAULT 'RESTAURANT',
    "hasDelivery" BOOLEAN NOT NULL DEFAULT true,
    "hasTakeaway" BOOLEAN NOT NULL DEFAULT true,
    "hasTableMap" BOOLEAN NOT NULL DEFAULT true,
    "hasOpenTabs" BOOLEAN NOT NULL DEFAULT false,
    "autoPromoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoPromoThreshold" INTEGER NOT NULL DEFAULT 10,
    "autoPromoDiscount" DOUBLE PRECISION NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'CUSTOMER',
    "avatarUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT 'Casa',
    "street" TEXT NOT NULL,
    "extNumber" TEXT NOT NULL,
    "intNumber" TEXT,
    "neighborhood" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'México',
    "zipCode" TEXT NOT NULL,
    "references" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isPromo" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "promoPrice" DOUBLE PRECISION,
    "barcode" TEXT,
    "activeDays" TEXT[],
    "hasVariants" BOOLEAN NOT NULL DEFAULT false,
    "preparationTime" INTEGER NOT NULL DEFAULT 15,
    "taxCategoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifier_groups" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "multiSelect" BOOLEAN NOT NULL DEFAULT false,
    "minSelection" INTEGER NOT NULL DEFAULT 0,
    "maxSelection" INTEGER NOT NULL DEFAULT 0,
    "freeModifiersLimit" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modifiers" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAdd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "addressId" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total" DOUBLE PRECISION NOT NULL,
    "pointsEarned" INTEGER NOT NULL DEFAULT 0,
    "pointsUsed" INTEGER NOT NULL DEFAULT 0,
    "couponId" TEXT,
    "notes" TEXT,
    "orderType" TEXT NOT NULL DEFAULT 'DELIVERY',
    "tableNumber" INTEGER,
    "tableId" TEXT,
    "numberOfGuests" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'ONLINE',
    "deliveryDriverId" TEXT,
    "deliveryAddress" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "paidAt" TIMESTAMP(3),
    "cashCollected" BOOLEAN NOT NULL DEFAULT false,
    "cashCollectedAt" TIMESTAMP(3),
    "cashCollectedBy" TEXT,
    "conektaOrderId" TEXT,
    "conektaChargeId" TEXT,
    "paymentProvider" TEXT,
    "paymentProviderRef" TEXT,
    "paymentProviderId" TEXT,
    "paymentProviderStatus" TEXT,
    "estimatedMinutes" INTEGER,
    "shiftId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "gateway" TEXT,
    "externalId" TEXT,
    "externalRef" TEXT,
    "externalStatus" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "roundId" TEXT,
    "seatNumber" INTEGER,
    "course" TEXT,
    "costSnapshot" DOUBLE PRECISION,
    "recipeIdSnap" TEXT,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_item_modifiers" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "modifierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAdd" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "order_item_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_accounts" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "totalEarned" INTEGER NOT NULL DEFAULT 0,
    "tier" "LoyaltyTier" NOT NULL DEFAULT 'BRONZE',
    "qrCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loyalty_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loyalty_transactions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "LoyaltyTxType" NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "discountType" "DiscountType" NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL,
    "minOrderAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurant_config" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "phone" TEXT,
    "whatsappNumber" TEXT,
    "address" TEXT,
    "deliveryFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "freeDeliveryFrom" DOUBLE PRECISION,
    "minOrderAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimatedDelivery" INTEGER NOT NULL DEFAULT 40,
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "closedMessage" TEXT,
    "pointsPerTen" INTEGER NOT NULL DEFAULT 1,
    "pointsValuePesos" DOUBLE PRECISION NOT NULL DEFAULT 0.10,
    "storefrontTheme" TEXT NOT NULL DEFAULT 'KAWAII',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "restaurant_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TicketConfig" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "businessName" TEXT NOT NULL,
    "header" TEXT NOT NULL DEFAULT '',
    "subheader" TEXT NOT NULL DEFAULT '',
    "footer" TEXT NOT NULL DEFAULT 'Gracias por su preferencia',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showAddress" BOOLEAN NOT NULL DEFAULT true,
    "showPhone" BOOLEAN NOT NULL DEFAULT true,
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "paperWidth" TEXT NOT NULL DEFAULT '80mm',
    "fontFamily" TEXT NOT NULL DEFAULT 'monospace',
    "fontSize" TEXT NOT NULL DEFAULT 'medium',
    "compactMode" BOOLEAN NOT NULL DEFAULT false,
    "showOrderNumber" BOOLEAN NOT NULL DEFAULT true,
    "showCustomerData" BOOLEAN NOT NULL DEFAULT true,
    "showItemsPrice" BOOLEAN NOT NULL DEFAULT true,
    "showWifi" BOOLEAN NOT NULL DEFAULT false,
    "wifiSsid" TEXT,
    "wifiPassword" TEXT,
    "showPoints" BOOLEAN NOT NULL DEFAULT true,
    "showTip" BOOLEAN NOT NULL DEFAULT true,
    "tipSuggestions" TEXT NOT NULL DEFAULT '[10,15,20]',
    "kitchenHeader" TEXT NOT NULL DEFAULT '*** COCINA ***',
    "kitchenLayout" TEXT,
    "adminPin" TEXT NOT NULL DEFAULT '0000',
    "kitchenShowCustomer" BOOLEAN NOT NULL DEFAULT true,
    "kitchenShowTable" BOOLEAN NOT NULL DEFAULT true,
    "kitchenShowType" BOOLEAN NOT NULL DEFAULT true,
    "kitchenShowTime" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Printer" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'KITCHEN',
    "connectionType" "PrinterConnection" NOT NULL DEFAULT 'NETWORK',
    "ip" TEXT,
    "port" INTEGER NOT NULL DEFAULT 9100,
    "usbPort" TEXT,
    "bluetoothAddress" TEXT,
    "supportsCashDrawer" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "categories" TEXT[],
    "stations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Printer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_groups" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "printer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "printer_group_members" (
    "id" TEXT NOT NULL,
    "printerGroupId" TEXT NOT NULL,
    "printerId" TEXT NOT NULL,

    CONSTRAINT "printer_group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_printer_groups" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "printerGroupId" TEXT NOT NULL,

    CONSTRAINT "category_printer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_item_printer_groups" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "printerGroupId" TEXT NOT NULL,

    CONSTRAINT "menu_item_printer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Banner" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "imageUrl" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'NONE',
    "linkValue" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "scheduleDays" TEXT NOT NULL DEFAULT '[]',
    "scheduleStart" TEXT NOT NULL DEFAULT '',
    "scheduleEnd" TEXT NOT NULL DEFAULT '',
    "dateFrom" TIMESTAMP(3),
    "dateTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Banner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "typeId" TEXT,
    "categoryId" TEXT,
    "baseUnit" "IngredientBaseUnit" NOT NULL DEFAULT 'PIECE',
    "unit" TEXT NOT NULL DEFAULT 'pz',
    "purchaseUnit" TEXT,
    "purchaseQty" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "purchaseCost" DOUBLE PRECISION,
    "conversionFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "pesoBruto" DOUBLE PRECISION,
    "pesoNeto" DOUBLE PRECISION,
    "stock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minStock" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "barcode" TEXT,
    "isPackaging" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_batches" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "currentStock" DOUBLE PRECISION NOT NULL,
    "cost" DOUBLE PRECISION NOT NULL,
    "sku" TEXT,
    "expirationDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeItem" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT,
    "menuItemId" TEXT,
    "ingredientId" TEXT,
    "subRecipeId" TEXT,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" "IngredientBaseUnit" NOT NULL DEFAULT 'GRAM',
    "wastagePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waiter" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "pin" TEXT NOT NULL,
    "photo" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tables" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waiter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaiterShift" (
    "id" TEXT NOT NULL,
    "waiterId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaiterShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "name" TEXT NOT NULL,
    "photo" TEXT,
    "phone" TEXT,
    "pin" TEXT NOT NULL,
    "offlinePin" TEXT,
    "role" TEXT NOT NULL DEFAULT 'WAITER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "tables" TEXT[],
    "scheduleStart" TEXT,
    "scheduleEnd" TEXT,
    "scheduleDays" TEXT[],
    "canCharge" BOOLEAN NOT NULL DEFAULT false,
    "canDiscount" BOOLEAN NOT NULL DEFAULT false,
    "canModifyTickets" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteTickets" BOOLEAN NOT NULL DEFAULT false,
    "canConfigSystem" BOOLEAN NOT NULL DEFAULT false,
    "canTakeDelivery" BOOLEAN NOT NULL DEFAULT false,
    "canTakeTakeout" BOOLEAN NOT NULL DEFAULT true,
    "canManageShifts" BOOLEAN NOT NULL DEFAULT false,
    "canCancelItems" BOOLEAN NOT NULL DEFAULT false,
    "canApplyDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "canReopenTables" BOOLEAN NOT NULL DEFAULT false,
    "canManageUsers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeShift" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeShift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_templates" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "variant_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variant_template_options" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variant_template_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_shifts" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "openedById" TEXT,
    "closedById" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "isOpen" BOOLEAN NOT NULL DEFAULT true,
    "openingFloat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingFloat" DOUBLE PRECISION,
    "notes" TEXT,
    "blindClose" BOOLEAN NOT NULL DEFAULT false,
    "expectedCash" DOUBLE PRECISION,
    "totalCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCard" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTransfer" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCourtesy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTips" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalExpenses" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalSales" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "cash_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_expenses" (
    "id" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "mode" TEXT NOT NULL DEFAULT 'sandbox',
    "config" TEXT NOT NULL,
    "webhook" TEXT,
    "lastSync" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalOrder" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "platform" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderId" TEXT,
    "rawData" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "locationId" TEXT,
    "userId" TEXT,
    "orderId" TEXT,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemVariant" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItemVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItemComplement" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MenuItemComplement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromDriver" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverCashMovement" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "photoUrl" TEXT,
    "orderId" TEXT,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCashMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverCashCut" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "totalIncome" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalExpense" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalReturn" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "movements" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverCashCut_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverLocation" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "orderId" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION,
    "heading" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverRoute" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "orderId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endAt" TIMESTAMP(3),
    "originLat" DOUBLE PRECISION NOT NULL,
    "originLng" DOUBLE PRECISION NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "distance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "trigger" TEXT NOT NULL DEFAULT 'MANUAL',

    CONSTRAINT "DriverRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsItemStatus" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KdsItemStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KdsMessage" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KdsMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_content" (
    "id" TEXT NOT NULL DEFAULT 'landing',
    "content" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "landing_content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tpv_remote_configs" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "apiUrl" TEXT,
    "allowedOrderTypes" JSONB NOT NULL DEFAULT '["DINE_IN","TAKEOUT","DELIVERY"]',
    "lockTimeoutSec" INTEGER NOT NULL DEFAULT 0,
    "accentColor" TEXT,
    "extra" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tpv_remote_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "plate" TEXT,
    "type" "VehicleType" NOT NULL DEFAULT 'MOTO',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rides" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "vehicleId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "startMileage" INTEGER,
    "endMileage" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rideId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tables" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "zoneId" TEXT,
    "name" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "capacity" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zones" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_rounds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "sentToKitchenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_configs" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TaxType" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "isInclusive" BOOLEAN NOT NULL DEFAULT true,
    "appliesTo" TEXT NOT NULL DEFAULT 'ALL',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "restaurantId" TEXT,
    "locationId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "access_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "deviceToken" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastPingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "pointsReward" INTEGER NOT NULL DEFAULT 10,
    "frequency" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_logs" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "pointsEarned" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "task_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_logs" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "path" TEXT,
    "method" TEXT,
    "tenantId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ota_bundles" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL DEFAULT 'com.mrtpvrest.tpv',
    "version" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'production',
    "storagePath" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minNative" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ota_bundles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_types" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_categories" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_suppliers" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseUnit" TEXT NOT NULL,
    "purchaseQty" DOUBLE PRECISION NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingredient_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subrecipes" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "yieldQty" DOUBLE PRECISION NOT NULL,
    "yieldUnit" "IngredientBaseUnit" NOT NULL,
    "marginErrorPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subrecipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subrecipe_items" (
    "id" TEXT NOT NULL,
    "subRecipeId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "nestedSubRecipeId" TEXT,
    "qty" DOUBLE PRECISION NOT NULL,
    "unit" "IngredientBaseUnit" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "subrecipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "marginErrorPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "targetMarginPct" DOUBLE PRECISION,
    "priceDelivery" DOUBLE PRECISION,
    "platformCommissionPct" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pricing_policies" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "categoryId" TEXT,
    "targetMarginPct" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "delta" DOUBLE PRECISION NOT NULL,
    "unit" "IngredientBaseUnit" NOT NULL,
    "reason" "StockMovementReason" NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "balanceAfter" DOUBLE PRECISION NOT NULL,
    "unitCostAtMove" DOUBLE PRECISION,
    "userId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "waste_logs" (
    "id" TEXT NOT NULL,
    "stockMovementId" TEXT NOT NULL,
    "reason" "WasteReason" NOT NULL,
    "reasonDetail" TEXT,
    "photoUrl" TEXT,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "waste_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "expectedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qtyOrdered" DOUBLE PRECISION NOT NULL,
    "qtyReceived" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "lineTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_counts" (
    "id" TEXT NOT NULL,
    "locationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "notes" TEXT,

    CONSTRAINT "physical_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_count_items" (
    "id" TEXT NOT NULL,
    "physicalCountId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "expectedQty" DOUBLE PRECISION NOT NULL,
    "countedQty" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,

    CONSTRAINT "physical_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_stripeCustomerId_key" ON "tenants"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_emailVerificationToken_key" ON "tenants"("emailVerificationToken");

-- CreateIndex
CREATE UNIQUE INDEX "plans_name_key" ON "plans"("name");

-- CreateIndex
CREATE UNIQUE INDEX "plans_stripePriceId_key" ON "plans"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenantId_key" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "saas_api_keys_prefix_key" ON "saas_api_keys"("prefix");

-- CreateIndex
CREATE INDEX "saas_api_keys_tenantId_idx" ON "saas_api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "saas_logs_createdAt_idx" ON "saas_logs"("createdAt");

-- CreateIndex
CREATE INDEX "saas_logs_tenantId_idx" ON "saas_logs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_domain_key" ON "restaurants"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "locations_restaurantId_slug_key" ON "locations"("restaurantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "menu_items_restaurantId_isFavorite_idx" ON "menu_items"("restaurantId", "isFavorite");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_tableId_idx" ON "orders"("tableId");

-- CreateIndex
CREATE INDEX "payment_transactions_orderId_idx" ON "payment_transactions"("orderId");

-- CreateIndex
CREATE INDEX "order_items_roundId_idx" ON "order_items"("roundId");

-- CreateIndex
CREATE INDEX "order_items_seatNumber_idx" ON "order_items"("seatNumber");

-- CreateIndex
CREATE INDEX "order_items_course_idx" ON "order_items"("course");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_accounts_qrCode_key" ON "loyalty_accounts"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "loyalty_accounts_userId_restaurantId_key" ON "loyalty_accounts"("userId", "restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE UNIQUE INDEX "restaurant_config_restaurantId_key" ON "restaurant_config"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "TicketConfig_locationId_key" ON "TicketConfig"("locationId");

-- CreateIndex
CREATE INDEX "printer_groups_locationId_idx" ON "printer_groups"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "printer_groups_locationId_name_key" ON "printer_groups"("locationId", "name");

-- CreateIndex
CREATE INDEX "printer_group_members_printerId_idx" ON "printer_group_members"("printerId");

-- CreateIndex
CREATE UNIQUE INDEX "printer_group_members_printerGroupId_printerId_key" ON "printer_group_members"("printerGroupId", "printerId");

-- CreateIndex
CREATE INDEX "category_printer_groups_printerGroupId_idx" ON "category_printer_groups"("printerGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "category_printer_groups_categoryId_printerGroupId_key" ON "category_printer_groups"("categoryId", "printerGroupId");

-- CreateIndex
CREATE INDEX "menu_item_printer_groups_printerGroupId_idx" ON "menu_item_printer_groups"("printerGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "menu_item_printer_groups_menuItemId_printerGroupId_key" ON "menu_item_printer_groups"("menuItemId", "printerGroupId");

-- CreateIndex
CREATE INDEX "Supplier_restaurantId_idx" ON "Supplier"("restaurantId");

-- CreateIndex
CREATE INDEX "Ingredient_restaurantId_idx" ON "Ingredient"("restaurantId");

-- CreateIndex
CREATE INDEX "Ingredient_restaurantId_isPackaging_idx" ON "Ingredient"("restaurantId", "isPackaging");

-- CreateIndex
CREATE INDEX "Ingredient_restaurantId_typeId_idx" ON "Ingredient"("restaurantId", "typeId");

-- CreateIndex
CREATE INDEX "Ingredient_restaurantId_categoryId_idx" ON "Ingredient"("restaurantId", "categoryId");

-- CreateIndex
CREATE INDEX "Ingredient_locationId_idx" ON "Ingredient"("locationId");

-- CreateIndex
CREATE INDEX "RecipeItem_recipeId_idx" ON "RecipeItem"("recipeId");

-- CreateIndex
CREATE INDEX "RecipeItem_menuItemId_idx" ON "RecipeItem"("menuItemId");

-- CreateIndex
CREATE INDEX "RecipeItem_ingredientId_idx" ON "RecipeItem"("ingredientId");

-- CreateIndex
CREATE INDEX "RecipeItem_subRecipeId_idx" ON "RecipeItem"("subRecipeId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_restaurantId_type_key" ON "IntegrationConfig"("restaurantId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE UNIQUE INDEX "tpv_remote_configs_locationId_key" ON "tpv_remote_configs"("locationId");

-- CreateIndex
CREATE INDEX "vehicles_tenantId_idx" ON "vehicles"("tenantId");

-- CreateIndex
CREATE INDEX "rides_tenantId_idx" ON "rides"("tenantId");

-- CreateIndex
CREATE INDEX "rides_vehicleId_idx" ON "rides"("vehicleId");

-- CreateIndex
CREATE INDEX "rides_employeeId_idx" ON "rides"("employeeId");

-- CreateIndex
CREATE INDEX "expenses_tenantId_idx" ON "expenses"("tenantId");

-- CreateIndex
CREATE INDEX "expenses_rideId_idx" ON "expenses"("rideId");

-- CreateIndex
CREATE INDEX "tables_locationId_idx" ON "tables"("locationId");

-- CreateIndex
CREATE INDEX "tables_zoneId_idx" ON "tables"("zoneId");

-- CreateIndex
CREATE UNIQUE INDEX "tables_locationId_name_key" ON "tables"("locationId", "name");

-- CreateIndex
CREATE INDEX "zones_locationId_idx" ON "zones"("locationId");

-- CreateIndex
CREATE UNIQUE INDEX "zones_locationId_name_key" ON "zones"("locationId", "name");

-- CreateIndex
CREATE INDEX "order_rounds_orderId_idx" ON "order_rounds"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "order_rounds_orderId_roundNumber_key" ON "order_rounds"("orderId", "roundNumber");

-- CreateIndex
CREATE INDEX "tax_configs_locationId_idx" ON "tax_configs"("locationId");

-- CreateIndex
CREATE INDEX "access_logs_tenantId_createdAt_idx" ON "access_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "access_logs_action_idx" ON "access_logs"("action");

-- CreateIndex
CREATE INDEX "access_logs_restaurantId_idx" ON "access_logs"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "devices_deviceToken_key" ON "devices"("deviceToken");

-- CreateIndex
CREATE INDEX "devices_locationId_idx" ON "devices"("locationId");

-- CreateIndex
CREATE INDEX "devices_tenantId_idx" ON "devices"("tenantId");

-- CreateIndex
CREATE INDEX "tasks_locationId_idx" ON "tasks"("locationId");

-- CreateIndex
CREATE INDEX "task_logs_employeeId_idx" ON "task_logs"("employeeId");

-- CreateIndex
CREATE INDEX "task_logs_taskId_idx" ON "task_logs"("taskId");

-- CreateIndex
CREATE INDEX "system_logs_level_idx" ON "system_logs"("level");

-- CreateIndex
CREATE INDEX "system_logs_tenantId_idx" ON "system_logs"("tenantId");

-- CreateIndex
CREATE INDEX "system_logs_createdAt_idx" ON "system_logs"("createdAt");

-- CreateIndex
CREATE INDEX "ota_bundles_appId_channel_isActive_createdAt_idx" ON "ota_bundles"("appId", "channel", "isActive", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ota_bundles_appId_channel_version_key" ON "ota_bundles"("appId", "channel", "version");

-- CreateIndex
CREATE INDEX "ingredient_types_restaurantId_idx" ON "ingredient_types"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_types_restaurantId_name_key" ON "ingredient_types"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "ingredient_categories_restaurantId_idx" ON "ingredient_categories"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_categories_restaurantId_name_key" ON "ingredient_categories"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "ingredient_suppliers_ingredientId_validFrom_idx" ON "ingredient_suppliers"("ingredientId", "validFrom");

-- CreateIndex
CREATE INDEX "ingredient_suppliers_supplierId_idx" ON "ingredient_suppliers"("supplierId");

-- CreateIndex
CREATE INDEX "subrecipes_restaurantId_idx" ON "subrecipes"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "subrecipes_restaurantId_name_key" ON "subrecipes"("restaurantId", "name");

-- CreateIndex
CREATE INDEX "subrecipe_items_subRecipeId_idx" ON "subrecipe_items"("subRecipeId");

-- CreateIndex
CREATE INDEX "subrecipe_items_ingredientId_idx" ON "subrecipe_items"("ingredientId");

-- CreateIndex
CREATE INDEX "subrecipe_items_nestedSubRecipeId_idx" ON "subrecipe_items"("nestedSubRecipeId");

-- CreateIndex
CREATE UNIQUE INDEX "recipes_menuItemId_key" ON "recipes"("menuItemId");

-- CreateIndex
CREATE INDEX "recipes_restaurantId_idx" ON "recipes"("restaurantId");

-- CreateIndex
CREATE INDEX "pricing_policies_restaurantId_idx" ON "pricing_policies"("restaurantId");

-- CreateIndex
CREATE UNIQUE INDEX "pricing_policies_restaurantId_categoryId_key" ON "pricing_policies"("restaurantId", "categoryId");

-- CreateIndex
CREATE INDEX "stock_movements_ingredientId_createdAt_idx" ON "stock_movements"("ingredientId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_locationId_createdAt_idx" ON "stock_movements"("locationId", "createdAt");

-- CreateIndex
CREATE INDEX "stock_movements_refType_refId_idx" ON "stock_movements"("refType", "refId");

-- CreateIndex
CREATE UNIQUE INDEX "waste_logs_stockMovementId_key" ON "waste_logs"("stockMovementId");

-- CreateIndex
CREATE INDEX "purchase_orders_locationId_status_idx" ON "purchase_orders"("locationId", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_locationId_poNumber_key" ON "purchase_orders"("locationId", "poNumber");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "purchase_order_items_ingredientId_idx" ON "purchase_order_items"("ingredientId");

-- CreateIndex
CREATE INDEX "physical_counts_locationId_startedAt_idx" ON "physical_counts"("locationId", "startedAt");

-- CreateIndex
CREATE INDEX "physical_count_items_physicalCountId_idx" ON "physical_count_items"("physicalCountId");

-- CreateIndex
CREATE INDEX "physical_count_items_ingredientId_idx" ON "physical_count_items"("ingredientId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifier_groups" ADD CONSTRAINT "modifier_groups_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modifiers" ADD CONSTRAINT "modifiers_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "modifier_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "tables"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "order_rounds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_modifiers" ADD CONSTRAINT "order_item_modifiers_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "modifiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_accounts" ADD CONSTRAINT "loyalty_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "loyalty_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurant_config" ADD CONSTRAINT "restaurant_config_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TicketConfig" ADD CONSTRAINT "TicketConfig_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Printer" ADD CONSTRAINT "Printer_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_groups" ADD CONSTRAINT "printer_groups_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_group_members" ADD CONSTRAINT "printer_group_members_printerGroupId_fkey" FOREIGN KEY ("printerGroupId") REFERENCES "printer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "printer_group_members" ADD CONSTRAINT "printer_group_members_printerId_fkey" FOREIGN KEY ("printerId") REFERENCES "Printer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_printer_groups" ADD CONSTRAINT "category_printer_groups_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_printer_groups" ADD CONSTRAINT "category_printer_groups_printerGroupId_fkey" FOREIGN KEY ("printerGroupId") REFERENCES "printer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_printer_groups" ADD CONSTRAINT "menu_item_printer_groups_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_item_printer_groups" ADD CONSTRAINT "menu_item_printer_groups_printerGroupId_fkey" FOREIGN KEY ("printerGroupId") REFERENCES "printer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ingredient_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_batches" ADD CONSTRAINT "inventory_batches_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeItem" ADD CONSTRAINT "RecipeItem_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "subrecipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waiter" ADD CONSTRAINT "Waiter_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WaiterShift" ADD CONSTRAINT "WaiterShift_waiterId_fkey" FOREIGN KEY ("waiterId") REFERENCES "Waiter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeShift" ADD CONSTRAINT "EmployeeShift_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_templates" ADD CONSTRAINT "variant_templates_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variant_template_options" ADD CONSTRAINT "variant_template_options_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "variant_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_shifts" ADD CONSTRAINT "cash_shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_expenses" ADD CONSTRAINT "shift_expenses_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "cash_shifts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationConfig" ADD CONSTRAINT "IntegrationConfig_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalOrder" ADD CONSTRAINT "ExternalOrder_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemVariant" ADD CONSTRAINT "MenuItemVariant_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItemComplement" ADD CONSTRAINT "MenuItemComplement_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "landing_content" ADD CONSTRAINT "landing_content_updatedBy_fkey" FOREIGN KEY ("updatedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tpv_remote_configs" ADD CONSTRAINT "tpv_remote_configs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_rideId_fkey" FOREIGN KEY ("rideId") REFERENCES "rides"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tables" ADD CONSTRAINT "tables_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "zones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zones" ADD CONSTRAINT "zones_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_rounds" ADD CONSTRAINT "order_rounds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_configs" ADD CONSTRAINT "tax_configs_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_logs" ADD CONSTRAINT "task_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_types" ADD CONSTRAINT "ingredient_types_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_categories" ADD CONSTRAINT "ingredient_categories_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subrecipes" ADD CONSTRAINT "subrecipes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subrecipe_items" ADD CONSTRAINT "subrecipe_items_subRecipeId_fkey" FOREIGN KEY ("subRecipeId") REFERENCES "subrecipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subrecipe_items" ADD CONSTRAINT "subrecipe_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subrecipe_items" ADD CONSTRAINT "subrecipe_items_nestedSubRecipeId_fkey" FOREIGN KEY ("nestedSubRecipeId") REFERENCES "subrecipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pricing_policies" ADD CONSTRAINT "pricing_policies_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "stock_movements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waste_logs" ADD CONSTRAINT "waste_logs_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_counts" ADD CONSTRAINT "physical_counts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_physicalCountId_fkey" FOREIGN KEY ("physicalCountId") REFERENCES "physical_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_count_items" ADD CONSTRAINT "physical_count_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
