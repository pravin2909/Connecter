import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, ApiError } from '../lib/api'
import { keys } from '../lib/hooks'
import { Logo } from '../pages/Home'
import { useUI } from '../store'

type Mode = 'login' | 'register'

/** Sign-in / register card, shown over the landing page by App. */
export default function Login() {
  const qc = useQueryClient()
  const openHome = useUI((s) => s.openHome)
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')

  const submit = useMutation({
    mutationFn: () =>
      mode === 'login' ? api.login(email.trim(), password) : api.register(email.trim(), password, name.trim() || undefined),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user)
      qc.invalidateQueries({ queryKey: keys.me })
    },
  })

  const err = submit.error ? errMessage(submit.error) : null

  return (
    <div className="w-full max-w-[400px]" onClick={(e) => e.stopPropagation()}>
      <div className="mb-7 flex flex-col items-center gap-3.5 text-center">
        <Logo />
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] text-ink">Welcome to Connecter</h1>
          <p className="mt-2 font-mono text-[10.5px] tracking-[0.12em] text-muted uppercase">
            {mode === 'login' ? 'Sign in to continue' : 'Create an account to get started'}
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit.mutate()
        }}
        className="relative overflow-hidden rounded-2xl border border-line bg-bg2/70 p-6 shadow-[0_30px_80px_-28px_rgba(0,0,0,0.55)] backdrop-blur-2xl"
      >
        <Corners />
        <div className="flex flex-col gap-4">
          {mode === 'register' && (
            <Field label="Name">
              <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" className={inputCls} />
            </Field>
          )}
          <Field label="Email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={inputCls}
            />
          </Field>
          <Field label="Password">
            <input
              type="password"
              required
              minLength={mode === 'register' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              className={inputCls}
            />
          </Field>

          {err && <div className="text-[12.5px] text-danger">{err}</div>}

          <button
            type="submit"
            disabled={submit.isPending}
            className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-[10px] bg-accent font-mono text-[11.5px] font-semibold tracking-[0.12em] text-[#1b1409] uppercase transition hover:brightness-110 disabled:opacity-60"
          >
            {submit.isPending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </div>
      </form>

      <p className="mt-5 text-center text-[13px] text-muted">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button
          onClick={() => {
            setMode(mode === 'login' ? 'register' : 'login')
            submit.reset()
          }}
          className="font-medium text-accent hover:underline"
        >
          {mode === 'login' ? 'Sign up' : 'Sign in'}
        </button>
      </p>

      <button
        onClick={openHome}
        className="mx-auto mt-5 block font-mono text-[10.5px] tracking-[0.12em] text-faint uppercase transition hover:text-muted"
      >
        ← Back to home
      </button>
    </div>
  )
}

const inputCls =
  'w-full rounded-[10px] border border-line bg-bg/60 px-3 py-2.5 text-[14px] text-ink outline-none transition focus:border-accent-dim'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10.5px] tracking-[0.15em] text-faint uppercase">{label}</span>
      {children}
    </label>
  )
}

function Corners() {
  const base = 'pointer-events-none absolute size-2.5 border-accent'
  return (
    <>
      <span className={`${base} left-2 top-2 border-l border-t`} />
      <span className={`${base} right-2 top-2 border-r border-t`} />
      <span className={`${base} bottom-2 left-2 border-b border-l`} />
      <span className={`${base} bottom-2 right-2 border-b border-r`} />
    </>
  )
}

function errMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 422) return 'Please enter a valid email and a password of at least 8 characters.'
    return e.message
  }
  return 'Something went wrong. Please try again.'
}
