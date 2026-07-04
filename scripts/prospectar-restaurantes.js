#!/usr/bin/env node
/*
 * scripts/prospectar-restaurantes.js
 *
 * Genera una lista de prospectos (restaurantes) de una ciudad usando la
 * Google Places API (New) — la vía OFICIAL, no scraping (el scraping de
 * Google Maps viola sus ToS y las listas mueren cuando cambia el HTML).
 *
 * Uso:
 *   GOOGLE_MAPS_API_KEY=xxx node scripts/prospectar-restaurantes.js --ciudad="Toluca, Estado de México"
 *   node scripts/prospectar-restaurantes.js --ciudad="Metepec" --giros="hamburguesas,alitas" --max=40
 *
 * Argumentos:
 *   --ciudad   (requerido) ciudad/zona a prospectar
 *   --giros    lista separada por comas; default: giros donde MRTPVREST ya tiene caso
 *   --max      máx. resultados por giro (20, 40 o 60; default 60)
 *   --out      ruta del CSV de salida; default prospectos-<ciudad>.csv
 *
 * Salida: CSV ordenado por score de prospección (mejores primero):
 *   +2 si NO tiene sitio web (candidato a tienda en línea / WhatsApp)
 *   +1 si tiene 100+ reseñas (volumen real → dolor de operación)
 *   +1 si tiene teléfono (contactable)
 *
 * Requiere: Node 18+ (fetch global) y una API key con "Places API (New)"
 * habilitada (https://console.cloud.google.com → APIs & Services).
 * Costo: Text Search se cobra por request (hay cuota gratuita mensual por
 * SKU); una corrida default son ~21 requests. Revisa precios vigentes.
 */

const fs = require('fs')
const path = require('path')

const API_KEY = process.env.GOOGLE_MAPS_API_KEY
const ENDPOINT = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.nationalPhoneNumber',
  'places.formattedAddress',
  'places.websiteUri',
  'places.rating',
  'places.userRatingCount',
  'places.primaryTypeDisplayName',
  'places.googleMapsUri',
  'places.businessStatus',
  'nextPageToken',
].join(',')

const DEFAULT_GIROS = ['hamburguesas', 'pizzería', 'taquería', 'alitas', 'mariscos', 'pollos asados', 'sushi']

function parseArgs() {
  const args = {}
  for (const raw of process.argv.slice(2)) {
    const match = raw.match(/^--([a-z]+)=(.*)$/)
    if (match) args[match[1]] = match[2]
  }
  return args
}

async function searchGiro(giro, ciudad, max) {
  const results = []
  let pageToken = null
  while (results.length < max) {
    const body = { textQuery: `${giro} en ${ciudad}`, languageCode: 'es', pageSize: 20 }
    if (pageToken) body.pageToken = pageToken
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Places API ${res.status} para "${giro}": ${text.slice(0, 300)}`)
    }
    const data = await res.json()
    results.push(...(data.places || []))
    pageToken = data.nextPageToken
    if (!pageToken) break
    // El token de la siguiente página tarda un momento en estar listo.
    await new Promise((r) => setTimeout(r, 2000))
  }
  return results.slice(0, max)
}

function score(p) {
  let s = 0
  if (!p.websiteUri) s += 2
  if ((p.userRatingCount || 0) >= 100) s += 1
  if (p.nationalPhoneNumber) s += 1
  return s
}

function csvCell(value) {
  const str = String(value ?? '')
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

async function main() {
  if (!API_KEY) {
    console.error('Falta GOOGLE_MAPS_API_KEY. Crea una API key con "Places API (New)" habilitada y expórtala:')
    console.error('  GOOGLE_MAPS_API_KEY=xxx node scripts/prospectar-restaurantes.js --ciudad="Toluca"')
    process.exit(1)
  }
  const args = parseArgs()
  if (!args.ciudad) {
    console.error('Falta --ciudad. Ejemplo: --ciudad="Toluca, Estado de México"')
    process.exit(1)
  }
  const giros = (args.giros ? args.giros.split(',') : DEFAULT_GIROS).map((g) => g.trim()).filter(Boolean)
  const max = Math.min(Number(args.max) || 60, 60)

  const byId = new Map()
  for (const giro of giros) {
    process.stdout.write(`Buscando "${giro}" en ${args.ciudad}... `)
    const places = await searchGiro(giro, args.ciudad, max)
    let nuevos = 0
    for (const p of places) {
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue
      if (!byId.has(p.id)) {
        byId.set(p.id, { ...p, giroBusqueda: giro })
        nuevos += 1
      }
    }
    console.log(`${places.length} resultados (${nuevos} nuevos)`)
  }

  const rows = [...byId.values()]
    .map((p) => ({ ...p, prospectScore: score(p) }))
    .sort((a, b) => b.prospectScore - a.prospectScore || (b.userRatingCount || 0) - (a.userRatingCount || 0))

  const header = [
    'score', 'nombre', 'telefono', 'tiene_web', 'resenas', 'rating',
    'giro_busqueda', 'tipo_google', 'direccion', 'sitio_web', 'google_maps',
  ]
  const lines = [header.join(',')]
  for (const p of rows) {
    lines.push([
      p.prospectScore,
      csvCell(p.displayName?.text),
      csvCell(p.nationalPhoneNumber),
      p.websiteUri ? 'sí' : 'NO',
      p.userRatingCount ?? 0,
      p.rating ?? '',
      csvCell(p.giroBusqueda),
      csvCell(p.primaryTypeDisplayName?.text),
      csvCell(p.formattedAddress),
      csvCell(p.websiteUri),
      csvCell(p.googleMapsUri),
    ].join(','))
  }

  const slug = args.ciudad.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const outPath = args.out || path.join(process.cwd(), `prospectos-${slug}.csv`)
  // BOM para que Excel abra los acentos bien.
  fs.writeFileSync(outPath, '﻿' + lines.join('\n'), 'utf8')

  const sinWeb = rows.filter((p) => !p.websiteUri).length
  console.log(`\n${rows.length} prospectos únicos → ${outPath}`)
  console.log(`Sin sitio web (mejor gancho tienda en línea/WhatsApp): ${sinWeb}`)
  console.log('Siguiente paso: docs/playbook-prospeccion-restaurantes.md')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
