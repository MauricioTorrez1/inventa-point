import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type Modo = 'login' | 'registro'

export function LoginPage() {
  const [modo, setModo] = useState<Modo>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function manejarSubmit(e: React.FormEvent) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    setMensaje(null)

    if (modo === 'registro') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(traducirError(error.message))
      else
        setMensaje(
          'Cuenta creada. Si tu proyecto exige confirmación por correo, ' +
            'revisa tu bandeja. Si no, ya puedes iniciar sesión.',
        )
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(traducirError(error.message))
      // Si el login es exitoso, AuthProvider reacciona y cambia de pantalla.
    }
    setCargando(false)
  }

  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-xl dark:bg-slate-900">
        <h1 className="mb-1 text-2xl font-bold">Inventa Point</h1>
        <p className="mb-6 text-sm text-slate-500">
          {modo === 'login' ? 'Inicia sesión' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={manejarSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium">Correo</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Contraseña</label>
            <input
              type="password"
              required
              minLength={6}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-transparent px-4 py-3 outline-none focus:border-accent dark:border-slate-700"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {mensaje && <p className="text-sm text-green-600">{mensaje}</p>}

          <button type="submit" disabled={cargando} className="btn-accent w-full disabled:opacity-60">
            {cargando ? 'Procesando…' : modo === 'login' ? 'Entrar' : 'Registrarme'}
          </button>
        </form>

        <button
          onClick={() => {
            setModo(modo === 'login' ? 'registro' : 'login')
            setError(null)
            setMensaje(null)
          }}
          className="mt-5 w-full text-center text-sm text-accent"
        >
          {modo === 'login'
            ? '¿No tienes cuenta? Regístrate'
            : '¿Ya tienes cuenta? Inicia sesión'}
        </button>
      </div>
    </div>
  )
}

function traducirError(msg: string): string {
  if (msg.includes('Invalid login credentials')) return 'Correo o contraseña incorrectos.'
  if (msg.includes('already registered')) return 'Ese correo ya está registrado.'
  if (msg.includes('Password should be')) return 'La contraseña debe tener al menos 6 caracteres.'
  return msg
}
