import { useEffect, useMemo, useState } from 'react'
import { useConversations } from '../../lib/hooks'
import { useUI } from '../../store'
import { ChatIcon, CloseIcon, SearchIcon } from '../icons'

/** Keyboard-driven chat search overlay (⌘/Ctrl+K) with highlighted matches. */
export function ChatSearchModal() {
  const open = useUI((s) => s.searchOpen)
  const setOpen = useUI((s) => s.setSearchOpen)
  const selectConversation = useUI((s) => s.selectConversation)
  const { data: conversations = [] } = useConversations()
  const [q, setQ] = useState('')

  // Global ⌘K / Ctrl+K to open, Escape handled in the input.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const t = q.trim().toLowerCase()
  const results = useMemo(() => {
    if (!t) return conversations.slice(0, 8)
    return conversations.filter((c) => (c.title + ' ' + (c.preview ?? '')).toLowerCase().includes(t))
  }, [conversations, t])

  if (!open) return null

  const pick = (id: string) => {
    selectConversation(id)
    setOpen(false)
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 px-4 pt-[12vh] backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-panel shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
          <SearchIcon className="size-[18px] shrink-0 text-faint" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false)
              if (e.key === 'Enter' && results[0]) pick(results[0].id)
            }}
            placeholder="Search your chats…"
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
          />
          <button
            onClick={() => setOpen(false)}
            title="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-faint transition hover:bg-hover hover:text-ink"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-1.5">
          <div className="px-2.5 pt-1 pb-1.5 text-[11px] font-medium tracking-wide text-faint uppercase">
            {t ? `${results.length} result${results.length !== 1 ? 's' : ''}` : 'Recent chats'}
          </div>
          {results.length === 0 ? (
            <div className="px-2.5 py-6 text-center text-[13px] text-faint">No chats match “{q}”.</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                className="group flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition hover:bg-hover"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-bg2 text-faint group-hover:text-accent">
                  <ChatIcon className="size-[15px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] text-ink">{highlight(c.title, t)}</span>
                  {c.preview && <span className="block truncate text-[11.5px] text-faint">{c.preview}</span>}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** Accent-highlight the matched substring in a title. */
function highlight(text: string, term: string) {
  if (!term) return text
  const i = text.toLowerCase().indexOf(term)
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-transparent font-medium text-accent">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  )
}
