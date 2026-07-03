import { useState, useEffect } from 'react'
import AuthPage from './pages/AuthPage.js'
import Dashboard from './pages/Dashboard.js'
import JobExplorer from './pages/JobExplorer.js'
import QueueManager from './pages/QueueManager.js'

type View = 'dashboard' | 'explorer' | 'queues'

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<any | null>(JSON.parse(localStorage.getItem('user') || 'null'))
  const [memberships, setMemberships] = useState<any[]>(JSON.parse(localStorage.getItem('memberships') || '[]'))
  
  const [selectedProjectId, setSelectedProjectId] = useState<string>('')
  const [activeView, setActiveView] = useState<View>('dashboard')

  // Save auth info locally
  const handleLogin = (jwtToken: string, userData: any, userMemberships: any[]) => {
    localStorage.setItem('token', jwtToken)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.setItem('memberships', JSON.stringify(userMemberships))

    setToken(jwtToken)
    setUser(userData)
    setMemberships(userMemberships)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('memberships')

    setToken(null)
    setUser(null)
    setMemberships([])
    setSelectedProjectId('')
  }

  // Auto-select first project
  useEffect(() => {
    if (memberships.length > 0) {
      const firstOrg = memberships[0].organization
      if (firstOrg.projects && firstOrg.projects.length > 0) {
        setSelectedProjectId(firstOrg.projects[0].id)
      }
    }
  }, [memberships])

  if (!token || !user) {
    return <AuthPage onLogin={handleLogin} />
  }

  return (
    <div className="min-h-screen bg-[#0B0D12] text-[#F1F5F9] flex relative overflow-hidden font-sans">
      {/* Navigation Sidebar */}
      <aside className="w-64 border-r border-[#1F2430] bg-[#12151C] flex flex-col justify-between p-5 relative z-10">
        <div className="space-y-6">
          {/* Logo brand */}
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded bg-purple-600/25 border border-purple-500/40 flex items-center justify-center text-purple-400 font-mono font-bold text-sm">
              Æ
            </div>
            <div>
              <h1 className="text-xs font-bold tracking-wider text-slate-200 uppercase font-mono">Aether Platform</h1>
              <span className="text-[8px] text-slate-500 uppercase tracking-widest font-semibold font-mono">Distributed Ops v1.0</span>
            </div>
          </div>

          {/* Project Selector Dropdown */}
          {memberships.length > 0 && (
            <div className="space-y-1">
              <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">Active Workspace</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-purple-500/80 cursor-pointer"
              >
                {memberships.map((m) =>
                  m.organization.projects.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name.slice(0, 18)}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Sidebar Menu Links */}
          <nav className="space-y-1">
            <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-2 font-mono">Menu</span>
            <button
              onClick={() => setActiveView('dashboard')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded text-xs font-medium tracking-wide transition-all font-mono ${
                activeView === 'dashboard'
                  ? 'bg-purple-600/10 border border-purple-500/30 text-purple-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0B0D12]/60 border border-transparent'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveView('explorer')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded text-xs font-medium tracking-wide transition-all font-mono ${
                activeView === 'explorer'
                  ? 'bg-purple-600/10 border border-purple-500/30 text-purple-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0B0D12]/60 border border-transparent'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Job Explorer</span>
            </button>

            <button
              onClick={() => setActiveView('queues')}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded text-xs font-medium tracking-wide transition-all font-mono ${
                activeView === 'queues'
                  ? 'bg-purple-600/10 border border-purple-500/30 text-purple-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#0B0D12]/60 border border-transparent'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Queue Configs</span>
            </button>
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="border-t border-[#1F2430] pt-4 flex flex-col space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center text-xs font-mono font-bold text-slate-300 border border-[#1F2430]">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="overflow-hidden">
              <span className="block text-xs font-bold text-slate-350 truncate">{user.firstName} {user.lastName}</span>
              <span className="block text-[9px] text-slate-550 truncate font-mono">{user.email}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-[#0B0D12] hover:bg-[#12151C] text-slate-400 hover:text-slate-200 text-xs font-semibold py-1.5 rounded transition-colors border border-[#1F2430] font-mono cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 overflow-y-auto p-6 relative z-10">
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center h-full">
            <span className="w-8 h-8 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-xs font-mono">Binding project workspace...</p>
          </div>
        ) : (
          <>
            {activeView === 'dashboard' && <Dashboard token={token} projectId={selectedProjectId} />}
            {activeView === 'explorer' && <JobExplorer token={token} projectId={selectedProjectId} />}
            {activeView === 'queues' && <QueueManager token={token} projectId={selectedProjectId} />}
          </>
        )}
      </main>
    </div>
  )
}
