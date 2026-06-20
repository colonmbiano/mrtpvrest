'use strict';

// Tests de la lógica de programación de banners (lib/banner-schedule).
const {
  withinTimeWindow,
  bannerIsLive,
  filterLiveBanners,
  makeScheduleContext,
} = require('../src/lib/banner-schedule');

// ctx con timeStr explícito → bannerIsLive lo usa tal cual (no recalcula TZ).
const ctx = (timeStr, dayOfWeek = 3, now = new Date('2026-06-17T15:30:00Z')) => ({ now, dayOfWeek, timeStr });

describe('withinTimeWindow', () => {
  it('sin inicio/fin → siempre vigente', () => {
    expect(withinTimeWindow('12:00', null, null)).toBe(true);
    expect(withinTimeWindow('12:00', '', '')).toBe(true);
  });

  it('ventana dentro del mismo día (bordes incluidos)', () => {
    expect(withinTimeWindow('12:00', '09:00', '18:00')).toBe(true);
    expect(withinTimeWindow('09:00', '09:00', '18:00')).toBe(true);
    expect(withinTimeWindow('18:00', '09:00', '18:00')).toBe(true);
    expect(withinTimeWindow('08:59', '09:00', '18:00')).toBe(false);
    expect(withinTimeWindow('18:01', '09:00', '18:00')).toBe(false);
  });

  it('ventana que cruza medianoche (22:00-02:00)', () => {
    expect(withinTimeWindow('23:00', '22:00', '02:00')).toBe(true);
    expect(withinTimeWindow('01:00', '22:00', '02:00')).toBe(true);
    expect(withinTimeWindow('22:00', '22:00', '02:00')).toBe(true);
    expect(withinTimeWindow('02:00', '22:00', '02:00')).toBe(true);
    expect(withinTimeWindow('12:00', '22:00', '02:00')).toBe(false);
    expect(withinTimeWindow('03:00', '22:00', '02:00')).toBe(false);
  });
});

describe('bannerIsLive', () => {
  it('sin restricciones → vigente', () => {
    expect(bannerIsLive({}, ctx('15:30'))).toBe(true);
  });

  it('filtra por día de la semana', () => {
    expect(bannerIsLive({ scheduleDays: '[3]' }, ctx('15:30', 3))).toBe(true);
    expect(bannerIsLive({ scheduleDays: '[1,5]' }, ctx('15:30', 3))).toBe(false);
    expect(bannerIsLive({ scheduleDays: '[]' }, ctx('15:30', 3))).toBe(true); // vacío = todos los días
    expect(bannerIsLive({ scheduleDays: 'no-es-json' }, ctx('15:30', 3))).toBe(true); // tolera basura
  });

  it('respeta el rango de fechas', () => {
    const c = { now: new Date('2026-06-17T15:30:00Z'), dayOfWeek: 3, timeStr: '15:30' };
    expect(bannerIsLive({ dateFrom: '2026-06-18T00:00:00Z' }, c)).toBe(false); // aún no empieza
    expect(bannerIsLive({ dateTo: '2026-06-16T00:00:00Z' }, c)).toBe(false);   // ya expiró
    expect(bannerIsLive({ dateFrom: '2026-06-01T00:00:00Z', dateTo: '2026-06-30T00:00:00Z' }, c)).toBe(true);
  });

  it('combina horario nocturno con día', () => {
    const b = { scheduleDays: '[3]', scheduleStart: '22:00', scheduleEnd: '02:00' };
    expect(bannerIsLive(b, ctx('23:30', 3))).toBe(true);
    expect(bannerIsLive(b, ctx('15:30', 3))).toBe(false);
  });
});

describe('filterLiveBanners', () => {
  it('filtra el arreglo según el contexto (tz fijo)', () => {
    const now = new Date('2026-06-17T15:30:00Z');
    const c = makeScheduleContext({ now, tz: 'UTC' });
    const banners = [
      { id: 'a' },                                                    // siempre vigente
      { id: 'b', scheduleStart: '09:00', scheduleEnd: '18:00' },      // 15:30 dentro
      { id: 'c', scheduleStart: '18:00', scheduleEnd: '23:00' },      // fuera
      { id: 'd', scheduleDays: JSON.stringify([c.dayOfWeek]) },       // hoy
      { id: 'e', scheduleDays: JSON.stringify([(c.dayOfWeek + 1) % 7]) }, // otro día
    ];
    const live = filterLiveBanners(banners, { now, tz: 'UTC' }).map((b) => b.id);
    expect(c.timeStr).toBe('15:30');
    expect(live).toEqual(['a', 'b', 'd']);
  });

  it('tolera entrada nula', () => {
    expect(filterLiveBanners(null)).toEqual([]);
    expect(filterLiveBanners(undefined)).toEqual([]);
  });
});
