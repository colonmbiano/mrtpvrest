export async function hashPin(pin: string): Promise<string> {
  if (typeof window === 'undefined') {
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
