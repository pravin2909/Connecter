import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dock } from '../components/chat/Dock'
import { MessageBubble, StreamingBubble } from '../components/chat/MessageBubble'
import { Rail } from '../components/chat/Rail'
import { RunBlock } from '../components/chat/RunBlock'
import { SidePanel } from '../components/chat/SidePanel'
import { Topbar } from '../components/chat/Topbar'
import { ChatSearchModal } from '../components/chat/ChatSearchModal'
import { api, type ConversationDetail } from '../lib/api'
import { keys, useConversation, useRunEvents, useUploadDocument } from '../lib/hooks'
import { useUI } from '../store'

// Example prompts; a random few are shown on the empty screen.
const PROMPT_POOL = [
  'According to my project report, what database did I use?',
  'Find the latest news about the Model Context Protocol and summarise it',
  'List the files in my workspace',
  'Summarise my latest document in five bullet points',
  'Find good coffee shops near me',
  'Show me photos of the Taj Mahal',
  'What are the top tech news stories today?',
  'Create an Excel sheet of a weekly study plan',
  'Research the latest LangGraph features and compare them',
  'Open YouTube and search for lofi beats',
  "Draft an email to my team about this week's progress",
  'Read my project report and write a short summary to reports/summary.md',
]

function pickExamples(n: number): string[] {
  return [...PROMPT_POOL].sort(() => Math.random() - 0.5).slice(0, n)
}

export default function Chat() {
  const { conversationId, selectConversation } = useUI()
  const { data: detail } = useConversation(conversationId)
  const qc = useQueryClient()
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [sendError, setSendError] = useState<string | null>(null)
  const upload = useUploadDocument()
  const clearSuggestions = useUI((s) => s.clearSuggestions)

  const attach = (f: File) => {
    const id = `${Date.now()}-${f.name}`
    setAttachments((a) => [...a, { id, name: f.name, status: 'uploading' }])
    const set = (patch: Partial<Attachment>) =>
      setAttachments((a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
    upload.mutate(f, {
      onSuccess: (d) => set({ status: d.status === 'ready' ? 'ready' : 'indexing' }),
      onError: (e) => set({ status: 'error', detail: (e as Error).message }),
    })
  }

  // Entering the workspace, or clicking "New chat", lands on an empty compose — the chat is
  // only created in the DB when the first message is sent (no duplicate empty "New chat"s).
  useEffect(() => {
    setAttachments([])
    setSendError(null)
  }, [conversationId])

  const latestRun = detail?.runs.at(-1)
  const liveRun = latestRun && ['pending', 'running'].includes(latestRun.status) ? latestRun : undefined
  const busy = !!latestRun && ['pending', 'running', 'awaiting_approval'].includes(latestRun.status)
  useRunEvents(conversationId, liveRun?.id ?? null, !!liveRun)

  const send = useMutation({
    mutationFn: async (text: string) => {
      let id = conversationId
      if (!id) {
        id = (await api.createConversation()).id
        selectConversation(id)
      }
      return api.send(id, text)
    },
    onMutate: () => {
      setSendError(null)
      if (conversationId) clearSuggestions(conversationId)
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: keys.conversation(res.run.conversation_id) })
      qc.invalidateQueries({ queryKey: keys.conversations })
    },
    onError: (e: Error) => setSendError(e.message),
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelRun(latestRun!.id),
    onSettled: () => conversationId && qc.invalidateQueries({ queryKey: keys.conversation(conversationId) }),
  })

  // Enter indexes any attached documents, then sends the message (if any).
  const handleSend = (text: string, files: File[]) => {
    files.forEach(attach)
    if (text) send.mutate(text)
  }

  const title = detail?.conversation.title ?? 'Connecter'

  return (
    <section className="h-screen overflow-hidden">
      <div className="flex h-screen">
        <Rail />
        <div className="flex h-screen min-w-0 flex-1 flex-col">
          <Topbar conversation={detail?.conversation} />
          <Thread
            detail={detail}
            liveRunId={liveRun?.id ?? null}
            busy={busy}
            attachments={attachments}
            error={sendError}
            onSuggestion={(s) => send.mutate(s)}
          />
          <Dock
            placeholder="Message Connecter…"
            busy={busy}
            disabled={send.isPending}
            onSend={handleSend}
            onStop={() => cancel.mutate()}
          />
        </div>
        <SidePanel title={title} latestRun={latestRun} />
      </div>
      <ChatSearchModal />
    </section>
  )
}

