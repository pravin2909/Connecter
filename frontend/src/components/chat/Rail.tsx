import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { keys, useConversations, useDocuments, useHealth, useMe, useUploadDocument } from '../../lib/hooks'
import { useUI } from '../../store'
import { Logo } from '../../pages/Home'
import {
  ChevronIcon,
  CloseIcon,
  ComposeIcon,
  DocIcon,
  HomeIcon,
  MoonIcon,
  SearchIcon,
  SettingsIcon,
  SidebarIcon,
  SunIcon,
  TrashIcon,
} from '../icons'
import { Popover } from '../Popover'
import { ThemeToggle } from '../ThemeToggle'

const CAP_LABELS: Record<string, string> = {
  file: 'Files (workspace)',
  web: 'Web',
  email: 'Email',
  browser: 'Browser',
}

export function Rail() {
  const expanded = useUI((s) => s.sidebarExpanded)
  return (
    <>
      {expanded ? <ExpandedSidebar /> : <CollapsedRail />}
      <SettingsModal />
    </>
  )
}

/* ----------------------------------------------------------------- expanded */

function ExpandedSidebar() {
  const { data: conversations = [] } = useConversations()
  const { conversationId, selectConversation, toggleSidebar } = useUI()
  const setSearchOpen = useUI((s) => s.setSearchOpen)
  // Hide never-used "New chat" placeholders (no preview) so old empties don't clutter the list.
  const visible = conversations.filter((c) => c.preview || c.title !== 'New chat')

  return (
    <div className="flex w-[264px] shrink-0 flex-col border-r border-line bg-bg2">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <Logo className="!text-[20px]" />
        <div className="flex items-center gap-0.5">
          <IconBtn title="Search chats (⌘K)" onClick={() => setSearchOpen(true)}>
            <SearchIcon className="size-[17px]" />
          </IconBtn>
          <IconBtn title="Collapse sidebar" onClick={toggleSidebar}>
            <SidebarIcon className="size-[17px]" />
          </IconBtn>
        </div>
      </div>

      <div className="px-2">
        <button
          onClick={() => selectConversation(null)}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2.5 text-[14px] font-medium text-ink transition hover:bg-hover"
        >
          <ComposeIcon className="size-[18px]" />
          New chat
        </button>
      </div>

      <div className="mt-3 flex-1 overflow-y-auto px-2 pb-2">
        <div className="px-2 pb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">Chats</div>
        {visible.length === 0 ? (
          <div className="px-2 py-2 text-[12.5px] text-faint">No chats yet.</div>
        ) : (
          visible.map((c) => (
            <ChatRow key={c.id} c={c} active={c.id === conversationId} onSelect={() => selectConversation(c.id)} />
          ))
        )}
      </div>

      <Footer />
    </div>
  )
}

function ChatRow({
  c,
  active,
  onSelect,
}: {
  c: { id: string; title: string; preview: string | null; pinned: boolean }
  active: boolean
  onSelect: () => void
}) {
  const { conversationId, selectConversation } = useUI()
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: keys.conversations })
  const remove = useMutation({
    mutationFn: () => api.deleteConversation(c.id),
    onSuccess: () => {
      if (conversationId === c.id) selectConversation(null)
      refresh()
    },
  })
  const pin = useMutation({ mutationFn: () => api.pinConversation(c.id, !c.pinned), onSuccess: refresh })

  return (
    <div
      className={`group flex items-center gap-1 rounded-[10px] pr-1 transition ${
        active ? 'bg-panel' : 'hover:bg-hover'
      }`}
    >
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2.5 py-2 pl-2.5 text-left">
        {c.pinned ? (
          <PinGlyph className="size-3 shrink-0 text-accent" />
        ) : (
          <span className={`size-1.5 shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-faint'}`} />
        )}
        <span className={`truncate text-[13.5px] ${active ? 'text-ink' : 'text-muted group-hover:text-ink'}`}>
          {c.title}
        </span>
      </button>
      <Popover
        className="top-7 right-0 w-[150px]"
        trigger={({ toggle }) => (
          <button
            title="More"
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-faint opacity-0 transition group-hover:opacity-100 hover:text-ink"
          >
            <span className="text-[15px] leading-none">⋯</span>
          </button>
        )}
      >
        {(close) => (
          <div className="p-1">
            <MenuRow
              icon={<PinGlyph className="size-4" />}
              onClick={() => {
                close()
                pin.mutate()
              }}
            >
              {c.pinned ? 'Unpin' : 'Pin'}
            </MenuRow>
            <MenuRow
              icon={<TrashIcon className="size-4" />}
              danger
              onClick={() => {
                close()
                if (confirm(`Delete “${c.title}” and its history?`)) remove.mutate()
              }}
            >
              Delete
            </MenuRow>
          </div>
        )}
      </Popover>
    </div>
  )
}

