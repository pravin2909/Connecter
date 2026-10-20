import { type Run } from '../../lib/api'
import { useUI } from '../../store'
import { BrowserIcon, CloseIcon } from '../icons'
import { Checklist } from './RunBlock'

/** Right-hand panel: the agent's live browser view (only when it's actually browsing) and
 *  the current run's activity. Documents and Connected tools live in the Settings menu. */
export function SidePanel({ title, latestRun }: { title: string; latestRun: Run | undefined }) {
  const { panelOpen, setPanelOpen, screenshots } = useUI()
  const screenshot = latestRun ? screenshots[latestRun.id] : undefined
  const running = latestRun?.status === 'running' || latestRun?.status === 'pending'

  return (
    <aside
      className={`shrink-0 overflow-hidden bg-bg2 transition-[width,border-color] duration-200 max-[900px]:fixed max-[900px]:top-0 max-[900px]:right-0 max-[900px]:z-60 max-[900px]:h-screen ${
        panelOpen
          ? 'w-[320px] border-l border-line max-[900px]:shadow-[-20px_0_40px_rgba(0,0,0,.4)]'
          : 'w-0 border-l border-transparent'
      }`}
    >
      <div className="h-screen w-[320px] overflow-y-auto p-[18px]">
        <div className="mb-4 flex items-center justify-between">
          <span className="truncate text-[13px] font-medium text-ink">{title}</span>
          <button
            title="Close"
            onClick={() => setPanelOpen(false)}
            className="flex size-[26px] items-center justify-center rounded-[7px] text-faint hover:bg-panel hover:text-ink"
          >
            <CloseIcon className="size-3.5" />
          </button>
        </div>

        <div className="mb-2 text-[11px] font-medium tracking-wide text-faint uppercase">Browser</div>
        {screenshot ? (
          <>
            <a
              href={screenshot}
              target="_blank"
              rel="noreferrer"
              className="block overflow-hidden rounded-[14px] border border-line"
            >
              <img src={screenshot} alt="Agent's browser" className="max-h-[320px] w-full object-cover object-top" />
            </a>
            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-faint">
              {running && <span className="size-1.5 animate-pulse rounded-full bg-approve" />}
              {running ? "Live view of the agent's browser" : 'Last browser view'}
            </div>
          </>
        ) : (
          <div className="flex h-[108px] flex-col items-center justify-center gap-2 rounded-[14px] bg-bg2 text-faint">
            <span className="flex size-9 items-center justify-center rounded-full bg-panel text-muted">
              <BrowserIcon className="size-[18px]" />
            </span>
            <span className="text-[11.5px]">No browser activity yet</span>
          </div>
        )}

        {latestRun && latestRun.steps.length > 0 && (
          <div className="mt-6">
            <div className="mb-2.5 text-[11px] font-medium tracking-wide text-faint uppercase">Activity</div>
            <Checklist steps={latestRun.steps} defaultExpanded />
          </div>
        )}
      </div>
    </aside>
  )
}
