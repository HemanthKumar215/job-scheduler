import React, { useState, useEffect } from 'react'

interface QueueManagerProps {
  token: string
  projectId: string
}

interface RetryPolicy {
  id: string
  name: string
  strategy: string
  baseDelay: number
  maxRetries: number
  maxDelay: number
}

interface Queue {
  id: string
  name: string
  priority: number
  concurrencyLimit: number
  status: string
  retryPolicyId: string
  retryPolicy: RetryPolicy
}

export default function QueueManager({ token, projectId }: QueueManagerProps) {
  const [queues, setQueues] = useState<Queue[]>([])
  const [policies, setPolicies] = useState<RetryPolicy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Modal / Edit state
  const [editingQueue, setEditingQueue] = useState<Queue | null>(null)
  const [priority, setPriority] = useState(5)
  const [concurrency, setConcurrency] = useState(10)
  const [policyId, setPolicyId] = useState('')
  const [queueStatus, setQueueStatus] = useState('ACTIVE')
  const [saving, setSaving] = useState(false)

  // Create queue state
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPriority, setNewPriority] = useState(5)
  const [newConcurrency, setNewConcurrency] = useState(10)
  const [newPolicyId, setNewPolicyId] = useState('')

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      // Fetch queues
      const qRes = await fetch(`http://localhost:3000/api/projects/${projectId}/queues`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const qData = await qRes.json()
      if (!qRes.ok) throw new Error(qData.error?.message || 'Failed to fetch queues.')

      // Fetch retry policies
      const pRes = await fetch('http://localhost:3000/api/retry-policies', {
        headers: { Authorization: `Bearer ${token}` }
      })
      const pData = await pRes.json()
      if (!pRes.ok) throw new Error(pData.error?.message || 'Failed to fetch retry policies.')

      setQueues(qData.queues)
      setPolicies(pData.retryPolicies)
      if (pData.retryPolicies.length > 0) {
        setNewPolicyId(pData.retryPolicies[0].id)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (projectId) {
      fetchData()
    }
  }, [projectId])

  const handleToggleStatus = async (queue: Queue) => {
    const nextStatus = queue.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE'
    try {
      const res = await fetch(`http://localhost:3000/api/queues/${queue.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: nextStatus })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to toggle queue status.')

      // Refresh locally
      setQueues(queues.map(q => q.id === queue.id ? { ...q, status: nextStatus } : q))
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleOpenEdit = (queue: Queue) => {
    setEditingQueue(queue)
    setPriority(queue.priority)
    setConcurrency(queue.concurrencyLimit)
    setPolicyId(queue.retryPolicyId)
    setQueueStatus(queue.status)
  }

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingQueue) return

    setSaving(true)
    try {
      const res = await fetch(`http://localhost:3000/api/queues/${editingQueue.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          priority,
          concurrencyLimit: concurrency,
          retryPolicyId: policyId,
          status: queueStatus
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to update queue.')

      setEditingQueue(null)
      fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newName.trim() || !newPolicyId) return

    setSaving(true)
    try {
      const res = await fetch(`http://localhost:3000/api/projects/${projectId}/queues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newName,
          priority: newPriority,
          concurrencyLimit: newConcurrency,
          retryPolicyId: newPolicyId
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to create queue.')

      setIsCreating(false)
      setNewName('')
      fetchData()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <span className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
        <p className="text-slate-400 text-sm">Loading queue configurations...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-10 bg-red-950/20 border border-red-500/20 rounded-xl p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 text-red-400 mb-4">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-red-200 mb-2">Failed to Load Queues</h3>
        <p className="text-sm text-red-300/80 mb-6">{error}</p>
        <button
          onClick={fetchData}
          className="bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 font-medium px-4 py-2 rounded-lg transition-colors"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-100">Queue Management</h2>
          <p className="text-slate-400 text-sm">Configure concurrency limits, priorities, and retry paths.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center space-x-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          <span>Create Queue</span>
        </button>
      </div>

      {queues.length === 0 ? (
        <div className="bg-slate-900/25 border border-slate-800/80 rounded-xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-800 text-slate-400 mb-4">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-300 mb-1">No Queues Configured</h3>
          <p className="text-sm text-slate-500 mb-6">Create a queue to start distributing jobs across workers.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-medium px-4 py-2 rounded-lg transition-colors"
          >
            Configure First Queue
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {queues.map((queue) => (
            <div
              key={queue.id}
              className={`bg-slate-900/30 border rounded-xl p-6 relative overflow-hidden transition-all duration-200 ${queue.status === 'PAUSED' ? 'border-amber-500/20 bg-amber-950/5' : 'border-slate-800/80 hover:border-slate-700'}`}
            >
              {/* Active/Paused indicator tag */}
              <div className="absolute top-0 right-0 p-4">
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider ${queue.status === 'PAUSED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                  {queue.status}
                </span>
              </div>

              <h3 className="text-lg font-bold text-slate-100 mb-1 pr-16 truncate">{queue.name}</h3>
              <p className="text-xs text-slate-500 mb-6">ID: {queue.id}</p>

              <div className="space-y-4 mb-6 text-sm">
                <div className="flex justify-between border-b border-slate-850 pb-2">
                  <span className="text-slate-400">Priority Level</span>
                  <span className="font-semibold text-slate-200">{queue.priority}</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-2">
                  <span className="text-slate-400">Concurrency Capacity</span>
                  <span className="font-semibold text-slate-200">{queue.concurrencyLimit} active jobs</span>
                </div>
                <div className="flex justify-between border-b border-slate-850 pb-2">
                  <span className="text-slate-400">Retry Backoff Strategy</span>
                  <span className="font-semibold text-purple-400" title={`Base Delay: ${queue.retryPolicy.baseDelay}s, Max Retries: ${queue.retryPolicy.maxRetries}`}>
                    {queue.retryPolicy.name}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={() => handleToggleStatus(queue)}
                  className={`text-xs font-medium py-2 rounded-lg border transition-all ${queue.status === 'PAUSED' ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-slate-950/40 hover:bg-slate-900 border-slate-800 text-slate-300'}`}
                >
                  {queue.status === 'ACTIVE' ? 'Pause Queue' : 'Resume Queue'}
                </button>
                <button
                  onClick={() => handleOpenEdit(queue)}
                  className="bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-300 text-xs font-medium py-2 rounded-lg transition-all"
                >
                  Edit Config
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE QUEUE MODAL */}
      {isCreating && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-100 mb-4">Create Queue</h3>
            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Queue Name</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-purple-500"
                  placeholder="image-resizing"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Priority (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={newPriority}
                    onChange={(e) => setNewPriority(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newConcurrency}
                    onChange={(e) => setNewConcurrency(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Retry Policy</label>
                <select
                  value={newPolicyId}
                  onChange={(e) => setNewPolicyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-855 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.strategy})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-500 active:bg-purple-750 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT QUEUE CONFIG MODAL */}
      {editingQueue && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl relative">
            <h3 className="text-lg font-bold text-slate-100 mb-1">Edit Queue Config</h3>
            <p className="text-xs text-slate-400 mb-4">Editing queue: {editingQueue.name}</p>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Priority (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Concurrency Limit</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Retry Policy</label>
                <select
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-855 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.strategy})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Queue Status</label>
                <select
                  value={queueStatus}
                  onChange={(e) => setQueueStatus(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-855 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setEditingQueue(null)}
                  className="bg-slate-950 hover:bg-slate-900 border border-slate-800 text-slate-400 px-4 py-2 rounded-lg text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-500 active:bg-purple-750 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
