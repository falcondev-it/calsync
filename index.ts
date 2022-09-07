import fastify from 'fastify'
import * as fs from 'fs'
import * as cron from 'node-cron'

import { useSyncs } from './useSyncs'
import { useCalendar } from './useCalendar'
import { useConfig } from './useConfig'

// TODO: make type-safe

const CALENDAR_CACHE_FILE = './calendarCache.json';

const { sources } = useSyncs()
const { registerWebhook, handleWebhook, checkExpirationDates } = useCalendar()
const config = useConfig()


const calendarCacheFile = fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8')
const calendarCache = JSON.parse(calendarCacheFile)


const installCalendars = async () => {
  for (const source of sources) {
    if (!calendarCache[source]) {
        const { channel, expirationDate } = await registerWebhook(source)
        calendarCache[source].channel = channel
        calendarCache[source].expirationDate = expirationDate
    }
  }

  fs.writeFileSync(CALENDAR_CACHE_FILE, JSON.stringify(calendarCache))
}

(
  //main
  async () => {
    console.log("starting Calsync...")
    console.log("Add the Calsync client mail to your source and target calendars as a guest:", config.clientMail)

    const app = fastify()

    app.addHook("onRequest", (request, _, done) => {
      handleWebhook(request)
      done()
    })

    app.listen({ port: config.port })

    installCalendars()

    cron.schedule('0 2 * * *', checkExpirationDates)
  }
)()