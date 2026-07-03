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
    if (!confirm('Confirm manual retry. Resets attempts and triggers queue schedule.')) return

    try {
      const res = await fetch(`http://localhost:3000/api/jobs/${jobId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to retry job.')

      fetchJobDetails(jobId)
      fetchJobs()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const handleRequeueDlq = async (jobId: string) => {
    if (!confirm('Requeue this job from DLQ back to active scheduling?')) return

    try {
      const res = await fetch(`http://localhost:3000/api/jobs/${jobId}/requeue-dlq`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error?.message || 'Failed to requeue job.')

      fetchJobDetails(jobId)
      fetchJobs()
    } catch (err: any) {
      alert(err.message)
    }
  }

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/10 text-green-400 border border-green-500/20'
      case 'RUNNING':
      case 'CLAIMED':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
      case 'FAILED':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
      case 'DLQ':
      case 'DEAD':
        return 'bg-red-500/10 text-red-400 border border-red-500/20'
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-700'
    }
  }

  return (
    <div className="space-y-6 relative min-h-[500px] font-sans">
      <div>
        <h2 className="text-sm font-bold text-slate-200 uppercase tracking-widest font-mono">Job Explorer</h2>
        <p className="text-slate-500 text-[10px] font-mono">Audit transactional jobs backlog queue logs and lifecycle states.</p>
      </div>

      {/* Filter Bar Form */}
      <form onSubmit={handleSearchClick} className="bg-[#12151C] border border-[#1F2430] rounded p-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 items-end">
        <div>
          <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Queue</label>
          <select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value)}
            className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-1 text-xs text-slate-350 focus:outline-none font-mono cursor-pointer"
          >
            <option value="">All Queues</option>
            {queues.map(q => (
              <option key={q.id} value={q.id}>{q.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-1 text-xs text-slate-350 focus:outline-none font-mono cursor-pointer"
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
          <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Batch ID</label>
          <input
            type="text"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            placeholder="Search batch..."
            className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-1 text-xs text-slate-355 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Correlation ID</label>
          <input
            type="text"
            value={correlationFilter}
            onChange={(e) => setCorrelationFilter(e.target.value)}
            placeholder="Search correlation..."
            className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-1 text-xs text-slate-355 focus:outline-none font-mono"
          />
        </div>

        <div>
          <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Date Range Start</label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-0.5 text-xs text-slate-350 focus:outline-none font-mono"
          />
        </div>

        <div className="flex space-x-2">
          <div className="flex-1">
            <label className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1 font-mono">Date Range End</label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              className="w-full bg-[#0B0D12] border border-[#1F2430] rounded px-2.5 py-0.5 text-xs text-slate-350 focus:outline-none font-mono"
            />
          </div>
          <button
            type="submit"
            className="bg-purple-600/10 hover:bg-purple-600/20 active:bg-purple-600/35 border border-purple-500/40 text-purple-300 text-xs font-semibold px-4 py-1 rounded transition-colors h-[27px] font-mono cursor-pointer"
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
            <div className="flex flex-col items-center justify-center py-20 bg-[#12151C] border border-[#1F2430] rounded space-y-4 font-mono">
              <span className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-slate-500 text-xs">QUERYING_DB_REGISTRY...</p>
            </div>
          ) : error ? (
            <div className="bg-[#12151C] border border-red-500/20 rounded p-6 text-center font-mono">
              <h3 className="text-xs font-bold text-red-400 mb-1">[QUERY FAILED]</h3>
              <p className="text-xs text-slate-500">{error}</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="bg-[#12151C] border border-[#1F2430] rounded p-12 text-center text-slate-500 font-mono">
              <h3 className="text-xs font-bold text-slate-400 mb-1">NO_JOBS_FOUND</h3>
              <p className="text-[10px] text-slate-600">No jobs match this filter.</p>
            </div>
          ) : (
            <div className="bg-[#12151C] border border-[#1F2430] rounded overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead>
                    <tr className="bg-[#0B0D12] border-b border-[#1F2430] text-slate-500 uppercase tracking-wider font-semibold text-[9px]">
                      <th className="p-2.5">Job ID</th>
                      <th className="p-2.5">Queue</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Priority</th>
                      <th className="p-2.5">Attempts</th>
                      <th className="p-2.5">Created At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1F2430]/40 text-slate-300">
                    {jobs.map((job) => (
                      <tr
                        key={job.id}
                        onClick={() => fetchJobDetails(job.id)}
                        className={`hover:bg-[#0B0D12]/40 cursor-pointer transition-colors ${selectedJobId === job.id ? 'bg-purple-950/10' : ''}`}
                      >
                        <td className="p-2.5 font-bold text-purple-400">
                          {job.id.slice(0, 8)}
                        </td>
                        <td className="p-2.5 text-slate-350">{job.queue?.name}</td>
                        <td className="p-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${getStatusBadgeStyle(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-350">{job.priority}</td>
                        <td className="p-2.5 text-slate-400">{job.attemptCount}</td>
                        <td className="p-2.5 text-slate-550">{new Date(job.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="bg-[#0B0D12] px-4 py-2.5 border-t border-[#1F2430] flex items-center justify-between text-[10px] text-slate-500 font-mono">
                  <span>Page {page} of {totalPages}</span>
                  <div className="flex space-x-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="bg-[#12151C] border border-[#1F2430] rounded px-2.5 py-1 disabled:opacity-30 hover:bg-[#0B0D12] cursor-pointer"
                    >
                      Prev
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                      className="bg-[#12151C] border border-[#1F2430] rounded px-2.5 py-1 disabled:opacity-30 hover:bg-[#0B0D12] cursor-pointer"
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
        <div className="lg:col-span-1 font-mono text-[11px]">
          {!selectedJobId ? (
            <div className="bg-[#12151C]/45 border border-[#1F2430] border-dashed rounded p-6 text-center text-slate-500 text-[10px] h-full flex flex-col items-center justify-center">
              <span>SYS_SHELL: SELECT JOB RECORD TO INSPECT TRACE</span>
            </div>
          ) : detailLoading ? (
            <div className="bg-[#12151C] border border-[#1F2430] rounded p-6 text-center space-y-3">
              <span className="w-5 h-5 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto block" />
              <p className="text-slate-500 text-[10px]">HYDRATING_RECORD...</p>
            </div>
          ) : !selectedJob ? (
            <div className="bg-[#12151C] border border-[#1F2430] rounded p-6 text-center text-slate-500">
              SYS_ERROR: FAIL_HYDRATION_ID_{selectedJobId.slice(0,8)}
            </div>
          ) : (
            <div className="bg-[#12151C] border border-[#1F2430] rounded p-5 space-y-5 relative shadow-xl">
              <div>
                <div className="flex justify-between items-start">
                  <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
                    JOB_{selectedJob.id.slice(0,8)}
                  </h3>
                  <button
                    onClick={() => setSelectedJobId(null)}
                    className="text-slate-550 hover:text-slate-350 cursor-pointer"
                  >
                    [Close]
                  </button>
                </div>
                <div className="flex items-center space-x-2 mt-3">
                  <span className={`px-2 py-0.5 rounded text-[8px] font-bold ${getStatusBadgeStyle(selectedJob.status)}`}>
                    {selectedJob.status}
                  </span>
                  <span className="text-slate-550 text-[10px]">Queue: {selectedJob.queue?.name}</span>
                </div>
              </div>

              {/* Action buttons */}
              {(selectedJob.status === 'FAILED' || selectedJob.status === 'DLQ') && (
                <div className="grid grid-cols-2 gap-3 border-b border-[#1F2430]/65 pb-4">
                  <button
                    onClick={() => handleRetryJob(selectedJob.id)}
                    className="bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/40 text-purple-300 font-semibold py-1.5 rounded transition-all cursor-pointer text-center text-[10px]"
                  >
                    RETRY_JOB
                  </button>
                  {selectedJob.status === 'DLQ' && (
                    <button
                      onClick={() => handleRequeueDlq(selectedJob.id)}
                      className="bg-slate-800/60 hover:bg-slate-750/80 border border-slate-700 text-slate-300 py-1.5 rounded transition-all cursor-pointer text-center text-[10px]"
                    >
                      REQUEUE_QUEUE
                    </button>
                  )}
                </div>
              )}

              {/* DLQ Reason Alert */}
              {selectedJob.status === 'DLQ' && selectedJob.dlqEntries?.[0] && (
                <div className="bg-red-950/20 border border-red-500/20 rounded p-2.5 text-[9px] text-red-300">
                  <strong className="block mb-1">[DLQ QUARANTINE REASON]</strong>
                  <p className="break-all font-mono leading-relaxed">{selectedJob.dlqEntries[0].reason}</p>
                </div>
              )}

              {/* Meta information */}
              <div className="space-y-1.5 border-t border-b border-[#1F2430]/60 py-3 text-[10px]">
                <div className="flex justify-between">
                  <span className="text-slate-550">Correlation ID:</span>
                  <span className="text-purple-400 truncate max-w-[150px]">{selectedJob.correlationId}</span>
                </div>
                {selectedJob.batchId && (
                  <div className="flex justify-between">
                    <span className="text-slate-550">Batch ID:</span>
                    <span className="text-slate-350 truncate max-w-[150px]">{selectedJob.batchId}</span>
                  </div>
                )}
                {selectedJob.idempotencyKey && (
                  <div className="flex justify-between">
                    <span className="text-slate-550">Idempotency Key:</span>
                    <span className="text-slate-350 truncate max-w-[150px]">{selectedJob.idempotencyKey}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-550">Attempts Count:</span>
                  <span className="text-slate-300">{selectedJob.attemptCount} / {selectedJob.queue?.retryPolicy?.maxRetries || 5}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-550">Scheduled run:</span>
                  <span className="text-slate-300">{new Date(selectedJob.scheduledAt).toLocaleString()}</span>
                </div>
                {selectedJob.cronExpression && (
                  <div className="flex justify-between">
                    <span className="text-slate-550">Cron expression:</span>
                    <span className="bg-[#0B0D12] text-slate-300 px-1.5 py-0.5 rounded text-[9px] border border-[#1F2430]">{selectedJob.cronExpression}</span>
                  </div>
                )}
              </div>

              {/* Payload Block */}
              <div>
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Payload Data</span>
                <pre className="bg-[#0B0D12] border border-[#1F2430] rounded p-2.5 text-[9px] font-mono text-slate-300 overflow-x-auto max-h-[120px]">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>

              {/* Execution Console Terminal (Signature design) */}
              <div>
                <span className="block text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Stdout Console Streams</span>
                <div className="bg-[#0B0D12] border border-[#1F2430] rounded p-2.5 font-mono text-[9px] h-[160px] overflow-y-auto space-y-1 scrollbar-thin text-slate-350">
                  {logsLoading ? (
                    <span className="text-slate-550 italic">sys_stream: streaming console buffer...</span>
                  ) : selectedJobLogs.length === 0 ? (
                    <span className="text-slate-650 italic">sys_stream: stdout buffer empty</span>
                  ) : (
                    selectedJobLogs.map((log) => (
                      <div key={log.id} className="flex flex-col border-b border-[#1F2430]/15 pb-1 leading-normal">
                        <span className="text-slate-550 text-[7.5px]">{new Date(log.timestamp).toLocaleTimeString()}</span>
                        <span className={log.level === 'ERROR' ? 'text-red-400' : log.level === 'WARN' ? 'text-amber-400' : 'text-slate-300'}>
                          [{log.level.padEnd(5)}] {log.message}
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
