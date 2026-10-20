import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useUI } from '../store'
import { api, type ConversationDetail, type Step } from './api'

export const keys = {
  me: ['me'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversation', id] as const,
  documents: ['documents'] as const,
  health: ['health'] as const,
  tools: ['tools'] as const,
}

export function useMe() {
  // A 401 is a normal "not signed in" answer, not an error to retry.
  return useQuery({ queryKey: keys.me, queryFn: api.me, retry: false, staleTime: 60_000 })
}

export function useConversations() {
  return useQuery({ queryKey: keys.conversations, queryFn: api.conversations })
}

export function useConversation(id: string | null) {
  return useQuery({
    queryKey: keys.conversation(id ?? ''),
    queryFn: () => api.conversation(id!),
    enabled: !!id,
  })
}

export function useDocuments() {
  return useQuery({
    queryKey: keys.documents,
    queryFn: api.documents,
    // Poll while anything is still being indexed.
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === 'queued' || d.status === 'processing') ? 1500 : false),
  })
}

export function useHealth() {
  return useQuery({ queryKey: keys.health, queryFn: api.health, refetchInterval: 20_000 })
}

export function useTools() {
  return useQuery({ queryKey: keys.tools, queryFn: api.tools, refetchInterval: 30_000 })
}

export function useUploadDocument() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: api.uploadDocument,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.documents }),
  })
}

/**
 * Subscribes to a run's Server-Sent Events while it is running and folds them into the
 * cached conversation, so the thread and activity panel update live.
 */
export function useRunEvents(conversationId: string | null, runId: string | null, running: boolean) {
  const qc = useQueryClient()
  const setScreenshot = useUI((s) => s.setScreenshot)
  const appendToken = useUI((s) => s.appendToken)
  const clearStream = useUI((s) => s.clearStream)
  const setSuggestions = useUI((s) => s.setSuggestions)

  useEffect(() => {
    if (!conversationId || !runId || !running) return
    const key = keys.conversation(conversationId)
    const es = new EventSource(`/api/runs/${runId}/events`)

    const patchRun = (fn: (steps: Step[]) => Step[]) =>
      qc.setQueryData<ConversationDetail>(key, (d) =>
        d && { ...d, runs: d.runs.map((r) => (r.id === runId ? { ...r, steps: fn(r.steps) } : r)) },
      )
    const refresh = () => {
      qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: keys.conversations })
    }

    es.addEventListener('step', (e) => {
      const { step } = JSON.parse((e as MessageEvent).data) as { step: Step }
      patchRun((steps) => {
        const i = steps.findIndex((s) => s.seq === step.seq)
        if (i === -1) return [...steps, step]
        const next = [...steps]
        next[i] = { ...next[i], ...step, detail: { ...(next[i].detail ?? {}), ...(step.detail ?? {}) } }
        return next
      })
    })
    es.addEventListener('screenshot', (e) => {
      const { url } = JSON.parse((e as MessageEvent).data) as { url: string }
      setScreenshot(runId, url)
    })
    // Live answer streaming: accumulate tokens, and drop them when the turn becomes a tool
    // call (answer_reset) or when the final persisted message arrives.
    es.addEventListener('token', (e) => {
      const { text } = JSON.parse((e as MessageEvent).data) as { text: string }
      appendToken(runId, text)
    })
    es.addEventListener('answer_reset', () => clearStream(runId))
    es.addEventListener('message', () => {
      clearStream(runId)
      refresh()
    })
    es.addEventListener('suggestions', (e) => {
      const { items } = JSON.parse((e as MessageEvent).data) as { items: string[] }
      setSuggestions(conversationId, items)
    })
    for (const type of ['approval_required', 'error']) es.addEventListener(type, refresh)
    es.addEventListener('done', () => {
      es.close()
      clearStream(runId)
      refresh()
    })
    return () => es.close()
  }, [conversationId, runId, running, qc, setScreenshot, appendToken, clearStream, setSuggestions])
}
