require('dotenv').config({ path: __dirname + '/../apps/backend/.env' });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const axios = require('axios');

async function run() {
  const API = 'http://localhost:3001';
  console.log("Iniciando simulación de 20 ventas...");

  // 1. Obtener restaurante y sucursal
  const location = await prisma.location.findFirst({ include: { restaurant: true } });
  if (!location) throw new Error("No se encontró sucursal.");
  const restaurant = location.restaurant;
  
  let shift = await prisma.cashShift.findFirst({
    where: { isOpen: true }
  });
  if (!shift) {
    console.log("No hay turno abierto, creando uno...");
    shift = await prisma.cashShift.create({
      data: {
        restaurantId: restaurant.id,
        isOpen: true,
        openedAt: new Date(),
        employeeName: 'Simulador',
        employeeId: driver ? driver.id : 'sim',
        openingFloat: 100,
        totalCash: 0,
        totalCard: 0,
        totalTransfer: 0,
        totalCourtesy: 0,
        totalTips: 0,
        totalExpenses: 0,
        totalSales: 0,
        ordersCount: 0
      }
    });
  }

  // 3. Obtener un empleado de Reparto
  let driver = await prisma.employee.findFirst({ where: { role: 'DELIVERY' } });
  if (!driver) {
    console.log("Creando repartidor de prueba...");
    driver = await prisma.employee.create({
      data: {
        restaurantId: restaurant.id,
        locationId: location.id,
        name: "Repartidor Flash",
        role: "DELIVERY",
        pin: "1234",
        isActive: true
      }
    });
  }

  // 4. Obtener productos del menú
  const items = await prisma.menuItem.findMany({
    where: { restaurantId: restaurant.id, isAvailable: true },
    take: 3
  });
  if (items.length === 0) throw new Error("No hay productos en el menú.");

  // Generar token admin falso para hacer los request (El middleware usa req.user o jwt)
  // Como jwt secret es desconocido, directamente usaremos prisma para crear las de TPV
  // O usar el token de un empleado OWNER.
  const owner = await prisma.employee.findFirst({ where: { role: 'OWNER' } });
  
  // SIMULAR 10 VENTAS TPV (Uso de DB directo para saltar auth si no tenemos token local)
  console.log("Generando 10 ventas en TPV...");
  for (let i = 1; i <= 10; i++) {
    const item = items[i % items.length];
    await prisma.order.create({
      data: {
        restaurantId: restaurant.id,
        locationId: location.id,
        // shiftId: shift.id,
        orderNumber: `TPV-SIM-${Date.now().toString().slice(-4)}${i}`,
        status: 'DELIVERED',
        orderType: 'TAKEOUT',
        paymentMethod: 'CASH',
        paymentStatus: 'PAID',
        subtotal: item.price,
        total: item.price,
        paidAt: new Date(),
        cashCollected: true,
        source: 'TPV',
        customerName: `Cliente TPV ${i}`,
        items: {
          create: [{
            menuItemId: item.id,
            name: item.name,
            quantity: 1,
            price: item.price,
            subtotal: item.price
          }]
        }
      }
    });
  }

  // SIMULAR 10 VENTAS STORE (Vía API Pública que no requiere Auth)
  console.log("Generando 10 ventas en Tienda en Línea...");
  for (let i = 1; i <= 10; i++) {
    const item = items[i % items.length];
    try {
      const { data: storeOrder } = await axios.post(`${API}/api/store/orders?r=${restaurant.slug}`, {
        customerName: `Cliente Online ${i}`,
        deliveryAddress: `Calle Falsa ${i}00`,
        items: [{ menuItemId: item.id, quantity: 1 }]
      });

      // Asignar al repartidor directo por DB
      await prisma.order.update({
        where: { id: storeOrder.id },
        data: {
          status: 'ON_THE_WAY',
          deliveryDriverId: driver.id
        }
      });
    } catch(e) {
      console.error("Error creando orden store:", e?.response?.data || e.message);
    }
  }

  console.log(`✅ Simulación completada con éxito.
- 10 Ventas TPV creadas.
- 10 Pedidos Web creados y asignados al repartidor "${driver.name}".`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
