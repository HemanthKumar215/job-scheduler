import { useState, useEffect } from 'react'

interface JobExplorerProps {
  token: string
  projectId: string
}

interface Job {
  id: string
  payload: any
  status: string
  priority: number
  queueId: string
  queue: { name: string }
  scheduledAt: string
  cronExpression: string | null
  attemptCount: number
  batchId: string | null
  correlationId: string
  createdAt: string
  updatedAt: string
}

interface JobLog {
  id: string
  level: string
  message: string
  timestamp: string
}

export default function JobExplorer({ token, projectId }: JobExplorerProps) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [queues, setQueues] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  
  // Filter States
  const [statusFilter, setStatusFilter] = useState('')
  const [queueFilter, setQueueFilter] = useState('')
  const [batchFilter, setBatchFilter] = useState('')
  const [correlationFilter, setCorrelationFilter] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')

  // Pagination
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [limit] = useState(15)

  // Selected Job Details Sidebar
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedJob, setSelectedJob] = useState<any | null>(null)
  const [selectedJobLogs, setSelectedJobLogs] = useState<JobLog[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [logsLoading, setLogsLoading] = useState(false)

  // Fetch queues for filter dropdown
  useEffect(() => {
    const fetchQueues = async () => {
      try {
        const res = await fetch(`http://localhost:3000/api/projects/${projectId}/queues`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        const data = await res.json()
        if (res.ok) setQueues(data.queues)
      } catch (err) {}
    }
    if (projectId) fetchQueues()
  }, [projectId])

  // Fetch Jobs List
  const fetchJobs = async () => {
    setLoading(true)
    setError('')
    try {
      let queryStr = `page=${page}&limit=${limit}`
      if (statusFilter) queryStr += `&status=${statusFilter}`
      if (queueFilter) queryStr += `&queueId=${queueFilter}`
      if (batchFilter) queryStr += `&batchId=${batchFilter}`
      if (correlationFilter) queryStr += `&correlationId=${correlationFilter}`
      if (dateStart) queryStr += `&dateRangeStart=${dateStart}`
      if (dateEnd) queryStr += `&dateRangeEnd=${dateEnd}`

      const res = await fetch(`http://localhost:3000/api/projects/${projectId}/jobs?${queryStr}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to search jobs.')

      setJobs(data.jobs)
      setTotalPages(data.pagination.totalPages || 1)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (projectId) {
      fetchJobs()
    }
  }, [projectId, page, statusFilter, queueFilter, dateStart, dateEnd])

  const handleSearchClick = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchJobs()
  }

  // Fetch Job details & logs
  const fetchJobDetails = async (jobId: string) => {
    setSelectedJobId(jobId)
    setDetailLoading(true)
    setLogsLoading(true)
    try {
      // 1. Fetch details
      const detailRes = await fetch(`http://localhost:3000/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const detailData = await detailRes.json()
      if (!detailRes.ok) throw new Error(detailData.error?.message || 'Failed to fetch details.')
      setSelectedJob(detailData.job)
      setDetailLoading(false)

      // 2. Fetch logs
      const logsRes = await fetch(`http://localhost:3000/api/jobs/${jobId}/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      const logsData = await logsRes.json()
      if (!logsRes.ok) throw new Error(logsData.error?.message || 'Failed to fetch logs.')
      setSelectedJobLogs(logsData.logs)
    } catch (err: any) {
      alert(err.message)
    } finally {
      setLogsLoading(false)
      setDetailLoading(false)
    }
  }

  const handleRetryJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to manually retry this job?')) return

    try {
      const res = await fetch(`http://localhost:3000/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to retry job.')

      alert(data.message)
      fetchJobDetails(jobId)
      fetchJobs()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleRequeueDlq = async (jobId: string) => {
    if (!confirm('Requeue this job from DLQ back to standard queue?')) return

    try {
      const res = await fetch(`http://localhost:3000/api/jobs/${jobId}/requeue-dlq`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to requeue job.')

      alert(data.message)
      fetchJobDetails(jobId)
      fetchJobs()
    } catch (err: any) {
      alert(err.message)
    }
  }

  return (
    <div className="space-y-6 relative min-h-[500px]">
      <div>
        <h2 className="text-xl font-bold text-slate-100">Job Explorer</h2>
        <p className="text-slate-400 text-sm">Query, filter, and inspect scheduler executions and stdout console statements.</p>
      </div>

      {/* Filter Bar Form */}
      <form onSubmit={handleSearchClick} className="bg-slate-900/30 border border-slate-800/80 rounded-xl p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Queue</label>
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">All Queues</option>
            {queues.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="CLAIMED">CLAIMED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="DLQ">DLQ</option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Batch ID</label>
          <input
            type="text"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            placeholder="Search batch..."
            className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Correlation ID</label>
          <input
            type="text"
            value={correlationFilter}
            onChange={(e) => setCorrelationFilter(e.target.value)}
            placeholder="Search correlation..."
            className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Date Range Start</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
          />
        </div>

        <div className="flex space-x-2">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Date Range End</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full bg-slate-950 border border-slate-850 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium px-4 py-2 rounded-lg transition-colors h-[31px]"
          >
            Filter
          </button>
        </div>
      </form>

      {/* Main Content Grid (List + Sidebar) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Jobs List */}
        <div className="lg:col-span-2 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-slate-900/10 border border-slate-800/80 rounded-xl space-y-4">
              <span className="w-10 h-10 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-slate-400 text-xs">Querying jobs database...</p>
            </div>
          ) : error ? (
            <div className="bg-red-950/10 border border-red-500/20 rounded-xl p-6 text-center text-red-200">
              <h3 className="text-sm font-semibold mb-1">Failed to fetch jobs</h3>
              <p className="text-xs text-red-300/80">{error}</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-slate-900/10 border border-slate-800/80 rounded-xl p-12 text-center text-slate-400">
              <svg className="w-10 h-10 mx-auto text-slate-650 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <h3 className="text-sm font-semibold text-slate-300 mb-1">No Jobs Found</h3>
              <p className="text-xs text-slate-500">No jobs match your selected filter criteria.</p>
            </div>
          ) : (
            <div className="bg-slate-900/20 border border-slate-800/80 rounded-xl overflow-hidden shadow-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-slate-850 text-slate-400 uppercase tracking-wider font-semibold">
                      <th className="p-3">Job ID</th>
                      <th className="p-3">Queue</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Priority</th>
                      <th className="p-3">Attempts</th>
                      <th className="p-3">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850/60 text-slate-300">
                    {jobs.map((job) => (
                      <tr
                        key={job.id}
                        onClick={() => fetchJobDetails(job.id)}
                        className={`hover:bg-slate-850/30 cursor-pointer transition-colors ${selectedJobId === job.id ? 'bg-purple-950/15' : ''}`}
                      >
                        <td className="p-3 font-mono font-medium truncate max-w-[120px] text-purple-400" title={job.id}>
                          {job.id.slice(0, 8)}...
                        </td>
                        <td className="p-3 font-medium">{job.queue?.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            job.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/25' :
                            job.status === 'RUNNING' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/25' :
                            job.status === 'CLAIMED' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/25' :
                            job.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/25' :
                            job.status === 'DLQ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/25' :
                            'bg-slate-500/10 text-slate-400 border border-slate-750'
                          }`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="p-3 font-semibold">{job.priority}</td>
                        <td className="p-3 text-slate-400">{job.attemptCount}</td>
                        <td className="p-3 text-slate-450">{new Date(job.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="bg-slate-950/40 px-4 py-3 border-t border-slate-850 flex items-center justify-between text-xs text-slate-400">
                  <span>Showing Page {page} of {totalPages}</span>
                  <div className="flex space-x-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 disabled:opacity-30 hover:bg-slate-850"
                    >
                      Prev
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                      className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1 disabled:opacity-30 hover:bg-slate-850"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar details */}
        <div className="lg:col-span-1">
          {!selectedJobId ? (
            <div className="bg-slate-900/10 border border-slate-850 border-dashed rounded-xl p-8 text-center text-slate-500 text-xs h-full flex flex-col items-center justify-center">
              <svg className="w-8 h-8 text-slate-700 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
              </svg>
              <span>Click a job in the explorer list to inspect logs and metadata.</span>
            </div>
          ) : detailLoading ? (
            <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-6 text-center space-y-3">
              <span className="w-8 h-8 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto block" />
              <p className="text-slate-400 text-xs">Hydrating job execution context...</p>
            </div>
          ) : !selectedJob ? (
            <div className="bg-slate-900/20 border border-slate-800 rounded-xl p-6 text-center text-slate-400 text-xs">
              Failed to load details for Job {selectedJobId}
            </div>
          ) : (
            <div className="bg-slate-900/30 border border-slate-800 rounded-xl p-6 space-y-6 shadow-2xl relative">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="text-sm font-bold text-slate-100 font-mono truncate mr-2" title={selectedJob.id}>
                    JOB: {selectedJob.id}
                  </h3>
                  <button
                    onClick={() => setSelectedJobId(null)}
                    className="text-slate-500 hover:text-slate-350"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex items-center space-x-2 mt-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    selectedJob.status === 'COMPLETED' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                    selectedJob.status === 'RUNNING' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    selectedJob.status === 'CLAIMED' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' :
                    selectedJob.status === 'FAILED' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    selectedJob.status === 'DLQ' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' :
                    'bg-slate-500/10 text-slate-400 border border-slate-750'
                  }`}>
                    {selectedJob.status}
                  </span>
                  <span className="text-xs text-slate-500">Queue: {selectedJob.queue?.name}</span>
                </div>
              </div>

              {/* Action buttons */}
              {(selectedJob.status === 'FAILED' || selectedJob.status === 'DLQ') && (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleRetryJob(selectedJob.id)}
                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold py-2 rounded-lg transition-colors"
                  >
                    Retry Job
                  </button>
                  {selectedJob.status === 'DLQ' && (
                    <button
                      onClick={() => handleRequeueDlq(selectedJob.id)}
                      className="bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-300 text-xs font-semibold py-2 rounded-lg transition-colors"
                    >
                      Re-enqueue Queue
                    </button>
                  )}
                </div>
              )}

              {/* DLQ Reason Alert */}
              {selectedJob.status === 'DLQ' && selectedJob.dlqEntries?.[0] && (
                <div className="bg-rose-950/30 border border-rose-500/30 rounded-lg p-3 text-xs text-rose-300">
                  <strong className="block mb-1">Dead Letter Queue quarantine reason:</strong>
                  <p className="font-mono text-[10px] break-all">{selectedJob.dlqEntries[0].reason}</p>
                </div>
              )}

              {/* Meta information */}
              <div className="space-y-2.5 text-xs border-t border-b border-slate-850 py-3.5">
                <div className="flex justify-between">
                  <span className="text-slate-450">Correlation ID:</span>
                  <span className="font-mono text-[10px] text-purple-300 truncate max-w-[150px]">{selectedJob.correlationId}</span>
                </div>
                {selectedJob.batchId && (
                  <div className="flex justify-between">
                    <span className="text-slate-450">Batch ID:</span>
                    <span className="font-mono text-[10px] text-slate-300 truncate max-w-[150px]">{selectedJob.batchId}</span>
                  </div>
                )}
                {selectedJob.idempotencyKey && (
                  <div className="flex justify-between">
                    <span className="text-slate-450">Idempotency Key:</span>
                    <span className="font-mono text-[10px] text-slate-300 truncate max-w-[150px]">{selectedJob.idempotencyKey}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-450">Scheduled run:</span>
                  <span className="text-slate-300">{new Date(selectedJob.scheduledAt).toLocaleString()}</span>
                </div>
                {selectedJob.cronExpression && (
                  <div className="flex justify-between">
                    <span className="text-slate-450">Cron expression:</span>
                    <span className="font-mono text-slate-300 text-[10px] bg-slate-950 px-1.5 py-0.5 rounded">{selectedJob.cronExpression}</span>
                  </div>
                )}
              </div>

              {/* Payload Block */}
              <div>
                <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Payload Data</span>
                <pre className="bg-slate-950 border border-slate-850 rounded-lg p-3 text-[10px] font-mono text-slate-300 overflow-x-auto max-h-[150px]">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>

              {/* Execution Attempts Log */}
              <div>
                <span className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Execution Logs Console</span>
                <div className="bg-slate-950 border border-slate-850 rounded-lg p-3 font-mono text-[10px] h-[180px] overflow-y-auto space-y-1.5 scrollbar-thin text-slate-300">
                  {logsLoading ? (
                    <span className="text-slate-500 italic">Streaming console buffer...</span>
                  ) : selectedJobLogs.length === 0 ? (
                    <span className="text-slate-600 italic">No output streams generated for this job yet.</span>
                  ) : (
                    selectedJobLogs.map((log) => (
                      <div key={log.id} className="flex flex-col border-b border-slate-850/30 pb-1">
                        <span className="text-slate-500 text-[8px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-slate-300'}>
                          [{log.level}] {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
