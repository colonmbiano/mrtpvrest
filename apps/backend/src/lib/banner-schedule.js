/**
 * banner-schedule.js — Lógica compartida de programación de banners.
 *
 * El servidor corre en UTC, pero la programación de banners (día de la semana
 * y rango horario) se define en hora local del restaurante. Calculamos día/hora
 * en la TZ de la tienda para que un banner "miércoles 15:00-21:00" se evalúe a
 * esa hora local, no UTC.
 *
 * Usado por store.routes (tienda pública) y banners.routes (GET público) para
 * no duplicar la lógica de filtrado.
 */

function makeScheduleContext({ now = new Date(), tz = process.env.STORE_TIMEZONE || 'America/Mexico_City' } = {}) {
  // toLocaleString es caro; calcularlo una sola vez por request (no por banner).
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  return {
    now,
    dayOfWeek: local.getDay(),
    timeStr: String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0'),
  };
}

function withinTimeWindow(timeStr, start, end) {
  if (!start || !end) return true;
  if (start <= end) {
    // Ventana dentro del mismo día (ej. 09:00-18:00).
    return timeStr >= start && timeStr <= end;
  }
  // Ventana que cruza medianoche (ej. 22:00-02:00): vigente si la hora actual
  // es >= inicio (noche) o <= fin (madrugada).
  return timeStr >= start || timeStr <= end;
}

function bannerIsLive(b, ctx) {
  const c = ctx && ctx.timeStr !== undefined ? ctx : makeScheduleContext(ctx);
  try {
    const days = JSON.parse(b.scheduleDays || '[]');
    if (Array.isArray(days) && days.length > 0 && !days.includes(c.dayOfWeek)) return false;
  } catch {}
  if (b.dateFrom && c.now < new Date(b.dateFrom)) return false;
  if (b.dateTo && c.now > new Date(b.dateTo)) return false;
  if (!withinTimeWindow(c.timeStr, b.scheduleStart, b.scheduleEnd)) return false;
  return true;
}

function filterLiveBanners(banners, opts) {
  const ctx = makeScheduleContext(opts);
  return (banners || []).filter((b) => bannerIsLive(b, ctx));
}

module.exports = { makeScheduleContext, bannerIsLive, filterLiveBanners, withinTimeWindow };
