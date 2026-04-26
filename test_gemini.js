const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: './apps/backend/.env' });

async function test() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;
  if (!apiKey) {
    console.error("No API key");
    return;
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelsToTest = ["gemini-1.5-flash", "gemini-flash-latest", "gemini-1.5-flash-8b"];
  
  for (const m of modelsToTest) {
    try {
      const model = genAI.getGenerativeModel({ model: m });
      const result = await model.generateContent("Dime hola");
      console.log(`✅ ${m} funcionó:`, result.response.text().trim());
    } catch (e) {
      console.error(`❌ ${m} falló:`, e.message);
    }
  }
}
test();