function PinGlyph({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5M9 3h6l-1 7 3 3H7l3-3-1-7Z" />
    </svg>
  )
}

/* ---------------------------------------------------------------- collapsed */

function CollapsedRail() {
  const { selectConversation, toggleSidebar } = useUI()
  const setSearchOpen = useUI((s) => s.setSearchOpen)

  return (
    // Collapsed: a slim toolbar that blends into the page (same bg, no divider) so it reads
    // as a floating rail — not a second panel next to the centered conversation.
    <div className="flex w-[56px] shrink-0 flex-col items-center bg-bg py-4">
      <div className="flex size-9 items-center justify-center font-display text-[19px] font-semibold tracking-[-0.03em] text-ink">
        c<span className="text-accent">e</span>
      </div>
      <IconBtn title="Expand sidebar" onClick={toggleSidebar} className="mt-3">
        <SidebarIcon className="size-[18px]" />
      </IconBtn>
      <button
        title="New chat"
        onClick={() => selectConversation(null)}
        className="mt-3 flex size-[38px] items-center justify-center rounded-[10px] text-muted transition hover:bg-hover hover:text-ink"
      >
        <ComposeIcon className="size-[19px]" />
      </button>
      <IconBtn title="Search chats (⌘K)" onClick={() => setSearchOpen(true)} className="mt-1">
        <SearchIcon className="size-[18px]" />
      </IconBtn>
      <div className="flex-1" />
      <Footer collapsed />
    </div>
  )
}

/* ------------------------------------------------------------------- footer */

function Footer({ collapsed = false }: { collapsed?: boolean }) {
  const { data: user } = useMe()
  const name = user?.display_name || 'Local User'
  const sub = user && user.email !== LOCAL_USER_EMAIL ? user.email : 'Local mode'

  if (collapsed) {
    return (
      <div className="flex flex-col items-center pt-2">
        <SettingsPopover
          align="bottom-[10px] left-[52px]"
          trigger={(toggle) => (
            <button
              title={`${name} & settings`}
              onClick={toggle}
              className="flex size-[34px] items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),#B97A2A)] text-xs font-semibold text-[#1A1408]"
            >
              {initials(name)}
            </button>
          )}
        />
      </div>
    )
  }

  return (
    <div className="border-t border-line px-2 py-2.5">
      <SettingsPopover
        align="bottom-16 left-0"
        trigger={(toggle) => (
          <button
            onClick={toggle}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-1.5 transition hover:bg-hover"
            title={`${name} & settings`}
          >
            <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),#B97A2A)] text-[11px] font-semibold text-[#1A1408]">
              {initials(name)}
            </span>
            <span className="min-w-0 flex-1 text-left leading-tight">
              <span className="block truncate text-[12.5px] font-medium text-ink">{name}</span>
              <span className="block truncate text-[11px] text-faint">{sub}</span>
            </span>
          </button>
        )}
      />
    </div>
  )
}

const LOCAL_USER_EMAIL = 'local@connecter.ai'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'U'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/* ------------------------------------------------------- settings + config */

