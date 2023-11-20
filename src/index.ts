import chalk from 'chalk'
import cron from 'node-cron'
import dotenv from 'dotenv'
import { Worker } from 'bullmq'

import { useSync } from './useSync.js'
import { useConfig } from './useConfig.js'
import { useCache } from './useCache.js'
import { useQueue } from './useQueue.js'
import { useOutputFormatter } from './useOutputFormatter.js'

const { fetchAllEvents, syncEvent } = useSync()
const { sources } = useConfig()
const { loadCache, saveCache, clearCache } = useCache()
const { queueName, connection } = useQueue()
const { handleJob } = useOutputFormatter()

dotenv.config()

const worker = new Worker(queueName, async (job) => {
  const { source, sync, event } = job.data
  await syncEvent(source, sync, event)
},
{
  connection: connection,
  limiter: { max: 1, duration: 1000 }
})


// main
;(async () => {
  console.log(chalk.bold('Running CalSync...\n'))
  console.log(
    'Add the CalSync client mail to your source and target calendars as a guest:\n' + chalk.underline(process.env.GOOGLE_API_CLIENT_MAIL) + '\n'
  )

  console.log(chalk.bold('Initializing...'))

  await handleJob('installing calendars', async () => {
    let cache = loadCache()

    if (cache.calendars === undefined) {
      clearCache()
      cache = loadCache()
    }

    for (const source of sources) {
      if (!cache.calendars[source]) {
        cache.calendars[source] = {}
        console.log(`${chalk.green('registered:')} ${chalk.gray(source)} `)
      } else {
        console.log(`${chalk.blue('already installed:')} ${chalk.gray(source)} `)
      }

      saveCache(cache)
    }
  })

  await handleJob('starting scheduler', async () => {
    cron.schedule('* * * * *', fetchAllEvents) // every 10 minutes
  })

  await fetchAllEvents()
})()
