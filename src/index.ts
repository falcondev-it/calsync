import fastify from 'fastify'
import chalk from 'chalk'
import cron from 'node-cron'
import dotenv from 'dotenv'
import { Worker } from 'bullmq'

import { useCalendar } from './useCalendar.js'
import { useConfig } from './useConfig.js'
import { useCache } from './useCache.js'
import { useQueue } from './useQueue.js'
import { useOutputFormatter } from './useOutputFormatter.js'

const { registerWebhook, fetchAllEvents, fetchEventsFromSource, syncEvent, checkExpirationDates, isOutdated } = useCalendar()
const { sources } = useConfig()
const { loadCache, saveCache } = useCache()
const { queueName, connection } = useQueue()
const { handleJob } = useOutputFormatter()

dotenv.config()
const app = fastify()
let installing = true

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

  await handleJob('starting server', async () => {
    app.addHook('onRequest', async (request, _) => {
      if (installing) return

      // extract channel uuid from notification
      const channelId = request.headers['x-goog-channel-id']

      // find corresponding source calendar
      const cache = loadCache()
      const source = Object.keys(cache).find(
        (calendarId) => cache[calendarId].channel === channelId
      )

      // find syncConfig for source calendar
      fetchEventsFromSource(source)
    })

    await app.listen({ port: parseInt(process.env.PORT) })
  })

  await handleJob('installing calendars', async () => {
    // TODO: error handling
    let cache = loadCache()
    for (const source of sources) {
      if (!cache[source]) {

        // register webhook if it doesn't exist
        cache[source] = await registerWebhook(source)
        console.log(`${chalk.green('registered:')} ${chalk.gray(source)} `)
      } else if (isOutdated(cache[source])) {

        // update webhook if it expired
        cache[source] = await registerWebhook(source)
        console.log(`${chalk.green('updated:')} ${chalk.gray(source)} `)
      } else {

        // all up to date
        console.log(`${chalk.blue('already installed:')} ${chalk.gray(source)} `)
      }

      saveCache(cache)
    }
  })

  await handleJob('starting scheduler', async () => {
    cron.schedule('0 15 * * *', checkExpirationDates) // every day at 2am
    cron.schedule('*/10 * * * *', fetchAllEvents) // every 10 minutes
  })

  console.log(chalk.bold('First polling...\n'))
  await fetchAllEvents()

  console.log(chalk.bold('Waiting for events...\n'))
  installing = false
})()
