import { useEffect } from 'react'
import Login from './components/Login'
import { useMe } from './lib/hooks'
import Chat from './pages/Chat'
import Home from './pages/Home'
import { useUI } from './store'

export default function App() {
  const view = useUI((s) => s.view)
  const openHome = useUI((s) => s.openHome)
  const { data: user, isLoading } = useMe()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [view])

  // The landing page is public.
  if (view === 'home') return <Home />

  // The workspace requires a signed-in user.
  if (user) return <Chat />

  // Not signed in: show the auth card over the (blurred) landing page.
  return (
    <>
      <Home />
      <div
        className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-bg/45 p-4 backdrop-blur-xl"
        onClick={openHome}
      >
        {isLoading ? (
          <span className="size-5 animate-spin rounded-full border-2 border-line border-t-accent" />
        ) : (
          <Login />
        )}
      </div>
    </>
  )
}
