import { useEffect, useRef, useState } from 'react'
import { MicIcon, SendIcon, StopIcon } from '../icons'

// Minimal typing for the (prefixed) Web Speech API.
type Recognition = {
  continuous: boolean
  interimResults: boolean
  onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void
  onend: () => void
  start: () => void
  stop: () => void
}
const SpeechRecognition: (new () => Recognition) | undefined =
  (window as unknown as Record<string, new () => Recognition>).SpeechRecognition ??
  (window as unknown as Record<string, new () => Recognition>).webkitSpeechRecognition

export function Dock({
  placeholder,
  busy,
  disabled,
  onSend,
  onStop,
}: {
  placeholder: string
  busy: boolean
  disabled?: boolean
  onSend: (text: string, files: File[]) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState<File[]>([])
  const [recording, setRecording] = useState(false)
  const recRef = useRef<Recognition | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => () => recRef.current?.stop(), [])

  const submit = () => {
    const t = text.trim()
    if ((!t && pending.length === 0) || busy || disabled) return
    onSend(t, pending)
    setText('')
    setPending([])
  }

  const toggleMic = () => {
    if (!SpeechRecognition) {
      alert('Voice input is not supported in this browser (try Chrome or Safari).')
      return
    }
    if (recording) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRecognition()
    rec.continuous = false
    rec.interimResults = true
    const prefix = text ? text + ' ' : ''
    rec.onresult = (e) => setText(prefix + Array.from(e.results).map((r) => r[0].transcript).join(''))
    rec.onend = () => setRecording(false)
    recRef.current = rec
    rec.start()
    setRecording(true)
    inputRef.current?.focus()
  }

  const action = busy ? 'stop' : text.trim() || pending.length ? 'send' : 'mic'

  return (
    <div className="shrink-0 px-[26px] pt-3.5 pb-[22px]">
      <div
        className={`mx-auto flex max-w-[760px] flex-col gap-2 border border-line bg-panel py-2 pr-[9px] pl-3 focus-within:border-accent-dim ${
          pending.length ? 'rounded-[22px]' : 'rounded-full'
        }`}
      >
        {pending.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {pending.map((f, i) => (
              <span key={i} className="flex items-center gap-2 rounded-[10px] bg-bg2 px-2.5 py-1.5 text-[12px]">
                <span className="max-w-[200px] truncate text-ink">{f.name}</span>
                <button
                  title="Remove"
                  onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                  className="text-faint transition hover:text-danger"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <button
            title="Attach a document (PDF, Word, text, CSV…) — indexed when you send"
            onClick={() => fileRef.current?.click()}
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-panel-strong text-muted transition hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05 12.25 20.24a5.5 5.5 0 0 1-7.78-7.78l9.19-9.19a3.5 3.5 0 0 1 4.95 4.95l-9.2 9.19a1.5 1.5 0 0 1-2.12-2.12l8.49-8.49" />
            </svg>
          </button>
          <input
            ref={fileRef}
            type="file"
            hidden
            accept=".pdf,.docx,.txt,.csv,.md,.markdown,.json"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) setPending((p) => [...p, f])
              e.target.value = ''
            }}
          />
          <input
            ref={inputRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && submit()}
            placeholder={recording ? 'Listening…' : placeholder}
            disabled={disabled}
            className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
          />
          <button
            title={action === 'stop' ? 'Stop run' : action === 'send' ? 'Send' : 'Voice input'}
            onClick={action === 'stop' ? onStop : action === 'send' ? submit : toggleMic}
            className={`flex size-9 shrink-0 items-center justify-center rounded-full text-ink-dark transition ${
              recording ? 'bg-accent' : 'bg-ink'
            }`}
          >
            {action === 'stop' ? <StopIcon className="size-3.5" /> : action === 'send' ? <SendIcon className="size-[15px]" /> : <MicIcon className="size-[15px]" />}
          </button>
        </div>
      </div>
    </div>
  )
}
