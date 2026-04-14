const ColorThief = require('colorthief');

/**
 * Extrae el color dominante de un buffer de imagen.
 * Operación en memoria — no hace requests externos.
 * @param {Buffer} imageBuffer
 * @returns {Promise<string>} HEX color, ej: "#7c3aed". Fallback: "#7c3aed".
 */
async function extractAccentColor(imageBuffer) {
  try {
    const rgb = await ColorThief.getColor(imageBuffer);
    return '#' + rgb.map(c => c.toString(16).padStart(2, '0')).join('');
  } catch {
    return '#7c3aed';
  }
}

module.exports = { extractAccentColor };
