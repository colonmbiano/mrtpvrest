'use strict';

// Only raster data URLs are published. SVG/HTML and remote fetches are excluded.
function decodeStoreLogo(value) {
  if (typeof value !== 'string' || value.length > 3 * 1024 * 1024) return null;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return null;
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.toString('base64') !== match[2]) return null;
  const valid = match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
    : match[1] === 'jpeg' ? bytes.subarray(0, 3).equals(Buffer.from('ffd8ff', 'hex'))
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  return valid ? { bytes, contentType: `image/${match[1]}` } : null;
}

function publicStoreLogoUrl(value, slug) {
  if (!decodeStoreLogo(value)) return undefined;
  try {
    const origin = new URL(process.env.PUBLIC_API_URL || 'https://api.mrtpvrest.com');
    if (origin.protocol !== 'https:' || origin.username || origin.password) return undefined;
    const url = new URL('/api/store/logo', origin.origin);
    url.searchParams.set('r', slug);
    return url.href;
  } catch { return undefined; }
}

module.exports = { decodeStoreLogo, publicStoreLogoUrl };
