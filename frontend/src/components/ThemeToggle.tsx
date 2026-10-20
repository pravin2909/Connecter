import { useUI } from '../store'
import { MoonIcon, SunIcon } from './icons'

/** Segmented Dark / Light control bound to the global theme. */
export function ThemeToggle() {
  const theme = useUI((s) => s.theme)
  const setTheme = useUI((s) => s.setTheme)
  const opts = [
    { key: 'dark' as const, label: 'Dark', Icon: MoonIcon },
    { key: 'light' as const, label: 'Light', Icon: SunIcon },
  ]
  return (
    <div className="inline-flex gap-0.5 rounded-full border border-line bg-bg2 p-0.5">
      {opts.map(({ key, label, Icon }) => {
        const on = theme === key
        return (
          <button
            key={key}
            onClick={() => setTheme(key)}
            title={label}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition ${
              on ? 'bg-accent text-ink-dark' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon className="size-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
