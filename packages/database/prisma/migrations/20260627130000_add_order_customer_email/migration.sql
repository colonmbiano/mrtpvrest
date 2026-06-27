-- Correo del cliente para confirmaciones de pedido de tienda en línea.
-- Aditivo y nullable: los invitados pueden dejarlo (opcional en el checkout);
-- los clientes registrados ya tienen email en users.
ALTER TABLE "orders" ADD COLUMN "customerEmail" TEXT;
