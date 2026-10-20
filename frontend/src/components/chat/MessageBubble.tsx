import { useRef, useState } from 'react'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { Citation, Message } from '../../lib/api'

/** Rehype plugin: turn inline `[n]` markers in body text into <cite data-n> elements so
 *  they can render as interactive citation chips. Code/pre spans are left untouched. */
function rehypeCitations() {
  const walk = (node: any) => {
    if (!node.children || node.tagName === 'code' || node.tagName === 'pre') return
    const out: any[] = []
    for (const child of node.children) {
      if (child.type === 'text' && /\[\d+\]/.test(child.value)) {
        const re = /\[(\d+)\]/g
        let last = 0
        let m: RegExpExecArray | null
        while ((m = re.exec(child.value))) {
          if (m.index > last) out.push({ type: 'text', value: child.value.slice(last, m.index) })
          out.push({ type: 'element', tagName: 'cite', properties: { dataN: m[1] }, children: [] })
          last = m.index + m[0].length
        }
        if (last < child.value.length) out.push({ type: 'text', value: child.value.slice(last) })
      } else {
        walk(child)
        out.push(child)
      }
    }
    node.children = out
  }
  return (tree: any) => walk(tree)
}

const assistantBubble = 'max-w-full self-stretch text-[14.5px] leading-[1.6] text-ink'

// Small models sometimes emit raw HTML (e.g. <br> inside a table cell) which our Markdown
// renderer would otherwise show literally. Convert <br> to a line break and drop other
// stray inline tags so the answer stays clean Markdown.
function cleanMarkdown(text: string): string {
  // Replace <br> with a space (a newline would split a Markdown table row), and drop other
  // stray inline tags. The prompt tells the model to avoid HTML; this is the safety net.
  return text
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(?:b|strong|i|em|u|s|div|span|p|ul|ol|li|h[1-6]|font)\b[^>]*>/gi, '')
}

function buildComponents(citations: Citation[]) {
  const byN = new Map(citations.map((c) => [c.n, c]))
  return {
    // Open external links in a new tab so clicking one never navigates away from the app.
    a: ({ node, ...props }: any) => <a {...props} target="_blank" rel="noreferrer noopener" />,
    img: ({ node, ...props }: any) => (
      <img {...props} loading="lazy" className="my-2 max-h-56 rounded-lg border border-line object-cover" />
    ),
    cite: ({ node }: any) => <CitationRef n={Number(node?.properties?.dataN)} citation={byN.get(Number(node?.properties?.dataN))} />,
    pre: (props: any) => <CodeBlock {...props} />,
  }
}

const REHYPE = [rehypeCitations, [rehypeHighlight, { detect: true, ignoreMissing: true }]] as any

/** A code block with its language label and a copy button (syntax colors via rehype-highlight). */
function CodeBlock({ node, children }: any) {
  const ref = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)
  const codeNode = node?.children?.find((c: any) => c.tagName === 'code')
  const cls: string = (codeNode?.properties?.className ?? []).join(' ')
  const lang = (cls.match(/language-([\w-]+)/)?.[1] ?? 'text').replace(/^language-/, '')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ref.current?.innerText ?? '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="code-block my-3 overflow-hidden rounded-[10px] border border-line bg-[var(--color-elevated)]">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] lowercase text-faint">{lang}</span>
        <button onClick={copy} className="flex items-center gap-1 font-mono text-[11px] text-muted transition hover:text-ink">
          {copied ? '✓ copied' : 'copy'}
        </button>
      </div>
      <pre ref={ref} className="!m-0 !border-0 !bg-transparent overflow-x-auto px-3.5 py-3 text-[12.5px] leading-relaxed">
        {children}
      </pre>
    </div>
  )
}

export function MessageBubble({ message }: { message: Message }) {
  if (message.role === 'user') {
    return (
      <div className="max-w-[80%] self-end rounded-[20px] bg-panel px-4 py-2.5 text-[14.5px] leading-[1.6] whitespace-pre-wrap text-ink max-md:max-w-[88%]">
        {message.content}
      </div>
    )
  }
  return (
    <div className={assistantBubble}>
      <div className="md">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={REHYPE} components={buildComponents(message.citations)}>
          {cleanMarkdown(message.content)}
        </Markdown>
      </div>
      {message.citations.length > 0 && <Sources citations={message.citations} />}
    </div>
  )
}

/** The assistant's answer as it streams in, before it is persisted as a Message. */
export function StreamingBubble({ text }: { text: string }) {
  return (
    <div className={assistantBubble}>
      <div className="md">
        <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={REHYPE} components={buildComponents([])}>
          {cleanMarkdown(text)}
        </Markdown>
      </div>
      <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[2px] animate-blink bg-accent align-middle" />
    </div>
  )
}

/** An inline `[n]` citation marker. On hover it shows a card with the cited source. */
function CitationRef({ n, citation }: { n: number; citation?: Citation }) {
  if (!n) return null
  return (
    <span className="group relative inline-block align-baseline">
      <sup className="cursor-default rounded-[4px] bg-bg2 px-[3px] font-mono text-[0.68em] font-medium text-accent">{n}</sup>
      {citation && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-64 -translate-x-1/2 rounded-lg border border-line bg-panel p-2.5 text-left shadow-lg group-hover:block">
          <span className="block truncate text-[12px] font-medium text-ink">{citation.document}</span>
          <span className="mt-0.5 block text-[11px] text-faint">
            {[citation.page && `Page ${citation.page}`, citation.section].filter(Boolean).join(' · ')}
          </span>
          <span className="mt-1 block max-h-24 overflow-hidden text-[12px] leading-snug text-muted">{citation.snippet}…</span>
        </span>
      )}
    </span>
  )
}

function Sources({ citations }: { citations: Citation[] }) {
  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <div className="mb-1.5 text-xs font-medium text-muted">Sources</div>
      <div className="flex flex-col gap-1.5">
        {citations.map((c) => (
          <details key={c.n} className="group rounded-lg bg-bg2 px-2.5 py-1.5 text-[12.5px]">
            <summary className="flex cursor-pointer list-none items-baseline gap-2">
              <span className="font-mono text-accent">[{c.n}]</span>
              <span className="truncate text-ink">{c.document}</span>
              <span className="ml-auto shrink-0 text-faint">
                {[c.page && `Page ${c.page}`, c.section].filter(Boolean).join(' · ')}
              </span>
            </summary>
            <p className="mt-1.5 whitespace-pre-wrap text-muted">{c.snippet}…</p>
          </details>
        ))}
      </div>
    </div>
  )
}
