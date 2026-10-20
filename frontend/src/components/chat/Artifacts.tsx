import 'leaflet/dist/leaflet.css'
import { useEffect, useState } from 'react'
import { CircleMarker, MapContainer, TileLayer, Tooltip } from 'react-leaflet'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api, type FilePreview } from '../../lib/api'
import { type Artifact, numericColumns, type Place, toNumber } from '../../lib/artifacts'

const PREVIEWABLE = new Set([
  'xlsx', 'xlsm', 'csv', 'tsv', 'docx', 'pdf', 'txt', 'md', 'markdown',
  'json', 'py', 'js', 'ts', 'tsx', 'html', 'css', 'yaml', 'yml', 'log', 'xml', 'sh', 'sql',
])

export function Artifacts({ artifacts }: { artifacts: Artifact[] }) {
  if (!artifacts.length) return null
  return (
    <div className="flex flex-col gap-2.5 self-stretch">
      {artifacts.map((a) => (
        <div key={a.id}>
          {a.kind === 'places' && <PlacesArtifact places={a.places} near={a.near} />}
          {a.kind === 'images' && <ImagesArtifact images={a.images} />}
          {a.kind === 'table' && <TableArtifact name={a.name} columns={a.columns} rows={a.rows} />}
          {a.kind === 'file' && <FileArtifact path={a.path} size={a.size} />}
        </div>
      ))}
    </div>
  )
}

const card = 'overflow-hidden rounded-[14px] border border-line bg-panel'
const header = 'flex items-center justify-between gap-2 border-b border-line px-3.5 py-2.5 text-[12px] font-medium text-muted'

/* ----------------------------------------------------------------- places + map */

