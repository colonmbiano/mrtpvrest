const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config({ path: './apps/backend/.env' });

const apiKey = process.env.GOOGLE_AI_API_KEY;
const SYSTEM_PROMPT = `Eres el asistente de configuración de MRTPVREST...`;

async function testGemini() {
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT
    });

    const chat = model.startChat({
      history: [],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      }
    });

    const result = await chat.sendMessage([{ text: "Hola quiero configurar mi restaurante" }]);
    console.log("Success:", result.response.text());
  } catch (err) {
    console.error("Error:", err.message);
  }
}

testGemini();
