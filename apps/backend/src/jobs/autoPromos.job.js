const { prisma } = require('@mrtpvrest/database');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Motor de Promociones Automáticas con IA
 * Analiza ventas semanales por sucursal y pone en promoción platillos con bajas ventas.
 */
async function runAutoPromos() {
  console.log('🤖 [Cron] Iniciando Motor de Promociones Automáticas con IA...');
  
  try {
    // 1. Obtener todas las sucursales que tienen habilitado el motor
    const locations = await prisma.location.findMany({
      where: { autoPromoEnabled: true },
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

    // AI Config
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    let aiModel = null;
    if (apiKey) {
      const genAI = new GoogleGenerativeAI(apiKey);
      aiModel = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
    }

    for (const location of locations) {
      console.log(`🤖 Analizando sucursal: ${location.name} (Threshold: ${location.autoPromoThreshold}, Discount: ${location.autoPromoDiscount}%)`);

      // 2. Obtener las ventas de los últimos 7 días de esta sucursal
      const recentOrders = await prisma.order.findMany({
        where: {
          locationId: location.id,
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
      const menuItems = location.restaurant.menuItems.filter(item => item.isAvailable);
      const lowSellers = [];
      const normalSellers = [];

      for (const item of menuItems) {
        const sold = salesCount[item.id] || 0;
        if (sold < location.autoPromoThreshold) {
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
        const discountDec = location.autoPromoDiscount / 100;
        const newPrice = Math.max(0, item.price - (item.price * discountDec));
        const finalPromoPrice = parseFloat(newPrice.toFixed(2));

        let aiDescription = item.description;

        // Opcional: Usar Gemini para generar una descripción llamativa de promoción
        if (aiModel && !item.isPromo) {
          try {
            const prompt = `Eres un experto en marketing de restaurantes. El platillo "${item.name}" (Descripción original: "${item.description || 'Sin descripción'}") no se está vendiendo bien. Hemos aplicado un descuento del ${location.autoPromoDiscount}%. Escribe una frase corta (máximo 15 palabras) muy llamativa y apetitosa para promocionar este platillo hoy. No uses comillas.`;
            const result = await aiModel.generateContent(prompt);
            const aiText = result.response.text().trim();
            if (aiText) aiDescription = aiText;
          } catch (aiErr) {
            console.error(`   - Error AI para ${item.name}: ${aiErr.message}`);
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
