const axios = require('axios');

async function testFlow() {
  const API_URL = 'http://localhost:3001';
  
  console.log('--- Iniciando Prueba de Flujo Completo ---');

  try {
    // 1. Verificar Salud del Backend
    const health = await axios.get(`${API_URL}/health`);
    console.log('✅ Backend Salud:', health.data.status);

    // 2. Simular Pedido desde la Tienda Online
    // Necesitamos un locationId real. Consultamos primero.
    console.log('Consultando ubicaciones...');
    const slug = 'mrtpvrest-saas';
    const locId = 'cmop06au40008snbdbb3sq00t';

    // Creamos la orden
    console.log('Creando pedido de prueba...');
    const orderData = {
      locationId: locId,
      items: [
        { menuItemId: 'cmot0x9zi000k10fwg5yp47aw', name: 'Burger Test', quantity: 1, price: 150 }
      ],
      customerName: 'Agente IA',
      customerPhone: '1234567890',
      type: 'TAKEOUT',
      deliveryAddress: 'Calle Falsa 123',
      paymentMethod: 'CASH',
      total: 150
    };

    const orderRes = await axios.post(`${API_URL}/api/store/orders`, orderData, {
      headers: { 'x-restaurant-slug': slug }
    }).catch(err => {
        console.error('❌ Error creando orden:', err.response?.data || err.message);
        return null;
    });

    // 3. Simular "Aceptación" en TPV (impresión a KDS)
    // Buscamos si hay una impresora KDS configurada
    console.log('Verificando envío a KDS...');
    const printers = await axios.get(`${API_URL}/api/printers`, {
      headers: { 'x-restaurant-slug': slug }
    }).catch((e) => {
        console.error('Error obteniendo impresoras:', e.message);
        return { data: [] };
    });

    const kds = printers.data.find(p => p.type === 'KITCHEN');
    if (kds) {
      console.log(`✅ Estación KDS encontrada: ${kds.name} (IP: ${kds.ip})`);
      console.log('Simulando envío de comanda de prueba...');
      const testPrint = await axios.post(`${API_URL}/api/printers/${kds.id}/test`);
      console.log('✅ Resultado envío KDS:', testPrint.data);
    } else {
      console.log('⚠️ No se encontró estación KDS configurada.');
      console.log('Intentando crear una estación KDS virtual para la prueba...');
      const newKds = await axios.post(`${API_URL}/api/printers`, {
        name: 'KDS Test IA',
        type: 'KITCHEN',
        connectionType: 'NETWORK',
        ip: '0.0.0.0',
        port: 9100,
        isVirtual: true
      }, { headers: { 'x-restaurant-slug': slug } });
      console.log('✅ KDS Virtual creado. ID:', newKds.data.id);
      const testPrint = await axios.post(`${API_URL}/api/printers/${newKds.data.id}/test`);
      console.log('✅ Resultado envío KDS:', testPrint.data);
    }

    console.log('\n--- Flujo completado con éxito ---');
  } catch (err) {
    console.error('❌ Error en la prueba:', err.message);
  }
}

testFlow();
