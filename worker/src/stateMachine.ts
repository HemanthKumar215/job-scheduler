import { JobStatus } from 'db-client'

const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  [JobStatus.QUEUED]: [JobStatus.CLAIMED],
  [JobStatus.CLAIMED]: [JobStatus.RUNNING, JobStatus.QUEUED, JobStatus.FAILED],
  [JobStatus.RUNNING]: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.QUEUED, JobStatus.DLQ],
  [JobStatus.COMPLETED]: [JobStatus.QUEUED], // Can reset for manual rerun
  [JobStatus.FAILED]: [JobStatus.QUEUED, JobStatus.DLQ],
  [JobStatus.DLQ]: [JobStatus.QUEUED]
}

export function isValidTransition(current: JobStatus, target: JobStatus): boolean {
  if (current === target) return true
  const allowed = VALID_TRANSITIONS[current]
  return allowed ? allowed.includes(target) : false
}

export function validateStateTransition(current: JobStatus, target: JobStatus) {
  if (!isValidTransition(current, target)) {
    throw new Error(`Invalid state transition: Cannot move job from ${current} to ${target}`)
  }
}