function SettingsPopover({ align, trigger }: { align: string; trigger: (toggle: () => void) => React.ReactNode }) {
  const { data: user } = useMe()
  const openHome = useUI((s) => s.openHome)
  const theme = useUI((s) => s.theme)
  const toggleTheme = useUI((s) => s.toggleTheme)
  const setSettingsOpen = useUI((s) => s.setSettingsOpen)
  const qc = useQueryClient()
  const name = user?.display_name || 'Local User'
  const isLocal = !user || user.email === LOCAL_USER_EMAIL

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      openHome()
      qc.resetQueries() // drop cached user-scoped data
    },
  })

  return (
    <Popover className={`${align} w-[290px]`} trigger={({ toggle }) => trigger(toggle)}>
      {(close) => (
        <div className="flex max-h-[76vh] flex-col">
          <div className="flex items-center gap-2.5 px-2.5 pt-1 pb-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--color-accent),#B97A2A)] text-xs font-semibold text-[#1A1408]">
              {initials(name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold text-ink">{name}</div>
              <div className="truncate text-[11.5px] text-muted">{isLocal ? 'Local mode' : user?.email}</div>
            </div>
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-hover hover:text-ink"
            >
              {theme === 'dark' ? <SunIcon className="size-[17px]" /> : <MoonIcon className="size-[17px]" />}
            </button>
          </div>

          <div className="border-t border-line p-1">
            <MenuRow icon={<SettingsIcon className="size-4" />} onClick={() => { close(); setSettingsOpen(true) }}>
              Settings
            </MenuRow>
            <MenuRow icon={<HomeIcon className="size-4" />} onClick={() => { close(); openHome() }}>
              Back to home
            </MenuRow>
            {!isLocal && (
              <MenuRow
                icon={<span className="text-[13px]">⏻</span>}
                danger
                disabled={logout.isPending}
                onClick={() => logout.mutate()}
              >
                Sign out
              </MenuRow>
            )}
          </div>
        </div>
      )}
    </Popover>
  )
}

/* ------------------------------------------------------- modern settings modal */

const SETTINGS_SECTIONS = ['General', 'Memory', 'Documents', 'Connected tools', 'About'] as const

function SettingsModal() {
  const open = useUI((s) => s.settingsOpen)
  const setOpen = useUI((s) => s.setSettingsOpen)
  const { data: health } = useHealth()
  const [section, setSection] = useState<(typeof SETTINGS_SECTIONS)[number]>('General')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    if (open) window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setOpen])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="flex h-[min(560px,82vh)] w-full max-w-[720px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* section nav */}
        <div className="flex w-[180px] shrink-0 flex-col gap-0.5 border-r border-line bg-bg2 p-2.5">
          <div className="px-2 pt-1 pb-2 font-display text-[15px] font-semibold text-ink">Settings</div>
          {SETTINGS_SECTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setSection(s)}
              className={`rounded-lg px-2.5 py-2 text-left text-[13px] transition ${
                section === s ? 'bg-panel text-ink' : 'text-muted hover:bg-hover hover:text-ink'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        {/* content */}
        <div className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[14px] font-medium text-ink">{section}</span>
            <button
              onClick={() => setOpen(false)}
              title="Close"
              className="flex size-7 items-center justify-center rounded-full text-faint transition hover:bg-hover hover:text-ink"
            >
              <CloseIcon className="size-4" />
            </button>
          </div>
          <div className="p-4">
            {section === 'General' && (
              <div className="space-y-5">
                <SettingsField label="Appearance" hint="Light or dark theme.">
                  <ThemeToggle />
                </SettingsField>
              </div>
            )}
            {section === 'Memory' && <MemoryPanel />}
            {section === 'Documents' && <DocumentsPanel />}
            {section === 'Connected tools' && <ToolsPanel />}
            {section === 'About' && (
              <dl className="space-y-3 text-[13px]">
                <SettingsField label="Model">
                  <span className="flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${health?.llm.ok ? 'bg-approve' : 'bg-danger'}`} />
                    <span className="text-ink">{health?.llm.model ?? '—'}</span>
                  </span>
                </SettingsField>
                <SettingsField label="Workspace">
                  <span className="block truncate rounded-md bg-bg2 px-2 py-1.5 font-mono text-[11.5px] text-muted" title={health?.workspace}>
                    {health?.workspace ?? '—'}
                  </span>
                </SettingsField>
                <SettingsField label="Document search">
                  <span className="text-ink">{health?.qdrant ? 'Qdrant · hybrid + rerank' : 'Qdrant offline'}</span>
                </SettingsField>
              </dl>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[12px] font-medium text-faint uppercase tracking-wide">{label}</div>
      {hint && <div className="-mt-1 text-[12px] text-muted">{hint}</div>}
      <div>{children}</div>
    </div>
  )
}

