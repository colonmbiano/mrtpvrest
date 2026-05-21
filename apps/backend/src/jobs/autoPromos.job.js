const { prisma } = require('@mrtpvrest/database');
const cron = require('node-cron');
const axios = require('axios');
const { resolveGeminiKey } = require('../services/ai-key.service');

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
      console.log(`🤖 Analizando restaurante ${restaurantId} (${group.locations.length} sucursal(es), Threshold: ${threshold}, Discount: ${discount}%)`);

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
      const menuItems = group.restaurant.menuItems.filter(item => item.isAvailable);
      const lowSellers = [];
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
      for (const item of lowSellers) {
        const discountDec = discount / 100;
        const newPrice = Math.max(0, item.price - (item.price * discountDec));
        const finalPromoPrice = parseFloat(newPrice.toFixed(2));

        let aiDescription = item.description;

        // Usar Gemini via Axios para generar una descripción llamativa de promoción
        if (!item.isPromo) {
          try {
            // Utilizamos resolveGeminiKey que internamente devuelve la key de plataforma (GOOGLE_AI_API_KEY)
            const { apiKey } = resolveGeminiKey();
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`;
            
            const prompt = `Eres un experto en marketing de restaurantes. El platillo "${item.name}" (Descripción original: "${item.description || 'Sin descripción'}") no se está vendiendo bien. Hemos aplicado un descuento del ${discount}%. Escribe una frase corta (máximo 15 palabras) muy llamativa y apetitosa para promocionar este platillo hoy. No uses comillas.`;
            
            const response = await axios.post(geminiUrl, {
              contents: [{
                parts: [{ text: prompt }]
              }],
              generationConfig: {
                temperature: 0.8,
                maxOutputTokens: 60,
              }
            }, {
              headers: { 'Content-Type': 'application/json' }
            });

            const aiText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (aiText) aiDescription = aiText;
          } catch (aiErr) {
            console.error(`   - Error AI (Gemini) para ${item.name}: ${aiErr.response?.data?.error?.message || aiErr.message}`);
          }
        }

        await prisma.menuItem.update({
          where: { id: item.id },
          data: {
            isPromo: true,
            promoPrice: finalPromoPrice,
            description: aiDescription
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
