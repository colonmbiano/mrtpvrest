export async function hashPin(pin: string): Promise<string> {
  if (typeof window === 'undefined') {
    // Server-side (Node.js)
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  // Client-side (browser)
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function hashPinSync(pin: string): string {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(pin).digest('hex');
}
