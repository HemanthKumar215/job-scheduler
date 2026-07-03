import React, { useState } from 'react'

interface AuthPageProps {
  onLogin: (token: string, user: any, memberships: any[]) => void
}

export default function AuthPage({ onLogin }: AuthPageProps) {
  const [isLogin, setIsLogin] = useState(true)
  const [email, setEmail] = useState('owner@example.com')
  const [password, setPassword] = useState('password123')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/signup'
    const body = isLogin 
      ? { email, password }
      : { email, password, firstName, lastName, orgName }

    try {
      const res = await fetch(`http://localhost:3000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed. Please check your credentials.')
      }

      // Successful Auth
      if (isLogin) {
        onLogin(data.token, data.user, data.memberships)
      } else {
        // Sign up automatically logs in, mock memberships array format from response
        const mockMemberships = [{
          role: 'OWNER',
          organization: {
            id: data.organization.id,
            name: data.organization.name,
            projects: [data.project]
          }
        }]
        onLogin(data.token, data.user, mockMemberships)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 relative overflow-hidden">
      {/* Decorative Background Gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-purple-900/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-blue-900/20 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-slate-900/40 backdrop-blur-xl border border-slate-800/80 rounded-2xl p-8 shadow-2xl relative z-10 transition-all duration-300">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 text-purple-400 mb-3">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-violet-400 to-blue-400 bg-clip-text text-transparent">
            AETHER SCHEDULER
          </h1>
          <p className="text-sm text-slate-400 mt-1">Distributed Job Scheduler Platform</p>
        </div>

        {/* Tab Selector */}
        <div className="grid grid-cols-2 p-1 bg-slate-950/60 rounded-lg border border-slate-800/60 mb-6">
          <button
            onClick={() => { setIsLogin(true); setError(''); }}
            className={`py-2 text-sm font-medium rounded-md transition-all ${isLogin ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Sign In
          </button>
          <button
            onClick={() => { setIsLogin(false); setError(''); }}
            className={`py-2 text-sm font-medium rounded-md transition-all ${!isLogin ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/20' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Sign Up
          </button>
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-500/30 rounded-lg p-3 text-sm text-red-300 mb-6 flex items-start space-x-2">
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">First Name</label>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="John"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Last Name</label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                  placeholder="Doe"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="name@company.com"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
              placeholder="••••••••"
            />
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Organization Name</label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="w-full bg-slate-950/60 border border-slate-800/80 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500 transition-colors"
                placeholder="Acme Corp (Optional)"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white font-medium py-2 rounded-lg transition-colors mt-6 flex items-center justify-center space-x-2 disabled:opacity-50"
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <span>{isLogin ? 'Sign In' : 'Create Account'}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
