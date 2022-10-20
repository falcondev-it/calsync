import dotenv from 'dotenv'
import { Queue } from 'bullmq'

dotenv.config()

export const useQueue = () => {

  const connection = {
    host: process.env.MESSAGE_QUEUE_HOST,
    port: parseInt(process.env.MESSAGE_QUEUE_PORT)
  }

  const queueName = 'event_queue'

  const queue = new Queue(queueName, { connection })

  return { queue, queueName, connection }
}