const { prisma } = require('@mrtpvrest/database');
const cron = require('node-cron');

// Antigüedad mínima vendiendo: un platillo debe tener al menos este tiempo en
// el menú antes de ser elegible para una promoción automática. Evita que la IA
// castigue con descuento a platillos recién creados que "venden poco" sólo
// porque acaban de salir.
const MIN_SELLING_DAYS = 30;

/**
 * Motor de Promociones Automáticas con IA
 * Analiza ventas semanales por restaurante usando las sucursales habilitadas.
 * @param {{ restaurantId?: string, locationId?: string }|string|null} options
 */
async function runAutoPromos(options = null) {
  console.log('🤖 [Cron] Iniciando Motor de Promociones Automáticas con IA...');
  
  try {
    const opts = typeof options === 'string' ? { locationId: options } : (options || {});

    // 1. Obtener sucursales con auto-promo habilitado
    const where = { autoPromoEnabled: true };
    if (opts.restaurantId) where.restaurantId = opts.restaurantId;
    if (opts.locationId) where.id = opts.locationId;

    const locations = await prisma.location.findMany({
      where,
      include: {
        restaurant: {
          include: { menuItems: true }
        }
      }
    });

    if (locations.length === 0) {
      console.log('🤖 [Cron] No hay sucursales con auto-promo habilitado.');
      return;
    }

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    // Fecha de corte para la antigüedad mínima: sólo platillos creados antes de
    // esta fecha son elegibles para auto-promo.
    const minAgeCutoff = new Date();
    minAgeCutoff.setDate(minAgeCutoff.getDate() - MIN_SELLING_DAYS);

    const locationsByRestaurant = new Map();
    for (const location of locations) {
      const group = locationsByRestaurant.get(location.restaurantId) || {
        restaurant: location.restaurant,
        locations: [],
      };
      group.locations.push(location);
      locationsByRestaurant.set(location.restaurantId, group);
    }

    for (const [restaurantId, group] of locationsByRestaurant.entries()) {
      const locationIds = group.locations.map(location => location.id);
      const threshold = group.locations.reduce((sum, location) => sum + location.autoPromoThreshold, 0);
      const discount = Math.max(...group.locations.map(location => location.autoPromoDiscount));
      // Tope de platillos en promo: el máximo positivo configurado entre las
      // sucursales del grupo. 0 (o ninguno) = sin tope.
      const positiveCaps = group.locations
        .map(location => location.autoPromoMaxItems || 0)
        .filter(cap => cap > 0);
      const maxItems = positiveCaps.length > 0 ? Math.max(...positiveCaps) : 0;
      console.log(`🤖 Analizando restaurante ${restaurantId} (${group.locations.length} sucursal(es), Threshold: ${threshold}, Discount: ${discount}%, Tope: ${maxItems || 'sin tope'})`);

      // 2. Obtener las ventas de los últimos 7 días en las sucursales seleccionadas
      const recentOrders = await prisma.order.findMany({
        where: {
          restaurantId,
          locationId: { in: locationIds },
          createdAt: { gte: sevenDaysAgo },
          status: { notIn: ['CANCELLED'] }
        },
        include: { items: true }
      });

      // 3. Contar la cantidad vendida por cada MenuItem
      const salesCount = {};
      for (const order of recentOrders) {
        for (const item of order.items) {
          salesCount[item.menuItemId] = (salesCount[item.menuItemId] || 0) + item.quantity;
        }
      }

      // 4. Identificar platillos por debajo del umbral
      // Sólo entran al análisis los platillos disponibles que ya llevan al
      // menos MIN_SELLING_DAYS en el menú. Los más nuevos se ignoran por
      // completo (ni promo ni se les toca) para no castigarlos antes de tiempo.
      const menuItems = group.restaurant.menuItems.filter(
        item => item.isAvailable && new Date(item.createdAt) <= minAgeCutoff
      );
      let lowSellers = [];
      const normalSellers = [];

      for (const item of menuItems) {
        const sold = salesCount[item.id] || 0;
        if (sold < threshold) {
          lowSellers.push(item);
        } else {
          // Si vendió más del umbral, se le quita la promoción si la tenía
          normalSellers.push(item);
        }
      }

      // Aplicar el tope: si hay límite, sólo se promocionan los N peores
      // vendedores (menos ventas primero). El resto de low-sellers se trata
      // como normal-seller para que se les retire cualquier promo previa.
      if (maxItems > 0 && lowSellers.length > maxItems) {
        lowSellers.sort((a, b) => (salesCount[a.id] || 0) - (salesCount[b.id] || 0));
        const overflow = lowSellers.slice(maxItems);
        lowSellers = lowSellers.slice(0, maxItems);
        normalSellers.push(...overflow);
      }

      // 5. Quitar promo a los que ya venden bien
      for (const item of normalSellers) {
        if (item.isPromo) {
          await prisma.menuItem.update({
            where: { id: item.id },
            data: { isPromo: false, promoPrice: null }
          });
          console.log(`   - Promoción removida para: ${item.name} (Vendió ${salesCount[item.id] || 0})`);
        }
      }

      // 6. Aplicar promo a los que venden poco
      // Nota: NO se toca el campo `description` del platillo — sólo se ajusta
      // isPromo/promoPrice. El motor antes sobrescribía la descripción con
      // texto de IA y nunca la restauraba, lo que destruía el menú original.
      for (const item of lowSellers) {
        const discountDec = discount / 100;
        const newPrice = Math.max(0, item.price - (item.price * discountDec));
        const finalPromoPrice = parseFloat(newPrice.toFixed(2));

        await prisma.menuItem.update({
          where: { id: item.id },
          data: {
            isPromo: true,
            promoPrice: finalPromoPrice,
          }
        });
        console.log(`   + Promoción activada para: ${item.name} (Vendió ${salesCount[item.id] || 0}) -> Nuevo precio: $${finalPromoPrice}`);
      }
    }
    
    console.log('🤖 [Cron] Motor de Promociones finalizado con éxito.');

  } catch (error) {
    console.error('🤖 [Cron] Error en Motor de Promociones:', error);
  }
}

/**
 * Inicializa el cron job
 */
function startAutoPromosJob() {
  // Se ejecuta todos los domingos a las 02:00 AM
  cron.schedule('0 2 * * 0', async () => {
    await runAutoPromos();
  }, {
    scheduled: true,
    timezone: "America/Mexico_City"
  });
  console.log('🕒 Job Registrado: Auto-Promociones con IA (Domingos 2:00 AM)');
}

module.exports = {
  startAutoPromosJob,
  runAutoPromos // Exportado por si se requiere un trigger manual
};
