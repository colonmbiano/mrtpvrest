'use strict';

// Las coordenadas son opcionales, pero se guardan o se eliminan como pareja.
function locationCoordinates(body = {}) {
  const hasLat = Object.hasOwn(body, 'latitude');
  const hasLng = Object.hasOwn(body, 'longitude');
  if (!hasLat && !hasLng) return {};
  if (hasLat && hasLng && body.latitude === null && body.longitude === null) {
    return { latitude: null, longitude: null };
  }
  const valid = hasLat && hasLng
    && typeof body.latitude === 'number' && Number.isFinite(body.latitude) && Math.abs(body.latitude) <= 90
    && typeof body.longitude === 'number' && Number.isFinite(body.longitude) && Math.abs(body.longitude) <= 180;
  if (!valid) {
    const error = new Error('Captura latitud (-90 a 90) y longitud (-180 a 180), o deja ambas vacías.');
    error.statusCode = 400;
    error.code = 'INVALID_LOCATION_COORDINATES';
    throw error;
  }
  return { latitude: body.latitude, longitude: body.longitude };
}

module.exports = { locationCoordinates };