function MenuRow({
  icon,
  children,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-[13px] transition hover:bg-hover disabled:opacity-60 ${
        danger ? 'text-muted hover:text-danger' : 'text-muted hover:text-ink'
      }`}
    >
      <span className="shrink-0 text-faint">{icon}</span>
      {children}
    </button>
  )
}

function MemoryPanel() {
  const qc = useQueryClient()
  const { data: memories = [], isLoading } = useQuery({ queryKey: ['memories'], queryFn: api.memories })
  const remove = useMutation({
    mutationFn: api.deleteMemory,
    onSettled: () => qc.invalidateQueries({ queryKey: ['memories'] }),
  })

  return (
    <div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-muted">
        Durable facts and preferences Connecter has learned about you from past chats, and uses in future ones.
      </p>
      {isLoading ? (
        <div className="text-[12.5px] text-faint">Loading…</div>
      ) : memories.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[12.5px] leading-relaxed text-faint">
          Nothing remembered yet. As you chat, Connecter saves things worth recalling here.
        </div>
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {memories.map((m) => (
            <div key={m.id} className="group flex items-start gap-2.5 py-2.5">
              <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
              <div className="min-w-0 flex-1 text-[13px] leading-snug text-ink">{m.content}</div>
              <button
                title="Forget this"
                onClick={() => remove.mutate(m.id)}
                className="text-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DocumentsPanel() {
  const { data: docs = [] } = useDocuments()
  const upload = useUploadDocument()
  const qc = useQueryClient()
  const remove = useMutation({
    mutationFn: api.deleteDocument,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.documents }),
  })
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-[10px] bg-accent px-3.5 py-2 text-[13px] font-medium text-ink-dark transition hover:brightness-110"
        >
          <span className="text-[16px] leading-none">+</span> Add document
        </button>
        {docs.length > 0 && <span className="text-[12px] text-faint">{docs.length} indexed</span>}
      </div>
      <input
        ref={fileRef}
        type="file"
        hidden
        multiple
        accept=".pdf,.docx,.txt,.csv,.md,.markdown,.json"
        onChange={(e) => {
          for (const f of Array.from(e.target.files ?? [])) upload.mutate(f)
          e.target.value = ''
        }}
      />
      {upload.error && <div className="mb-2 text-[12px] text-danger">{(upload.error as Error).message}</div>}
      {docs.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-line px-4 py-6 text-center text-[12.5px] leading-relaxed text-faint">
          Add PDFs, Word docs, notes or data. Connecter searches them when you ask about your own files.
        </div>
      ) : (
        <div className="divide-y divide-line border-t border-line">
          {docs.map((d) => (
            <div key={d.id} className="group flex items-center gap-2.5 py-2">
              <DocIcon className="size-4 shrink-0 text-accent" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] text-ink" title={d.path}>{d.filename}</div>
                <div className={`text-[11px] ${d.status === 'failed' ? 'text-danger' : 'text-faint'}`} title={d.error ?? undefined}>
                  {d.status === 'ready'
                    ? `${d.chunk_count} chunks${d.page_count ? ` · ${d.page_count} pages` : ''}`
                    : d.status === 'failed'
                      ? `Failed: ${d.error ?? ''}`
                      : `${d.status[0].toUpperCase()}${d.status.slice(1)}…`}
                </div>
              </div>
              <button
                title="Remove from index"
                onClick={() => remove.mutate(d.id)}
                className="text-faint opacity-0 transition group-hover:opacity-100 hover:text-danger"
              >
                <TrashIcon className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ToolsPanel() {
  const { data: health } = useHealth()
  const [open, setOpen] = useState<string | null>(null)
  if (!health) return null
  const rows = [
    { name: 'Local LLM', ok: health.llm.ok, sub: health.llm.ok ? health.llm.model : 'Start LM Studio', tools: [] as string[] },
    { name: 'Document search', ok: health.qdrant, sub: health.qdrant ? 'Qdrant · hybrid + rerank' : 'Qdrant offline', tools: [] as string[] },
    ...health.mcp.map((m) => ({
      name: CAP_LABELS[m.name] ?? m.name,
      ok: m.status === 'ready',
      sub: m.status === 'ready' ? `${m.tools.length} tools` : (m.error ?? m.status),
      tools: m.tools,
    })),
  ]
  return (
    <div className="px-1">
      {rows.map((r) => {
        const expandable = r.tools.length > 0
        const isOpen = open === r.name
        return (
          <div key={r.name}>
            <button
              disabled={!expandable}
              onClick={() => setOpen(isOpen ? null : r.name)}
              className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1.5 text-left ${expandable ? 'transition hover:bg-hover' : 'cursor-default'}`}
            >
              <span className={`size-2 shrink-0 rounded-full ${r.ok ? 'bg-approve' : 'bg-danger'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] font-medium text-ink">{r.name}</span>
                <span className="block truncate text-[11px] text-faint">{r.sub}</span>
              </span>
              {expandable && <ChevronIcon className={`size-3.5 text-faint transition ${isOpen ? 'rotate-180' : ''}`} />}
            </button>
            {isOpen && expandable && (
              <div className="mb-1 ml-4 flex flex-wrap gap-1 px-1.5 pb-1">
                {r.tools.map((t) => (
                  <span key={t} className="rounded-md bg-bg2 px-1.5 py-0.5 font-mono text-[10.5px] text-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function IconBtn({
  title,
  onClick,
  children,
  className = '',
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`flex size-[34px] items-center justify-center rounded-[9px] text-muted transition hover:bg-hover hover:text-ink ${className}`}
    >
      {children}
    </button>
  )
}
