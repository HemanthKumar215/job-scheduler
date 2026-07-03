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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex relative overflow-hidden">
      {/* Background radial effects */}
      <div className="absolute top-[-30%] left-[-30%] w-[80%] h-[80%] rounded-full bg-purple-900/10 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-[-30%] right-[-30%] w-[80%] h-[80%] rounded-full bg-blue-900/10 blur-[150px] pointer-events-none" />

      {/* Navigation Sidebar */}
      <aside className="w-64 border-r border-slate-900 bg-slate-950/40 backdrop-blur-md flex flex-col justify-between p-6 relative z-10">
        <div className="space-y-8">
          {/* Logo brand */}
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-900/30">
              <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-wider text-slate-100">AETHER</h1>
              <span className="text-[9px] text-slate-500 uppercase tracking-widest font-semibold">Scheduler Platform</span>
            </div>
          </div>

          {/* Project Selector Dropdown */}
          {memberships.length > 0 && (
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Workspace</label>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-purple-600 cursor-pointer"
              >
                {memberships.map((m) =>
                  m.organization.projects.map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {m.organization.name} - {p.name}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}

          {/* Sidebar Menu Links */}
          <nav className="space-y-1.5">
            <span className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Menu</span>
            <button
              onClick={() => setActiveView('dashboard')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeView === 'dashboard'
                  ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300 shadow-md shadow-purple-900/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30 border border-transparent'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4zM14 16a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2v-4z" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setActiveView('explorer')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeView === 'explorer'
                  ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300 shadow-md shadow-purple-900/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30 border border-transparent'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Job Explorer</span>
            </button>

            <button
              onClick={() => setActiveView('queues')}
              className={`w-full flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-xs font-semibold tracking-wide transition-all ${
                activeView === 'queues'
                  ? 'bg-purple-600/10 border border-purple-500/20 text-purple-300 shadow-md shadow-purple-900/5'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/30 border border-transparent'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <span>Queue Configs</span>
            </button>
          </nav>
        </div>

        {/* User Card & Logout */}
        <div className="border-t border-slate-900 pt-4 flex flex-col space-y-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-purple-300 border border-slate-700">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="overflow-hidden">
              <span className="block text-xs font-bold text-slate-200 truncate">{user.firstName} {user.lastName}</span>
              <span className="block text-[10px] text-slate-500 truncate">{user.email}</span>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-slate-900 hover:bg-slate-850 text-slate-400 hover:text-slate-200 text-xs font-semibold py-2 rounded-lg transition-colors border border-slate-800"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="flex-1 overflow-y-auto p-8 relative z-10">
        {!selectedProjectId ? (
          <div className="flex flex-col items-center justify-center h-full">
            <span className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mb-4" />
            <p className="text-slate-400 text-sm">Binding project workspace...</p>
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
