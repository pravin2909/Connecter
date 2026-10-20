import { useMemo, useState } from 'react'
import { Popover } from '../components/Popover'
import { ThemeToggle } from '../components/ThemeToggle'
import {
  BrowserIcon,
  DatabaseIcon,
  FolderIcon,
  GlobeIcon,
  MailIcon,
  SearchIcon,
  ShieldIcon,
} from '../components/icons'
import { useUI } from '../store'

type Icon = (p: { className?: string }) => React.ReactElement
const BrowserIconLocal: Icon = BrowserIcon

const CAPS: { id: string; tag: string; Icon: Icon; title: string; body: string }[] = [
  { id: 'documents', tag: 'RAG', Icon: DatabaseIcon, title: 'Agentic RAG', body: 'Asks your own PDFs, notes and data. It decides when private knowledge is needed, retrieves with hybrid search plus reranking, and answers with openable citations.' },
  { id: 'web', tag: 'NET', Icon: GlobeIcon, title: 'Live web', body: 'Searches the open web, reads pages and extracts what matters, so answers reflect what is true today, not just what the model memorised.' },
  { id: 'files', tag: 'FS', Icon: FolderIcon, title: 'Local files', body: 'Reads, writes and organises files in one sandboxed workspace. PDF, Word, Excel, CSV, Markdown. Never a byte outside the folder you chose.' },
  { id: 'email', tag: 'SMTP', Icon: MailIcon, title: 'Email', body: 'Finds contacts, reads threads and drafts replies in your voice. Nothing is ever sent until you have seen it and approved it.' },
  { id: 'browser', tag: 'CDP', Icon: BrowserIconLocal, title: 'Real browser', body: 'When a task needs a real site, like a login, a form or a download, it drives an actual browser and shows you its screen while it works.' },
  { id: 'approvals', tag: 'GATE', Icon: ShieldIcon, title: 'Human approval', body: 'Every consequential step, like sending mail, overwriting a file or submitting a form, pauses for a one-tap approval. You stay in control of what matters.' },
]

const NAV = [
  { label: 'PRODUCT', items: [['product', DatabaseIcon, 'Capabilities', 'Everything Connecter can do'], ['how', BrowserIconLocal, 'How it works', 'Watch a task run step by step']] },
  { label: 'DOCS', items: [['company', ShieldIcon, 'Local-first', 'Where your data lives'], ['start', FolderIcon, 'Get started', 'Run it locally in minutes']] },
] as const

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })

export function Logo({ className = '' }: { className?: string }) {
  return (
    <div className={`font-display text-[22px] font-semibold tracking-[-0.03em] ${className}`}>
      conn<span className="text-accent">e</span>ct<span className="text-accent">e</span>r
    </div>
  )
}

/* ---------------------------------------------------------------- primitives */

function Kicker({ index, children }: { index: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.22em] text-faint uppercase">
      <span className="text-accent">{index}</span>
      <span className="h-px w-6 bg-line" />
      {children}
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-[8px] border border-accent-dim/50 px-3 py-1.5 font-mono text-[10px] tracking-[0.18em] text-muted uppercase">
      <span className="size-2 animate-pulse rounded-[2px] bg-accent" />
      {children}
    </span>
  )
}

