// Derive rich, renderable artifacts from a run's tool results — deterministically, without
// relying on the model to emit special markup. A map for find_places, an image grid for
// search_images, a table (+chart) for CSV reads, a download card for generated files.

import type { Run } from './api'

export interface Place {
  name: string
  type?: string | null
  address?: string | null
  phone?: string | null
  website?: string | null
  maps_url?: string | null
  lat?: number
  lon?: number
}
export interface ImageItem {
  title?: string
  thumbnail: string
  source?: string
}

export type Artifact =
  | { id: string; kind: 'places'; near?: string; places: Place[] }
  | { id: string; kind: 'images'; images: ImageItem[] }
  | { id: string; kind: 'table'; name: string; columns: string[]; rows: string[][] }
  | { id: string; kind: 'file'; path: string; size?: number }

const toolSuffix = (name: string) => name.split('__').pop() ?? name

function parseLatLon(mapsUrl?: string | null): { lat?: number; lon?: number } {
  const m = mapsUrl?.match(/query=(-?[\d.]+),(-?[\d.]+)/)
  return m ? { lat: parseFloat(m[1]), lon: parseFloat(m[2]) } : {}
}

/** Minimal RFC-4180-ish CSV parser (handles quoted fields and escaped quotes). */
function parseCsv(text: string, maxRows = 60): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (rows.length > maxRows) break
    } else if (ch !== '\r') field += ch
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c !== ''))
}

export function artifactsFromRun(run: Run): Artifact[] {
  const out: Artifact[] = []
  for (const tc of run.tool_calls) {
    if (tc.status !== 'succeeded' || !tc.result) continue
    const tool = toolSuffix(tc.tool_name)
    try {
      if (tool === 'find_places') {
        const d = JSON.parse(tc.result)
        const places: Place[] = (d.places ?? []).map((p: Place) => ({ ...p, ...parseLatLon(p.maps_url) }))
        if (places.length) out.push({ id: tc.id, kind: 'places', near: d.near, places })
      } else if (tool === 'search_images') {
        const d = JSON.parse(tc.result)
        if (Array.isArray(d) && d.length) out.push({ id: tc.id, kind: 'images', images: d })
      } else if (tool === 'create_file' || tool === 'write_file') {
        const d = JSON.parse(tc.result)
        if (d.path) out.push({ id: tc.id, kind: 'file', path: d.path, size: d.size })
      } else if (tool === 'read_file') {
        const path = String((tc.arguments as { path?: string })?.path ?? '')
        if (/\.(csv|tsv)$/i.test(path)) {
          const body = tc.result.replace(/^\d+\s*rows?\s*×.*\n/, '')
          const parsed = parseCsv(body)
          if (parsed.length > 1) {
            out.push({ id: tc.id, kind: 'table', name: path.split('/').pop() ?? path, columns: parsed[0], rows: parsed.slice(1) })
          }
        }
      }
    } catch {
      /* the result wasn't the shape we expected — skip this one */
    }
  }
  return out
}

const clean = (v: string) => Number(v.replace(/[,$%\s]/g, ''))

/** Indices of columns whose every cell parses as a number — candidates for charting. */
export function numericColumns(columns: string[], rows: string[][]): number[] {
  return columns
    .map((_, i) => i)
    .filter((i) => rows.length > 0 && rows.every((r) => r[i] !== undefined && r[i] !== '' && !Number.isNaN(clean(r[i]))))
}

export const toNumber = clean
