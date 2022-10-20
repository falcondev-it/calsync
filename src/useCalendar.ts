import { calendar_v3, google } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
import chalk from 'chalk'

import { useCache } from './useCache.js'
import { CalendarCacheEntry, CustomApiCall, DefaultApiCall, SyncConfig } from './types.js'
import { GaxiosResponse } from 'gaxios'

dotenv.config()
const SCOPES = 'https://www.googleapis.com/auth/calendar'
const { loadCache, saveCache } = useCache()

const calendar = google.calendar({
  version: 'v3',
  auth: new google.auth.JWT(process.env.GOOGLE_API_CLIENT_MAIL, undefined, process.env.GOOGLE_PRIVATE_KEY, SCOPES),
})

export const useCalendar = () => {
  // api
  const updateInstance: CustomApiCall = (sync, event, callback) => {
    calendar.events.update({
      calendarId: sync.target,
      eventId: event.id,
      requestBody: {
        summary: sync.eventSummary,
        start: event.start,
        end: event.end,
        recurrence: event.recurrence,
        recurringEventId: event.recurringEventId,
      },
    }, callback)
  }

  const insertEvent: CustomApiCall = (sync, event, callback) => {
    calendar.events.insert({
      calendarId: sync.target,
      requestBody: {
        summary: sync.eventSummary,
        start: event.start,
        end: event.end,
        id: event.id,
        recurrence: event.recurrence,
      },
    }, callback)
  }

  const updateEvent: CustomApiCall = (sync, event, callback) => {
    calendar.events.update({
      calendarId: sync.target,
      eventId: event.id,
      requestBody: {
        summary: sync.eventSummary,
        start: event.start,
        end: event.end,
        recurrence: event.recurrence,
        recurringEventId: event.recurringEventId,
      },
    }, callback)
  }

  const deleteEvent: DefaultApiCall = (sync, event, callback) => {
    calendar.events.delete({
      calendarId: sync.target,
      eventId: event.id,
    }, callback)
  }


  // TODO: error handling
  const registerWebhook = async (calendarId: string) => {
    const result = await calendar.events.watch({
      calendarId: calendarId,
      requestBody: {
        id: uuidv4(),
        type: 'web_hook',
        address: process.env.WEBHOOK_RECEIVER_URL,
      },
    })

    return {
      channel: result.data.id,
      expirationDate: new Date(parseInt(result.data.expiration)).toISOString(),
    }
  }

  const setReady = (mode: boolean) => {
    isReady = mode
  }

  const handleWebhook = async (response: FastifyRequest) => {
    if (!isReady) return

    // extract channel uuid from notification
    const channelId = response.headers['x-goog-channel-id']

    // find corresponding source calendar
    calendarCache = JSON.parse(fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8'))
    const source = Object.keys(calendarCache).find(
      (calendarId) => calendarCache[calendarId].channel === channelId
    )

    // find syncConfig for source calendar
    for (const sync of syncs) {
      if (sync.sources.includes(source)) {
        // sync events
        await syncEvents(sync, source)
      }
    }
  }

  const syncEvents = async (sync: SyncConfig, source: string | undefined = undefined) => {
    const sources = source ? [source] : sync.sources

    for (const src of sources) {
      // get added events since last sync
      const events = await getEvents(src)

      // add events to target calendar
      for (const event of events) {
        if (event.status === 'confirmed') {
          // insert new event

          if (event.recurringEventId) {
            updateInstance(sync, event, (error, _) => {
              if (!error) {
                console.log(chalk.green('created instance') + ' @ ' + chalk.gray(src + ' -> ' + sync.target))
              }
            })
            return
          }

          insertEvent(sync, event, (error, _) => {
            console.log(JSON.stringify(error))
            if (error && error.response.data) {
              if (error.response.data.error.errors[0].reason === 'duplicate') {
                // event already exists --> try to update event

                updateEvent(sync, event, (error, _) => {
                  if (!error) {
                    console.log(chalk.yellow('updated event') + ' @ ' + chalk.gray(src + ' -> ' + sync.target))
                  }
                })
              } else { console.log(error) }
            } else {
              console.log(chalk.green('created event') + ' @ ' + chalk.gray(src + ' -> ' + sync.target))
            }
          })
          return

        } else if (event.status === 'cancelled') {
          // delete event

          deleteEvent(sync, event, (error, _) => {
            if (error) {
              console.log(error)
            } else {
              console.log(chalk.red('deleted event') + ' @ ' + chalk.gray(src + ' -> ' + sync.target))
            }
          })
        }
      }
    }
  }

  const getMinTime = () => {
    const now = new Date()
    now.setDate(now.getDate())
    return now.toISOString()
  }

  const getEvents = async (calendarId: string) => {
    let result: GaxiosResponse<calendar_v3.Schema$Events>

    let cache = loadCache()
    if (cache[calendarId].nextSyncToken !== undefined) {
      // nth request for this source calendar
      result = await calendar.events.list({
        calendarId: calendarId,
        syncToken: cache[calendarId].nextSyncToken,
      })
    } else {
      // first request for this source calendar
      result = await calendar.events.list({
        calendarId: calendarId,
        timeMin: getMinTime(),
      })
    }

    cache[calendarId].nextSyncToken = result.data.nextSyncToken
    saveCache(cache)
    return result.data.items
  }

  const isOutdated = (source: CalendarCacheEntry) => {
    const expirationDate = new Date(source.expirationDate)
    const hoursLeft = (expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)

    return hoursLeft < 24
  }

  const checkExpirationDates = async () => {
    let cache = loadCache()
    for (const key of Object.keys(cache)) {

      if (isOutdated(cache[key])) {
        // update webhook
        const { channel, expirationDate } = await registerWebhook(key)
        cache[key].channel = channel
        cache[key].expirationDate = expirationDate
        saveCache(cache)
      }
    }
  }

  return { registerWebhook, handleWebhook, syncEvents, checkExpirationDates, isOutdated, setReady }
}
