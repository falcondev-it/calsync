import fastify from 'fastify'
import chalk from 'chalk'
import cron from 'node-cron'
import dotenv from 'dotenv'
import { Worker } from 'bullmq'

import { useSync } from './useSync.js'
import { useConfig } from './useConfig.js'
import { useCache } from './useCache.js'
import { useQueue } from './useQueue.js'
import { useCalendar } from './useCalendar.js'
import { useOutputFormatter } from './useOutputFormatter.js'

const { fetchAllEvents, fetchEventsFromSource, syncEvent, checkExpirationDates, isOutdated } = useSync()
const { registerWebhook } = useCalendar()
const { sources } = useConfig()
const { loadCache, saveCache, clearCache } = useCache()
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
    app.get('/', async () => {
      return 'CalSync is running!'
    })

    app.post('/webhook', async (request, reply) => {
      if (installing) return reply.send(200)

      // extract channel uuid from notification
      const channelId = request.headers['x-goog-channel-id']

      // find corresponding source calendar
      const cache = loadCache()
      const source = Object.keys(cache.calendars).find(
        (calendarId) => cache.calendars[calendarId].channel === channelId
      )

      // find syncConfig for source calendar
      await fetchEventsFromSource(source)

      return reply.send(200)
    })

    await app.listen({ port: parseInt(process.env.PORT), host: '0.0.0.0' }).then(console.log)
  })

  await handleJob('installing calendars', async () => {
    // TODO: error handling
    let cache = loadCache()
    if (cache.webhookUrl !== process.env.WEBHOOK_RECEIVER_URL) {
      console.log('new webhook url --> clearing cache')
      clearCache()
      cache = loadCache()
    }

    for (const source of sources) {
      if (!cache.calendars[source]) {

        // register webhook if it doesn't exist
        cache.calendars[source] = await registerWebhook(source)
        console.log(`${chalk.green('registered:')} ${chalk.gray(source)} `)
      } else if (isOutdated(cache.calendars[source])) {

        // update webhook if it expired
        cache.calendars[source] = await registerWebhook(source)
        console.log(`${chalk.green('updated:')} ${chalk.gray(source)} `)
      } else {

        // all up to date
        console.log(`${chalk.blue('already installed:')} ${chalk.gray(source)} `)
      }

      cache.webhookUrl = process.env.WEBHOOK_RECEIVER_URL
      saveCache(cache)
    }
  })

  await handleJob('starting scheduler', async () => {
    cron.schedule('0 2 * * *', checkExpirationDates) // every day at 2am
    cron.schedule('*/10 * * * *', fetchAllEvents) // every 10 minutes
  })

  console.log(chalk.bold('First polling...\n'))
  await fetchAllEvents()

  console.log(chalk.bold('Waiting for events...\n'))
  installing = false
})()
