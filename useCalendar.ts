import { google } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'
import * as fs from 'fs'

import { useConfig } from './useConfig'
import { useSyncs } from './useSyncs'
import { SyncConfig } from './types'
import { GOOGLE_PRIVATE_KEY, SCOPES, CALENDAR_CACHE_FILE } from './globals'

const config = useConfig()
const { syncs } = useSyncs()

const jwtClient = new google.auth.JWT(config.clientMail, GOOGLE_PRIVATE_KEY, undefined, SCOPES)
const calendar = google.calendar({ version: 'v3', auth: jwtClient })

const calendarCacheFile = fs.readFileSync(CALENDAR_CACHE_FILE, 'utf8')
let calendarCache = JSON.parse(calendarCacheFile)

export const useCalendar = () => {
  // TODO: error handling
  const registerWebhook = async (calendarId: string) => {
    console.log('registering webhook for calendar', calendarId)
    const result: any = await calendar.events.watch({
      calendarId: calendarId,
      requestBody: {
        id: uuidv4(),
        type: 'web_hook',
        address: config.receiverWebhookURL,
      },
    })

    return {
      channel: result.data.id,
      expirationDate: new Date(parseInt(result.data.expiration)).toISOString(),
    }
  }

  const handleWebhook = async (response: any) => {
    // extract channel uuid from notification
    const channelId = response.headers['x-goog-channel-id']

    // find corresponding source calendar
    const source = Object.keys(calendarCache).find(
      (calendarId) => calendarCache[calendarId].channel === channelId
    )

    // find syncConfig for source calendar
    for (const sync of syncs) {
      if (sync.sources.includes(source)) {
        // sync events
        console.log(source)
        await syncEvents(sync, source)
      }
    }
  }

  const syncEvents = async (sync: SyncConfig, source: string | undefined) => {
    const sources = source ? [source] : sync.sources

    for (const src of sources) {
      // get added events since last sync
      const events = await getEvents(src)

      // add events to target calendar
      for (const event of events) {
        if (event.status === 'confirmed') {
          // insert new event

          calendar.events.insert(
            {
              calendarId: sync.target,
              requestBody: {
                summary: sync.eventSummary,
                start: event.start,
                end: event.end,
                id: event.id,
              },
            },
            (error: any, _: any) => {
              if (error) {
                if (error.errors[0].reason === 'duplicate') {
                  // event already exists
                  // --> try to update event with update

                  calendar.events.update({
                    calendarId: sync.target,
                    eventId: event.id,
                    requestBody: {
                      summary: sync.eventSummary,
                      start: event.start,
                      end: event.end,
                    },
                  })
                } else {
                  console.log(error)
                }
              }
            }
          )
        } else if (event.status === 'cancelled') {
          // delete event

          calendar.events.delete(
            {
              calendarId: sync.target,
              eventId: event.id,
            },
            (error: any, _: any) => {
              if (error) {
                console.log(error)
              }
            }
          )
        }
      }
    }
  }

  const getMinTime = () => {
    const now = new Date()
    now.setDate(now.getDate() - config.initialLastDaysToSync)
    return now.toISOString()
  }

  const getEvents = async (calendarId: string) => {
    let result: any

    if (calendarCache[calendarId].nextSyncToken) {
      // nth request for this source calendar
      console.log('polling with sync token', calendarCache[calendarId].nextSyncToken)
      result = await calendar.events.list({
        calendarId: calendarId,
        syncToken: calendarCache[calendarId].nextSyncToken,
      })
    } else {
      // first request for this source calendar
      console.log('first polling')
      result = await calendar.events.list({
        calendarId: calendarId,
        timeMin: getMinTime(),
      })
    }

    calendarCache[calendarId].nextSyncToken = result.data.nextSyncToken
    fs.writeFileSync(CALENDAR_CACHE_FILE, JSON.stringify(calendarCache))
    return result.data.items
  }

  const checkExpirationDates = async () => {
    calendarCache = JSON.parse(calendarCacheFile)
    for (const key of Object.keys(calendarCache)) {
      const expirationDate = new Date(calendarCache[key].expirationDate)
      const hoursLeft = (expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)
      console.log('hours left for', key, hoursLeft)

      if (hoursLeft < 24) {
        // renew webhook
        const { channel, expirationDate } = await registerWebhook(key)
        calendarCache[key].channel = channel
        calendarCache[key].expirationDate = expirationDate
        fs.writeFileSync(CALENDAR_CACHE_FILE, JSON.stringify(calendarCache))
      }
    }
  }

  return { registerWebhook, handleWebhook, checkExpirationDates }
}
