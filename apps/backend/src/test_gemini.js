const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: '../.env' });

async function test() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  console.log("API Key found:", !!apiKey);
  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    const result = await model.generateContent("Dime hola");
    console.log(`✅ gemini-1.5-flash funcionó:`, result.response.text().trim());
  } catch (e) {
    console.error(`❌ gemini-1.5-flash falló:`, e.message);
  }
}
test();