function PlacesArtifact({ places, near }: { places: Place[]; near?: string }) {
  const pts = places.filter((p) => typeof p.lat === 'number' && typeof p.lon === 'number')
  const center: [number, number] = pts.length
    ? [pts.reduce((s, p) => s + p.lat!, 0) / pts.length, pts.reduce((s, p) => s + p.lon!, 0) / pts.length]
    : [0, 0]

  return (
    <div className={card}>
      <div className={header}>
        <span>📍 {places.length} place{places.length !== 1 ? 's' : ''}{near ? ` near ${near}` : ''}</span>
      </div>
      {pts.length > 0 && (
        <MapContainer center={center} zoom={14} scrollWheelZoom={false} style={{ height: 240, width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {pts.map((p, i) => (
            <CircleMarker key={i} center={[p.lat!, p.lon!]} radius={7} pathOptions={{ color: '#e8a33d', fillColor: '#e8a33d', fillOpacity: 0.8 }}>
              <Tooltip>{p.name}</Tooltip>
            </CircleMarker>
          ))}
        </MapContainer>
      )}
      <div className="flex max-h-56 flex-col divide-y divide-line overflow-y-auto">
        {places.map((p, i) => (
          <div key={i} className="px-3.5 py-2.5 text-[13px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-medium text-ink">{p.name}</span>
              {p.type && <span className="shrink-0 text-[11px] text-faint">{p.type}</span>}
            </div>
            {p.address && <div className="mt-0.5 text-[12px] text-muted">{p.address}</div>}
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px]">
              {p.phone && <span className="text-faint">{p.phone}</span>}
              {p.website && (
                <a href={p.website} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                  Website
                </a>
              )}
              {p.maps_url && (
                <a href={p.maps_url} target="_blank" rel="noreferrer noopener" className="text-accent hover:underline">
                  Directions
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- image grid */

function ImagesArtifact({ images }: { images: { title?: string; thumbnail: string; source?: string }[] }) {
  return (
    <div>
      <div className="mb-2 text-[12px] text-faint">{images.length} image{images.length !== 1 ? 's' : ''}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {images.map((img, i) => (
          <a
            key={i}
            href={img.source || img.thumbnail}
            target="_blank"
            rel="noreferrer noopener"
            title={img.title ? `${img.title} — open source` : 'Open source'}
            className="group block overflow-hidden rounded-[12px] border border-line"
          >
            <div className="aspect-[4/3] overflow-hidden bg-bg2">
              <img src={img.thumbnail} alt={img.title ?? ''} loading="lazy" className="size-full object-cover transition duration-200 group-hover:scale-[1.03]" />
            </div>
            {img.title && (
              <div className="truncate bg-panel px-2.5 py-1.5 text-[11.5px] leading-tight text-muted transition group-hover:text-ink" title={img.title}>
                {img.title}
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- table + chart */

function TableArtifact({ name, columns, rows }: { name: string; columns: string[]; rows: string[][] }) {
  const numeric = numericColumns(columns, rows)
  const canChart = numeric.length > 0 && rows.length > 1 && rows.length <= 50
  const [view, setView] = useState<'table' | 'chart'>('table')
  const [valueCol, setValueCol] = useState(numeric[0] ?? 0)
  const labelCol = columns.findIndex((_, i) => !numeric.includes(i))
  const li = labelCol === -1 ? 0 : labelCol

  const data = rows.map((r) => ({ label: r[li], value: toNumber(r[valueCol] ?? '0') }))

  return (
    <div className={card}>
      <div className={header}>
        <span className="truncate">▦ {name} · {rows.length} rows</span>
        {canChart && (
          <div className="flex shrink-0 items-center gap-1">
            {numeric.length > 1 && view === 'chart' && (
              <select
                value={valueCol}
                onChange={(e) => setValueCol(Number(e.target.value))}
                className="rounded-md border border-line bg-bg2 px-1.5 py-0.5 text-[11px] text-ink"
              >
                {numeric.map((i) => (
                  <option key={i} value={i}>{columns[i]}</option>
                ))}
              </select>
            )}
            <Toggle active={view === 'table'} onClick={() => setView('table')}>Table</Toggle>
            <Toggle active={view === 'chart'} onClick={() => setView('chart')}>Chart</Toggle>
          </div>
        )}
      </div>
      {view === 'table' || !canChart ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full border-collapse text-[12.5px]">
            <thead className="sticky top-0 bg-panel">
              <tr>
                {columns.map((c, i) => (
                  <th key={i} className="border-b border-line px-3 py-1.5 text-left font-medium text-muted">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri} className="hover:bg-hover">
                  {columns.map((_, ci) => (
                    <td key={ci} className="border-b border-line px-3 py-1.5 text-ink">{r[ci]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-3">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--color-faint)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-faint)' }} />
              <RTooltip contentStyle={{ background: 'var(--color-panel)', border: '1px solid var(--color-line)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="value" fill="var(--color-accent)" radius={[3, 3, 0, 0]} name={columns[valueCol]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-2 py-0.5 text-[11px] transition ${active ? 'bg-accent text-ink-dark' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}

/* ----------------------------------------------------------------- file card */

const FILE_KINDS: Record<string, { label: string; color: string; glyph: 'sheet' | 'doc' | 'slide' | 'pdf' }> = {
  xlsx: { label: 'XLSX', color: '#1d7a46', glyph: 'sheet' },
  xlsm: { label: 'XLSM', color: '#1d7a46', glyph: 'sheet' },
  csv: { label: 'CSV', color: '#1d7a46', glyph: 'sheet' },
  tsv: { label: 'TSV', color: '#1d7a46', glyph: 'sheet' },
  docx: { label: 'DOCX', color: '#2b579a', glyph: 'doc' },
  doc: { label: 'DOC', color: '#2b579a', glyph: 'doc' },
  pptx: { label: 'PPTX', color: '#c43e1c', glyph: 'slide' },
  pdf: { label: 'PDF', color: '#c4302b', glyph: 'pdf' },
}

function FileIcon({ ext }: { ext: string }) {
  const k = FILE_KINDS[ext] ?? { label: ext.toUpperCase().slice(0, 4) || 'FILE', color: '#6b655c', glyph: 'doc' as const }
  return (
    <span className="relative flex size-11 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: k.color }}>
      <svg viewBox="0 0 24 24" className="size-5 text-white/90" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3v4a1 1 0 0 0 1 1h4" />
        <path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2Z" />
        {k.glyph === 'sheet' && <path d="M8 13h8M8 17h8M12 13v4" />}
        {k.glyph === 'doc' && <path d="M8 13h8M8 17h5" />}
        {k.glyph === 'slide' && <rect x="8" y="12" width="8" height="6" rx="1" />}
        {k.glyph === 'pdf' && <path d="M9 13h2a1 1 0 0 1 0 2H9v2m4-4h2m-2 2h1" />}
      </svg>
      <span className="absolute -bottom-1 rounded-[3px] bg-white/95 px-1 text-[7.5px] font-bold tracking-wide" style={{ color: k.color }}>
        {k.label}
      </span>
    </span>
  )
}

function FileArtifact({ path, size }: { path: string; size?: number }) {
  const name = path.split('/').pop() ?? path
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  const previewable = PREVIEWABLE.has(ext)
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [loading, setLoading] = useState(false)

  const openPreview = async () => {
    if (!previewable) return
    setOpen(true)
    if (!preview) {
      setLoading(true)
      try {
        setPreview(await api.filePreview(path))
      } catch {
        setPreview({ kind: 'unsupported' })
      }
      setLoading(false)
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-[14px] border border-line px-3 py-2.5">
        <FileIcon ext={ext} />
        <button onClick={openPreview} className={`min-w-0 flex-1 text-left ${previewable ? 'cursor-pointer' : 'cursor-default'}`}>
          <span className="block truncate text-[13.5px] font-medium text-ink">{name}</span>
          <span className="block text-[11.5px] text-faint">
            {size != null ? formatBytes(size) : 'File'}
            {previewable && <> · Click to preview</>}
          </span>
        </button>
        <a
          href={`/api/files/download?path=${encodeURIComponent(path)}`}
          title="Download"
          className="flex size-9 shrink-0 items-center justify-center rounded-[9px] border border-line text-muted transition hover:border-accent-dim hover:text-ink"
          onClick={(e) => e.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
          </svg>
        </a>
      </div>
      {open && (
        <FilePreviewModal name={name} ext={ext} path={path} preview={preview} loading={loading} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

/** A floating preview window for a file artifact (document, spreadsheet, code…). */
function FilePreviewModal({
  name, ext, path, preview, loading, onClose,
}: {
  name: string
  ext: string
  path: string
  preview: FilePreview | null
  loading: boolean
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-[min(680px,85vh)] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
          <FileIcon ext={ext} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-ink">{name}</span>
          <a
            href={`/api/files/download?path=${encodeURIComponent(path)}`}
            title="Download"
            className="flex size-8 items-center justify-center rounded-[9px] border border-line text-muted transition hover:border-accent-dim hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16" />
            </svg>
          </a>
          <button onClick={onClose} title="Close" className="flex size-8 items-center justify-center rounded-full text-faint transition hover:bg-hover hover:text-ink">
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="px-5 py-6 text-[13px] text-faint">Loading preview…</div>
          ) : preview?.kind === 'text' ? (
            <div className="px-5 py-4 text-[13.5px] leading-relaxed">
              {preview.format === 'markdown' ? (
                <div className="md">
                  <Markdown remarkPlugins={[remarkGfm]}>{preview.text ?? ''}</Markdown>
                </div>
              ) : (
                <pre className="font-sans whitespace-pre-wrap text-ink">{preview.text}</pre>
              )}
            </div>
          ) : preview?.kind === 'table' && preview.columns ? (
            <table className="w-full border-collapse text-[12.5px]">
              <thead className="sticky top-0 bg-panel">
                <tr>
                  {preview.columns.map((c, i) => (
                    <th key={i} className="border-b border-line px-3.5 py-2 text-left font-medium text-muted">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(preview.rows ?? []).map((r, ri) => (
                  <tr key={ri} className="hover:bg-hover">
                    {preview.columns!.map((_, ci) => (
                      <td key={ci} className="border-b border-line px-3.5 py-2 text-ink">{r[ci] ?? ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-6 text-[13px] text-faint">No inline preview for this file type — use download.</div>
          )}
        </div>
      </div>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
