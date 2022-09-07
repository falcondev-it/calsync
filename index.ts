import fastify from 'fastify'
import * as fs from 'fs'

import { useSyncs } from './useSyncs'
import { useCalendar } from './useCalendar'
import { useConfig } from './useConfig'

// TODO: make type-safe

const CALENDAR_CACHE_FILE = './calendarCache.json';

const { sources } = useSyncs()
const { registerWebhook, handleWebhook } = useCalendar()
const config = useConfig()


const calendarCacheFile = fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8')
const calendarCache = JSON.parse(calendarCacheFile)


const installCalendars = async () => {
  for (const source of sources) {
    if (!calendarCache[source]) {
      calendarCache[source] = await registerWebhook(source)
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
  }
)()