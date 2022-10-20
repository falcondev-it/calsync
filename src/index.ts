import fastify from 'fastify'
import chalk from 'chalk'
import cron from 'node-cron'
import dotenv from 'dotenv'

import { useCalendar } from './useCalendar.js'
import { useConfig } from './useConfig.js'
import { useCache } from './useCache.js'

const { registerWebhook, getEvents, syncEvent, checkExpirationDates, isOutdated } = useCalendar()
const { syncs, sources } = useConfig()
const { cache, loadCache, saveCache } = useCache()

dotenv.config()
const app = fastify()

const handleJob = async (name: string, fn: () => Promise<any>) => {
  console.log(`${name}... `)
  await fn().then(() => {
    console.log(chalk.green('done\n'))
  }).catch((error: Error) => {
    console.log(chalk.red('failed\n'))
    console.log(error)
  })
}

// main
;(async () => {
  console.log(chalk.bold('Running CalSync...\n'))
  console.log(
    'Add the CalSync client mail to your source and target calendars as a guest:\n' + chalk.underline(process.env.GOOGLE_API_CLIENT_MAIL) + '\n'
  )

  console.log(chalk.bold('Initializing...'))

  await handleJob('starting server', async () => {
    app.addHook('onRequest', (request, _, done) => {
      handleWebhook(request)
      done()
    })

    await app.listen({ port: parseInt(process.env.PORT) })
  })

  await handleJob('installing calendars', async () => {
    // TODO: error handling
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
      saveCache()
    }
  })

  await handleJob('starting scheduler', async () => {
    cron.schedule('0 2 * * *', checkExpirationDates)
  })

  console.log(chalk.bold('First polling...\n'))
  for (const user of users) {
    await handleJob(`syncing calendars for user ${user}`, async () => {
      for (const sync of config.users[user]) {
        await syncEvents(sync)
      }
    })
  }

  console.log(chalk.bold('Waiting for events...\n'))
  setReady(true)
})()
