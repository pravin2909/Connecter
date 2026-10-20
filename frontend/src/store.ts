import { create } from 'zustand'

export type Theme = 'dark' | 'light'

/** Read the theme the no-flash script in index.html already applied to <html>. */
function initialTheme(): Theme {
  if (typeof document !== 'undefined' && document.documentElement.dataset.theme === 'light') return 'light'
  return 'dark'
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem('connecter-theme', theme)
  } catch {
    /* private mode / storage blocked — the in-memory value still works */
  }
}

interface UIState {
  view: 'home' | 'chat'
  conversationId: string | null
  panelOpen: boolean
  sidebarExpanded: boolean
  theme: Theme
  /** Latest browser screenshot per run, from `screenshot` SSE events. */
  screenshots: Record<string, string>
  /** Live answer text per run, accumulated from `token` SSE events while it streams. */
  streams: Record<string, string>
  /** Suggested follow-up questions per conversation, from the `suggestions` SSE event. */
  suggestions: Record<string, string[]>
  /** Whether the chat-search command palette is open. */
  searchOpen: boolean
  /** Whether the settings modal is open. */
  settingsOpen: boolean
  openChat: (conversationId?: string | null) => void
  openHome: () => void
  selectConversation: (id: string | null) => void
  setPanelOpen: (open: boolean) => void
  toggleSidebar: () => void
  setSidebarExpanded: (open: boolean) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setScreenshot: (runId: string, url: string) => void
  appendToken: (runId: string, text: string) => void
  clearStream: (runId: string) => void
  setSuggestions: (conversationId: string, items: string[]) => void
  clearSuggestions: (conversationId: string) => void
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
}

const wide = typeof window === 'undefined' || window.innerWidth > 900

export const useUI = create<UIState>((set) => ({
  view: 'home',
  conversationId: null,
  // The agent "screen" panel is closed by default (no second sidebar); it opens on demand
  // via the topbar toggle, and auto-opens when the agent uses the browser (see setScreenshot).
  panelOpen: false,
  sidebarExpanded: wide,
  theme: initialTheme(),
  screenshots: {},
  streams: {},
  suggestions: {},
  searchOpen: false,
  settingsOpen: false,
  openChat: (conversationId) =>
    set((s) => ({ view: 'chat', conversationId: conversationId === undefined ? s.conversationId : conversationId })),
  openHome: () => set({ view: 'home' }),
  selectConversation: (id) => set({ conversationId: id }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  toggleSidebar: () => set((s) => ({ sidebarExpanded: !s.sidebarExpanded })),
  setSidebarExpanded: (open) => set({ sidebarExpanded: open }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === 'dark' ? 'light' : 'dark'
      applyTheme(theme)
      return { theme }
    }),
  // Auto-open the screen panel when the agent produces a browser screenshot.
  setScreenshot: (runId, url) =>
    set((s) => ({ screenshots: { ...s.screenshots, [runId]: url }, panelOpen: true })),
  appendToken: (runId, text) =>
    set((s) => ({ streams: { ...s.streams, [runId]: (s.streams[runId] ?? '') + text } })),
  clearStream: (runId) =>
    set((s) => {
      if (!(runId in s.streams)) return s
      const { [runId]: _, ...rest } = s.streams
      return { streams: rest }
    }),
  setSuggestions: (conversationId, items) =>
    set((s) => ({ suggestions: { ...s.suggestions, [conversationId]: items } })),
  clearSuggestions: (conversationId) =>
    set((s) => {
      if (!(conversationId in s.suggestions)) return s
      const { [conversationId]: _, ...rest } = s.suggestions
      return { suggestions: rest }
    }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
}))
