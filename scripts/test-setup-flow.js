const axios = require('axios');

const API_URL = 'http://localhost:3001'; // Default port for backend
const EMAIL = 'super@mrtpvrest.com';
const PASSWORD = 'SuperAdmin1234!';

async function runTest() {
  console.log(`🚀 Iniciando prueba de integración con credenciales de SuperAdmin: ${EMAIL}`);
  let token = null;
  let restaurantId = null;
  let locationId = null;
  let role = null;

  try {
    console.log('\n1️⃣  Probando /api/auth/login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: EMAIL,
      password: PASSWORD,
    });
    token = loginRes.data.accessToken;
    role = loginRes.data.user?.role;
    console.log('✅ Login exitoso. Token recibido.');

    const api = axios.create({
      baseURL: API_URL,
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('\n2️⃣  Probando fetch configs (Simulando Frontend)...');
    try {
      if (role === 'SUPER_ADMIN') {
        const configRes = await api.get('/api/saas/tpv-configs');
        console.log('✅ Configuración saas obtenida.');
        const rows = configRes.data || [];
        const byRestaurant = new Map();
        for (const row of rows) {
          if (!row.tenantIsActive) continue; // Skip suspended
          if (!byRestaurant.has(row.restaurantId)) {
            byRestaurant.set(row.restaurantId, { id: row.restaurantId, locations: [] });
          }
          if (row.locationId) {
            byRestaurant.get(row.restaurantId).locations.push({ id: row.locationId });
          }
        }
        const restaurantsList = Array.from(byRestaurant.values()).filter(r => r.locations.length > 0);
        if (restaurantsList.length > 0) {
           restaurantId = restaurantsList[0].id;
           locationId = restaurantsList[0].locations[0].id;
        } else {
           // fallback just in case tenantIsActive is not in tpv-configs
           const restaurantsFallback = Array.from(byRestaurant.values()).filter(r => r.locations.length > 0);
           if (restaurantsFallback.length > 0) {
              restaurantId = restaurantsFallback[0].id;
              locationId = restaurantsFallback[0].locations[0].id;
           }
        }
      } else {
        const configRes = await api.get('/api/admin/config');
        restaurantId = configRes.data.id;
        if (configRes.data.locations && configRes.data.locations.length > 0) {
          locationId = configRes.data.locations[0].id;
        }
      }
    } catch (err) {
      console.log('❌ Error al obtener configs:', err.response?.status, err.response?.data || err.message);
    }

    if (locationId) {
      console.log(`\n3️⃣  Probando /api/admin/locations/${locationId}...`);
      try {
        await api.get(`/api/admin/locations/${locationId}`);
        console.log('✅ Sucursal obtenida correctamente.');
      } catch (err) {
        console.log(`❌ Error en /api/admin/locations/${locationId}:`, err.response?.status, err.response?.data || err.message);
      }

      console.log('\n4️⃣  Probando /api/devices/create (NUEVO ENDPOINT)...');
      try {
        const res = await api.post('/api/devices/create', {
          locationId: locationId,
          deviceType: 'CAJA',
          restaurantId: restaurantId,
        });
        console.log('✅ Dispositivo creado correctamente:', res.data.deviceToken ? 'Token recibido' : 'Token faltante');
      } catch (err) {
        console.log('❌ Error en /api/devices/create:', err.response?.status, err.response?.data || err.message);
      }

      console.log('\n5️⃣  Probando /api/employees/sync (NUEVO ENDPOINT)...');
      try {
        const syncRes = await api.get('/api/employees/sync', {
           headers: { 'x-location-id': locationId }
        });
        console.log('✅ Empleados sincronizados correctamente:', syncRes.data.length, 'empleados');
      } catch (err) {
        console.log('❌ Error en /api/employees/sync:', err.response?.status, err.response?.data || err.message);
      }
    } else {
      console.log('\n⚠️ No se pudo obtener el locationId, saltando las pruebas dependientes.');
    }

  } catch (err) {
    console.log('❌ Error crítico en el flujo:', err.message);
    if (err.response) {
      console.log(err.response.data);
    }
  }
  
  process.exit(0);
}

runTest();