/** L-shaped corner brackets, inset just inside a rounded bordered container. */
function Corners() {
  const base = 'pointer-events-none absolute size-2.5 border-accent'
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t`} />
      <span className={`${base} right-2 top-2 border-r border-t`} />
      <span className={`${base} bottom-2 left-2 border-b border-l`} />
      <span className={`${base} bottom-2 right-2 border-b border-r`} />
    </>
  )
}

const ghostBtn =
  'inline-flex h-10 items-center gap-2 rounded-[9px] border border-line px-4 font-mono text-[11px] tracking-[0.12em] text-muted uppercase transition hover:border-accent-dim hover:text-ink'
const solidBtn =
  'inline-flex h-10 items-center gap-2 rounded-[9px] bg-accent px-5 font-mono text-[11px] font-semibold tracking-[0.12em] text-[#1b1409] uppercase transition hover:brightness-110'
const iconBtn =
  'flex size-10 items-center justify-center rounded-[9px] border border-line text-muted transition hover:border-accent-dim hover:text-ink'

/* --------------------------------------------------------------- the page */

export default function Home() {
  const openChat = useUI((s) => s.openChat)

  return (
    <div className="relative min-h-screen">
      {/* mosaic blueprint background */}
      <div className="bp-grid bp-grid-mask pointer-events-none fixed inset-0 -z-10" aria-hidden />

      <TopNav onStart={() => openChat()} />

      <main className="relative">
        {/* ---------------------------------------------------------- HERO */}
        <section className="mx-auto grid max-w-[1280px] grid-cols-1 items-center gap-16 px-5 pt-[90px] pb-24 md:grid-cols-[1.05fr_.95fr] md:px-10 md:pt-[130px] md:pb-28">
          <div>
            <Badge>System online · local runtime</Badge>
            <h1 className="mt-7 font-display text-[44px] leading-[0.95] font-semibold tracking-[-0.045em] text-ink md:text-[76px]">
              The heart of
              <br />
              autonomous work
              <br />
              <span className="text-accent">starts with Connecter.</span>
            </h1>
            <div className="mt-8 flex max-w-[520px] gap-4">
              <span className="w-px shrink-0 bg-accent-dim" />
              <p className="font-mono text-[12px] leading-[1.7] tracking-[0.02em] text-muted uppercase">
                One agent that reasons over your documents, the live web, your files, email and a real browser. It
                plans multi-step tasks and pauses for approval before anything that matters. On-device, on a model
                you choose.
              </p>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button onClick={() => openChat()} className={solidBtn}>
                Get started <span>→</span>
              </button>
              <button onClick={() => scrollTo('how')} className={ghostBtn}>
                View architecture
              </button>
            </div>
          </div>

          <div className="relative">
            <div className="relative rounded-[14px] border border-line bg-bg2/40 p-5">
              <Corners />
              <Topology />
            </div>
            <div className="mt-2.5 flex items-center justify-between font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
              <span>Fig. 01 / agent topology</span>
              <span className="text-accent">4 MCP servers</span>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------- CAPABILITIES (bento) */}
        <section id="product" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-5 pt-16 md:px-10">
            <Kicker index="01">Capabilities</Kicker>
            <h2 className="mt-5 max-w-[640px] font-display text-[34px] leading-[1.05] tracking-[-0.035em] md:text-[48px]">
              One agent, every tool.
            </h2>
            <p className="mt-4 max-w-[560px] font-mono text-[12px] leading-[1.7] text-muted uppercase">
              Each capability is an isolated server reached over the Model Context Protocol. The agent picks up only
              the ones a task needs.
            </p>
          </div>
          {/* bento: 1px gaps via a hairline-colored grid */}
          <div className="mx-auto mt-12 max-w-[1280px] px-5 pb-20 md:px-10">
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-3">
              {CAPS.map(({ id, tag, Icon, title, body }) => (
                <article key={id} id={id} className="group relative scroll-mt-24 bg-bg p-7 transition-colors hover:bg-bg2/60">
                  <div className="flex items-center justify-between">
                    <span className="border-l-2 border-accent pl-2 font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
                      {tag}
                    </span>
                    <Icon className="size-5 text-faint transition-colors group-hover:text-accent" />
                  </div>
                  <h3 className="mt-6 font-display text-[21px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
                  <p className="mt-2.5 text-[14px] leading-[1.6] text-muted">{body}</p>
                  <span className="pointer-events-none absolute bottom-0 left-0 h-px w-0 bg-accent transition-[width] duration-300 group-hover:w-full" />
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ HOW IT WORKS */}
        <section
          id="how"
          className="mx-auto grid max-w-[1280px] scroll-mt-24 grid-cols-1 items-start gap-14 border-t border-line px-5 py-20 md:grid-cols-[.85fr_1.15fr] md:px-10"
        >
          <div className="md:sticky md:top-28">
            <Kicker index="02">How it works</Kicker>
            <h2 className="mt-5 font-display text-[34px] leading-[1.05] tracking-[-0.035em] md:text-[48px]">
              See the work,
              <br />
              step by step.
            </h2>
            <p className="mt-4 max-w-[400px] font-mono text-[12px] leading-[1.7] text-muted uppercase">
              No hidden reasoning, only real, auditable actions. Every tool call is logged.
            </p>
            <ol className="mt-8 divide-y divide-line border-y border-line">
              {[
                ['Understand & plan', 'Breaks your goal into concrete steps.'],
                ['Pick the right tool', 'RAG, web, files, email or browser, only what fits.'],
                ['Act & observe', 'Runs the step, reacts to the result, re-plans if needed.'],
                ['Ask before it counts', 'Consequential actions wait for your approval.'],
              ].map(([t, d], i) => (
                <li key={t} className="flex items-baseline gap-4 py-3.5">
                  <span className="font-mono text-[11px] text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <div>
                    <div className="text-[14.5px] font-medium text-ink">{t}</div>
                    <div className="text-[13px] text-muted">{d}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <RunWindow />
        </section>

        {/* ------------------------------------------------------- LOCAL-FIRST */}
        <section id="company" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-5 py-20 md:px-10">
            <div className="grid grid-cols-1 gap-10 md:grid-cols-2">
              <div>
                <Kicker index="03">Local-first</Kicker>
                <h2 className="mt-5 font-display text-[34px] leading-[1.05] tracking-[-0.035em] md:text-[48px]">
                  Built around trust.
                </h2>
              </div>
              <p className="max-w-[500px] self-end font-mono text-[12px] leading-[1.7] text-muted uppercase">
                The model runs on your hardware. Documents are indexed and searched on your machine. Cloud is used
                only when a task genuinely needs it, like reaching the web or sending mail, never for your private data.
              </p>
            </div>
            <div className="mt-12 grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-3">
              {[
                ['On your machine', 'The LLM, your files and the vector index all stay local.'],
                ['You choose the model', 'Point it at any OpenAI-compatible model. Swap it anytime.'],
                ['Nothing silent', 'Every tool call is logged; consequential ones need a yes.'],
              ].map(([t, d], i) => (
                <div key={t} className="bg-bg p-7">
                  <span className="font-mono text-[10px] tracking-[0.18em] text-accent">{String(i + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">{t}</h3>
                  <p className="mt-2 text-[13.5px] leading-[1.55] text-muted">{d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------- CTA form */}
        <section id="start" className="scroll-mt-24 border-t border-line">
          <div className="mx-auto max-w-[1280px] px-5 py-24 md:px-10">
            <div className="relative mx-auto max-w-[640px] rounded-[14px] border border-line bg-bg2/40 p-10 text-center md:p-14">
              <Corners />
              <div className="font-mono text-[10px] tracking-[0.22em] text-faint uppercase">Ready when you are</div>
              <h2 className="mt-4 font-display text-[30px] leading-[1.1] tracking-[-0.03em] text-ink md:text-[40px]">
                Hand Connecter its first task.
              </h2>
              <p className="mx-auto mt-4 max-w-[400px] font-mono text-[11px] leading-[1.7] text-muted uppercase">
                Start your local model, open the workspace, type a goal. Everything runs on this machine.
              </p>
              <div className="mt-8 flex items-center justify-center gap-3">
                <button onClick={() => openChat()} className={solidBtn}>
                  Open the workspace <span>→</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------ footer */}
        <footer className="border-t border-line">
          <div className="mx-auto flex max-w-[1280px] flex-col items-center justify-between gap-4 px-5 py-8 font-mono text-[10px] tracking-[0.18em] text-faint uppercase md:flex-row md:px-10">
            <Logo className="!text-[17px] normal-case opacity-80" />
            <span>Local-first AI computer agent</span>
            <span className="flex items-center gap-2">
              <span className="size-1.5 bg-accent" /> Runs on your machine
            </span>
          </div>
        </footer>
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------- nav */

function TopNav({ onStart }: { onStart: () => void }) {
  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-[color-mix(in_srgb,var(--color-bg)_80%,transparent)] backdrop-blur-[14px]">
      <div className="mx-auto flex h-[64px] max-w-[1280px] items-center justify-between px-5 md:px-10">
        <div className="flex items-center gap-8">
          <Logo />
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((group, i) => (
              <NavMenu key={group.label} group={group} index={String(i + 1).padStart(2, '0')} />
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SiteSearch />
          <Popover
            className="top-14 right-0 w-[240px]"
            trigger={({ toggle }) => (
              <button className={iconBtn} onClick={toggle} aria-label="Settings">
                <GearGlyph />
              </button>
            )}
          >
            {() => (
              <div className="p-1">
                <div className="px-1 pb-2 font-mono text-[10px] tracking-[0.18em] text-faint uppercase">Appearance</div>
                <ThemeToggle />
              </div>
            )}
          </Popover>
          <button onClick={onStart} className={`${solidBtn} hidden sm:inline-flex`}>
            Launch
          </button>
        </div>
      </div>
    </nav>
  )
}

function NavMenu({ group, index }: { group: (typeof NAV)[number]; index: string }) {
  return (
    <Popover
      className="top-11 left-0 w-[280px]"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          className={`inline-flex items-center gap-2 px-3 py-2 font-mono text-[11px] tracking-[0.12em] uppercase transition hover:text-ink ${open ? 'text-ink' : 'text-muted'}`}
        >
          <span className="text-accent">{index}.</span> {group.label}
        </button>
      )}
    >
      {(close) => (
        <div className="flex flex-col gap-0.5">
          {group.items.map(([id, Icon, title, desc]) => (
            <button
              key={id}
              onClick={() => { close(); scrollTo(id) }}
              className="flex items-start gap-3 p-2.5 text-left transition hover:bg-hover"
            >
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-[8px] border border-line bg-bg2 text-accent">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-[13.5px] font-medium text-ink">{title}</span>
                <span className="block text-[12px] text-muted">{desc}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

const SEARCH_INDEX = [
  ...CAPS.map((c) => ({ id: c.id, title: c.title, hint: c.body })),
  { id: 'how', title: 'How it works', hint: 'The agent loop, step by step' },
  { id: 'company', title: 'Local-first', hint: 'Where your data lives' },
  { id: 'start', title: 'Get started', hint: 'Run Connecter locally' },
]

function SiteSearch() {
  const [q, setQ] = useState('')
  const results = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return SEARCH_INDEX
    return SEARCH_INDEX.filter((r) => (r.title + ' ' + r.hint).toLowerCase().includes(t))
  }, [q])

  return (
    <Popover
      className="top-14 right-0 w-[320px]"
      trigger={({ toggle }) => (
        <button className={iconBtn} onClick={toggle} aria-label="Search">
          <SearchIcon className="size-[17px]" />
        </button>
      )}
    >
      {(close) => (
        <div>
          <div className="mb-2 flex items-center gap-2 rounded-[8px] border border-line bg-bg2 px-2.5 py-2">
            <SearchIcon className="size-4 shrink-0 text-faint" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Connecter…"
              className="w-full bg-transparent text-[13.5px] text-ink outline-0 placeholder:text-faint"
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-2 py-3 text-[13px] text-faint">No matches.</div>
            ) : (
              results.map((r) => (
                <button
                  key={r.id}
                  onClick={() => { close(); scrollTo(r.id) }}
                  className="block w-full px-2.5 py-2 text-left transition hover:bg-hover"
                >
                  <span className="block text-[13.5px] font-medium text-ink">{r.title}</span>
                  <span className="block truncate text-[12px] text-muted">{r.hint}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Popover>
  )
}

function GearGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className="size-[17px]">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  )
}

/* ------------------------------------------------- network topology graphic */

function Topology() {
  const C = 210
  const R = 160
  const nodes = [
    { x: 210, y: 50, label: 'FILE', anchor: 'middle' as const, dy: -14 },
    { x: 370, y: 210, label: 'WEB', anchor: 'end' as const, dy: -12 },
    { x: 210, y: 370, label: 'EMAIL', anchor: 'middle' as const, dy: 22 },
    { x: 50, y: 210, label: 'BROWSER', anchor: 'start' as const, dy: -12 },
  ]
  const line = 'var(--color-line)'
  const accent = 'var(--color-accent)'
  const accentDim = 'var(--color-accent-dim)'
  const faint = 'var(--color-faint)'
  const mono = { fontFamily: 'var(--font-mono)' }

  return (
    <svg viewBox="0 0 420 420" className="w-full" role="img" aria-label="Agent connected to File, Web, Email and Browser servers">
      {/* rings */}
      <circle cx={C} cy={C} r={R} fill="none" stroke={accentDim} strokeWidth={1} opacity={0.5} className="bp-dashflow" />
      <circle cx={C} cy={C} r={96} fill="none" stroke={line} strokeWidth={1} />
      <circle cx={C} cy={C} r={30} fill="none" stroke={line} strokeWidth={1} />

      {/* connectors */}
      {nodes.map((n) => (
        <line key={n.label} x1={C} y1={C} x2={n.x} y2={n.y} stroke={line} strokeWidth={1} />
      ))}

      {/* orbiting signal dot */}
      <g>
        <circle cx={210} cy={50} r={4} fill={accent} />
        <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`360 ${C} ${C}`} dur="16s" repeatCount="indefinite" />
      </g>
      <g>
        <circle cx={370} cy={210} r={3} fill={accentDim} />
        <animateTransform attributeName="transform" type="rotate" from={`0 ${C} ${C}`} to={`-360 ${C} ${C}`} dur="26s" repeatCount="indefinite" />
      </g>

      {/* tool nodes */}
      {nodes.map((n) => (
        <g key={n.label}>
          <rect x={n.x - 7} y={n.y - 7} width={14} height={14} fill="var(--color-bg2)" stroke={line} strokeWidth={1} />
          <rect x={n.x - 2.5} y={n.y - 2.5} width={5} height={5} fill={accent} />
          <text x={n.x} y={n.y + n.dy} textAnchor={n.anchor} style={mono} fontSize={10} letterSpacing={2} fill={faint}>
            {n.label}
          </text>
        </g>
      ))}

      {/* center agent node */}
      <rect x={C - 23} y={C - 23} width={46} height={46} fill={accent}>
        <animate attributeName="opacity" values="1;0.78;1" dur="3s" repeatCount="indefinite" />
      </rect>
      <text x={C} y={C + 4} textAnchor="middle" style={{ ...mono, fontWeight: 700 }} fontSize={11} letterSpacing={1} fill="#1b1409">
        AGENT
      </text>
    </svg>
  )
}

/* -------------------------------------------------- agent-run mock window */

function RunWindow() {
  const rows = [
    ['Understanding request', 'parse goal', 'ok'],
    ['Searching documents', '4 chunks · rerank', 'ok'],
    ['Reading project_report.pdf', 'page 12 · architecture', 'ok'],
    ['Drafting email to Pravin', 'awaiting approval', 'warn'],
  ] as const
  return (
    <div className="relative overflow-hidden rounded-[14px] border border-line bg-bg2/40">
      <Corners />
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5 font-mono text-[10px] tracking-[0.18em] text-faint uppercase">
        <span>agent · run</span>
        <span className="flex items-center gap-1.5 text-accent"><span className="size-1.5 animate-pulse bg-accent" /> live</span>
      </div>
      <div className="flex flex-col divide-y divide-line">
        {rows.map(([title, sub, kind]) => (
          <div key={title} className="flex items-center gap-3 px-4 py-3.5">
            <span className={kind === 'warn' ? 'text-accent' : 'text-approve'}>{kind === 'warn' ? '!' : '✓'}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-ink">{title}</div>
              <div className="truncate font-mono text-[10.5px] tracking-[0.08em] text-faint uppercase">{sub}</div>
            </div>
            <span className={`shrink-0 rounded-[6px] border px-2 py-0.5 font-mono text-[9px] tracking-[0.14em] uppercase ${kind === 'warn' ? 'border-accent-dim text-accent' : 'border-line text-faint'}`}>
              {kind === 'warn' ? 'approval' : 'done'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