function Thread({
  detail,
  liveRunId,
  busy,
  attachments,
  error,
  onSuggestion,
}: {
  detail: ConversationDetail | undefined
  liveRunId: string | null
  busy: boolean
  attachments: Attachment[]
  error: string | null
  onSuggestion: (s: string) => void
}) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const runs = useMemo(() => new Map(detail?.runs.map((r) => [r.id, r]) ?? []), [detail])
  const stream = useUI((s) => (liveRunId ? s.streams[liveRunId] : undefined))
  const convoId = detail?.conversation.id
  const suggestions = useUI((s) => (convoId ? s.suggestions[convoId] : undefined))
  const examples = useMemo(() => pickExamples(4), [convoId])
  const signature = JSON.stringify([
    detail?.messages.length,
    detail?.runs.map((r) => [r.status, r.steps.length, r.approvals.length]),
    attachments.map((a) => a.status).join(),
    stream?.length ?? 0,
  ])

  // Track whether the user is parked near the bottom; only auto-scroll if so, and use an
  // instant jump while tokens stream (smooth scroll on every token is what felt janky).
  const onScroll = () => {
    const el = scrollerRef.current
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }
  useEffect(() => {
    if (stick.current) bottomRef.current?.scrollIntoView({ behavior: stream ? 'auto' : 'smooth', block: 'end' })
  }, [signature, stream])

  const empty = !detail || detail.messages.length === 0

  return (
    <div ref={scrollerRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-[26px] pt-7 pb-2.5">
      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        {empty && (
          <div className="mt-[8vh] flex flex-col items-center text-center">
            <h2 className="font-display text-3xl font-semibold tracking-[-0.03em]">
              What should <span className="text-accent">Connecter</span> do?
            </h2>
            <p className="mt-3 max-w-md text-sm text-muted">
              Ask about your documents, research the web, work with files and email, or drive the browser. Anything
              consequential waits for your approval.
            </p>
            <div className="mt-7 grid w-full gap-2.5 sm:grid-cols-2">
              {examples.map((s) => (
                <button
                  key={s}
                  onClick={() => onSuggestion(s)}
                  className="rounded-[14px] border border-line bg-panel px-4 py-3 text-left text-[13.5px] text-muted transition hover:border-faint hover:text-ink"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {detail?.messages.map((m) => {
          const run = m.role === 'user' && m.agent_run_id ? runs.get(m.agent_run_id) : undefined
          return (
            <div key={m.id} className="contents">
              <MessageBubble message={m} />
              {run && <RunBlock run={run} />}
            </div>
          )
        })}
        {stream && <StreamingBubble text={stream} />}
        {!busy && !stream && suggestions && suggestions.length > 0 && (
          <div className="flex flex-col items-start gap-1.5 self-stretch">
            {suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onSuggestion(s)}
                className="rounded-full border border-line bg-panel px-3.5 py-1.5 text-left text-[13px] text-muted transition hover:border-accent-dim hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {attachments.length > 0 && (
          <div className="flex flex-col items-end gap-2 self-stretch">
            {attachments.map((a) => (
              <AttachmentChip key={a.id} a={a} />
            ))}
          </div>
        )}
        {error && <div className="self-center text-[12.5px] text-danger">{error}</div>}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

interface Attachment {
  id: string
  name: string
  status: 'uploading' | 'indexing' | 'ready' | 'error'
  detail?: string
}

function AttachmentChip({ a }: { a: Attachment }) {
  const ext = (a.name.split('.').pop() ?? '').toUpperCase().slice(0, 4)
  const sub =
    a.status === 'uploading'
      ? 'Uploading…'
      : a.status === 'indexing'
        ? 'Added · indexing for search'
        : a.status === 'ready'
          ? 'Added to your documents'
          : a.detail || 'Upload failed'
  return (
    <div className="flex max-w-[82%] items-center gap-2.5 rounded-[14px] border border-line bg-panel px-3 py-2.5">
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-[9px] font-mono text-[9px] font-semibold text-white ${
          a.status === 'error' ? 'bg-danger' : 'bg-accent-dim'
        }`}
      >
        {ext || 'DOC'}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-medium text-ink">{a.name}</span>
        <span className={`block text-[11.5px] ${a.status === 'error' ? 'text-danger' : 'text-faint'}`}>
          {a.status === 'uploading' || a.status === 'indexing' ? '⟳ ' : ''}
          {sub}
        </span>
      </span>
    </div>
  )
}
