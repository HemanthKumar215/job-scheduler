import { Server as HttpServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import Redis from 'ioredis'
import pino from 'pino'

const logger = pino({ level: process.env.LOG_LEVEL || 'info' })
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379'

let io: SocketIOServer | null = null
let pubClient: Redis | null = null
let subClient: Redis | null = null

export function initSocketIO(server: HttpServer) {
  io = new SocketIOServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  })

  pubClient = new Redis(REDIS_URL)
  subClient = new Redis(REDIS_URL)

  io.on('connection', (socket) => {
    logger.info({ socketId: socket.id }, 'Socket client connected')

    socket.on('disconnect', () => {
      logger.info({ socketId: socket.id }, 'Socket client disconnected')
    })
  })

  // Subscribe to Redis channels for pub/sub real-time streaming
  subClient.subscribe('job-updates', 'worker-updates', (err) => {
    if (err) {
      logger.error(err, 'Failed to subscribe to Redis pubsub channels')
    } else {
      logger.info('Subscribed to Redis pubsub channels (job-updates, worker-updates)')
    }
  })

  subClient.on('message', (channel, message) => {
    try {
      const data = JSON.parse(message)
      if (io) {
        io.emit(channel, data)
      }
    } catch (err) {
      logger.error({ err, channel, message }, 'Failed to parse pubsub message')
    }
  })
}

export async function publishJobUpdate(jobId: string, status: string, payload: any) {
  if (pubClient) {
    await pubClient.publish('job-updates', JSON.stringify({ jobId, status, ...payload }))
  }
}

export async function publishWorkerUpdate(workerId: string, status: string, payload: any) {
  if (pubClient) {
    await pubClient.publish('worker-updates', JSON.stringify({ workerId, status, ...payload }))
  }
}
