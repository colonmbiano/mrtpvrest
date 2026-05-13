const { prisma } = require('c:/Users/colon/Downloads/mrtpvrest/packages/database/index.js');

const RESTAURANT_ID = 'cmop06al30005snbd74adrqu4';

async function clean() {
  console.log(`🧹 Iniciando limpieza profunda para el restaurante ${RESTAURANT_ID}...`);
  
  try {
    // 1. Limpiar Pedidos y sus relaciones
    console.log('- Borrando modificadores de ítems de pedido...');
    await prisma.orderItemModifier.deleteMany({ where: { orderItem: { order: { restaurantId: RESTAURANT_ID } } } });
    
    console.log('- Borrando ítems de pedido...');
    await prisma.orderItem.deleteMany({ where: { order: { restaurantId: RESTAURANT_ID } } });
    
    console.log('- Borrando rondas de pedido...');
    await prisma.orderRound.deleteMany({ where: { order: { restaurantId: RESTAURANT_ID } } });
    
    console.log('- Borrando pedidos...');
    await prisma.order.deleteMany({ where: { restaurantId: RESTAURANT_ID } });

    // 2. Limpiar Menú y sus relaciones
    console.log('- Borrando variantes de menú...');
    await prisma.menuItemVariant.deleteMany({ where: { menuItem: { restaurantId: RESTAURANT_ID } } });
    
    console.log('- Borrando grupos de impresoras de ítems...');
    await prisma.menuItemPrinterGroup.deleteMany({ where: { menuItem: { restaurantId: RESTAURANT_ID } } });
    
    console.log('- Borrando modificadores...');
    await prisma.modifier.deleteMany({ where: { group: { menuItem: { restaurantId: RESTAURANT_ID } } } });
    
    console.log('- Borrando grupos de modificadores...');
    await prisma.modifierGroup.deleteMany({ where: { menuItem: { restaurantId: RESTAURANT_ID } } });
    
    console.log('- Borrando ítems del menú...');
    await prisma.menuItem.deleteMany({ where: { restaurantId: RESTAURANT_ID } });
    
    console.log('- Borrando categorías...');
    await prisma.category.deleteMany({ where: { restaurantId: RESTAURANT_ID } });

    console.log('✅ Limpieza completada con éxito.');
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await prisma.$disconnect();
    process.exit(0);
  }
}

clean();
