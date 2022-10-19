import fastify from 'fastify'
import * as chalk from 'chalk'
import * as fs from 'fs'
import * as cron from 'node-cron'

import { useCalendar } from './useCalendar'
import { useConfig } from './useConfig'
import { CALENDAR_CACHE_FILE } from './globals'

const { registerWebhook, handleWebhook, syncEvents, checkExpirationDates, isOutdated, setReady } = useCalendar()
const { sources, users, config } = useConfig()

const calendarCache = JSON.parse(fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8'))
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
    'Add the CalSync client mail to your source and target calendars as a guest:\n' + chalk.underline(config.clientMail) + '\n'
  )

  console.log(chalk.bold('Initializing...'))

  await handleJob('starting server', async () => {
    app.addHook('onRequest', (request, _, done) => {
      handleWebhook(request)
      done()
    })

    await app.listen({ port: config.port })
  })

  await handleJob('installing calendars', async () => {
    // TODO: error handling
    for (const source of sources) {
      if (!calendarCache[source]) {

        // register webhook if it doesn't exist
        calendarCache[source] = await registerWebhook(source)
        console.log(`${chalk.green('registered:')} ${chalk.gray(source)} `)
      } else if (isOutdated(calendarCache[source])) {

        // update webhook if it expired
        calendarCache[source] = await registerWebhook(source)
        console.log(`${chalk.green('updated:')} ${chalk.gray(source)} `)
      } else {

        // all up to date
        console.log(`${chalk.blue('already installed:')} ${chalk.gray(source)} `)
      }
      fs.writeFileSync(CALENDAR_CACHE_FILE, JSON.stringify(calendarCache))
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
