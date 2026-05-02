const axios = require('axios');

async function testProd() {
  try {
    const res = await axios.post('https://api.mrtpvrest.com/api/auth/login', {
      email: 'colonmbianito@gmail.com',
      password: 'SuperAdmin1234!'
    });
    console.log('✅ Prod login success:', res.data.user);
  } catch (e) {
    console.log('❌ Prod login failed:', e.response?.data || e.message);
  }
}

testProd();
