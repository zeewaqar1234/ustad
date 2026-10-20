import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'

export function Login() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const qc = useQueryClient()
  const nav = useNavigate()

  return (
    <form
      className="mx-auto flex max-w-md flex-col gap-3 p-4 pt-16"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await api('/auth/login', { password })
          await qc.invalidateQueries()
          nav('/')
        } catch (err) {
          setError((err as Error).message)
        }
      }}
    >
      <h1 className="text-3xl font-bold">Ustad</h1>
      <label className="text-sm" htmlFor="pw">
        Password
      </label>
      <input
        id="pw"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="rounded-lg border-2 border-neutral-900 p-3 text-lg"
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="rounded-lg bg-neutral-900 p-4 text-lg text-white">
        Log in
      </button>
    </form>
  )
}
