import { useState, useEffect } from 'react'

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
      <div className="flex flex-col items-center justify-center py-20 space-y-4 font-mono">
        <span className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
        <p className="text-slate-500 text-xs">RETRIEVING_QUEUE_CONFIGS...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-xl mx-auto my-10 bg-[#12151C] border border-red-950/80 rounded p-5 font-mono">
        <div className="flex items-center space-x-2 text-red-450 text-sm font-semibold mb-2">
          <span>[SYS_ERROR]</span>
        </div>
        <p className="text-xs text-slate-550 mb-6">{error}</p>
        <button
          onClick={fetchData}
          className="bg-[#0B0D12] hover:bg-[#12151C] text-slate-300 border border-[#1F2430] text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer"
        >
          RETRY_FETCH
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 font-sans">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-mono">Queue Configurations</h2>
          <p className="text-slate-550 text-[10px] font-mono">Define queue-level priority parameters, concurrency pools, and retry paths.</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="bg-purple-600/10 hover:bg-purple-600/20 active:bg-purple-600/35 border border-purple-500/40 text-purple-300 text-xs font-semibold px-3 py-1.5 rounded transition-colors font-mono cursor-pointer"
        >
          CREATE_QUEUE
        </button>
      </div>

      {queues.length === 0 ? (
        <div className="bg-[#12151C] border border-[#1F2430] rounded p-12 text-center text-slate-500 font-mono">
          <h3 className="text-xs font-bold text-slate-400 mb-1">NO_QUEUES_CONFIGURED</h3>
          <p className="text-[10px] text-slate-600 mb-6">Create a queue schema definition to route job tasks.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="bg-[#0B0D12] hover:bg-[#12151C] text-slate-350 border border-[#1F2430] text-xs font-semibold px-4 py-2 rounded transition-colors cursor-pointer"
          >
            CONFIGURE_INITIAL_QUEUE
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
          {queues.map((queue) => (
            <div
              key={queue.id}
              className={`bg-[#12151C] border rounded p-5 relative overflow-hidden transition-all duration-200 ${queue.status === 'PAUSED' ? 'border-amber-500/30' : 'border-[#1F2430] hover:border-slate-700'}`}
            >
              {/* Active/Paused indicator tag */}
              <div className="absolute top-0 right-0 p-3">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${queue.status === 'PAUSED' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-green-500/10 text-green-400 border border-green-500/20'}`}>
                  {queue.status}
                </span>
              </div>

              <h3 className="font-bold text-slate-200 text-sm mb-1 pr-16 truncate">{queue.name}</h3>
              <p className="text-[8px] text-slate-500 mb-5">ID: {queue.id}</p>

              <div className="space-y-2 mb-6 text-[10px] text-slate-400 border-t border-[#1F2430] pt-3">
                <div className="flex justify-between border-b border-[#1F2430]/40 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px]">Priority</span>
                  <span className="text-slate-200">{queue.priority}</span>
                </div>
                <div className="flex justify-between border-b border-[#1F2430]/40 pb-1.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px]">Max Concurrency</span>
                  <span className="text-slate-200">{queue.concurrencyLimit} tasks</span>
                </div>
                <div className="flex justify-between pb-0.5">
                  <span className="text-slate-500 font-bold uppercase tracking-wider text-[8px]">Backoff Strategy</span>
                  <span className="text-purple-400 truncate max-w-[120px]">{queue.retryPolicy.name}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handleToggleStatus(queue)}
                  className={`text-[9px] font-bold py-1.5 rounded border transition-all cursor-pointer ${queue.status === 'PAUSED' ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30' : 'bg-[#0B0D12] hover:bg-[#12151C] border-[#1F2430] text-slate-350'}`}
                >
                  {queue.status === 'ACTIVE' ? 'PAUSE' : 'RESUME'}
                </button>
                <button
                  onClick={() => handleOpenEdit(queue)}
                  className="bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/30 text-purple-300 text-[9px] font-bold py-1.5 rounded transition-all cursor-pointer"
                >
                  EDIT_CONFIG
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CREATE QUEUE MODAL */}
      {isCreating && (
        <div className="fixed inset-0 bg-[#0B0D12]/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#12151C] border border-[#1F2430] rounded p-5 shadow-2xl relative font-mono text-xs">
            <h3 className="font-bold text-slate-200 mb-4 uppercase text-center tracking-wider">Create Queue Config</h3>
            <form onSubmit={handleCreateQueue} className="space-y-4">
              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Queue Identifier</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  placeholder="image-processing"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Priority (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={newPriority}
                    onChange={(e) => setNewPriority(parseInt(e.target.value))}
                    className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Max Concurrency</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={newConcurrency}
                    onChange={(e) => setNewConcurrency(parseInt(e.target.value))}
                    className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Retry Backoff Policy</label>
                <select
                  value={newPolicyId}
                  onChange={(e) => setNewPolicyId(e.target.value)}
                  className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[#1F2430]/60 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="bg-[#0B0D12] hover:bg-[#12151C] border border-[#1F2430] text-slate-400 px-3.5 py-1.5 rounded transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/40 text-purple-300 px-4 py-1.5 rounded font-bold transition-colors cursor-pointer"
                >
                  {saving ? 'CREATING...' : 'SUBMIT'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT QUEUE CONFIG MODAL */}
      {editingQueue && (
        <div className="fixed inset-0 bg-[#0B0D12]/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#12151C] border border-[#1F2430] rounded p-5 shadow-2xl relative font-mono text-xs">
            <h3 className="font-bold text-slate-200 mb-1 uppercase tracking-wider text-center">Edit Queue Config</h3>
            <p className="text-[9px] text-slate-550 mb-4 text-center">Queue: {editingQueue.name}</p>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Priority (1-10)</label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    value={priority}
                    onChange={(e) => setPriority(parseInt(e.target.value))}
                    className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Max Concurrency</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={concurrency}
                    onChange={(e) => setConcurrency(parseInt(e.target.value))}
                    className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Retry Backoff Policy</label>
                <select
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                  className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
                >
                  {policies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Queue Status</label>
                <select
                  value={queueStatus}
                  onChange={(e) => setQueueStatus(e.target.value)}
                  className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-3 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="PAUSED">PAUSED</option>
                </select>
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-[#1F2430]/60 mt-6 font-mono">
                <button
                  type="button"
                  onClick={() => setEditingQueue(null)}
                  className="bg-[#0B0D12] hover:bg-[#12151C] border border-[#1F2430] text-slate-400 px-3.5 py-1.5 rounded transition-colors cursor-pointer"
                >
                  CANCEL
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/40 text-purple-300 px-4 py-1.5 rounded font-bold transition-colors cursor-pointer"
                >
                  {saving ? 'SAVING...' : 'SAVE_CHANGES'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
