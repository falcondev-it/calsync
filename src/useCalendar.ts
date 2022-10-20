import { calendar_v3, google } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
import chalk from 'chalk'

import { useCache } from './useCache.js'
import { useConfig } from './useConfig.js'
import { useQueue } from './useQueue.js'
import { useOutputFormatter } from './useOutputFormatter.js'
import { CalendarCacheEntry, CustomApiCall, DefaultApiCall, SyncConfig } from './types.js'
import { GaxiosResponse } from 'gaxios'

dotenv.config()
const SCOPES = 'https://www.googleapis.com/auth/calendar'
const { loadCache, saveCache } = useCache()
const { syncs, users } = useConfig()
const { queue } = useQueue()
const { handleJob } = useOutputFormatter()

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

  const syncEvent = async (source: string, sync: SyncConfig, event: calendar_v3.Schema$Event) => {
    if (event.status === 'confirmed') {
      // insert new event

      if (event.recurringEventId) {
        updateInstance(sync, event, (error, _) => {
          if (error && error.response.data) {
            console.log(chalk.red('creation failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
            console.log(chalk.red('Error: ' + error.response.data.error.errors[0].reason))
          } else if (error) {
            console.log(error)
          } else {
            console.log(chalk.green('--> created instance') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
          }
        })
        return
      }

      insertEvent(sync, event, (error, _) => {
        if (error && error.response.data) {
          if (error.response.data.error.errors[0].reason === 'duplicate') {
            // event already exists --> try to update event

            updateEvent(sync, event, (error, _) => {
              if (error && error.response.data) {
                console.log(chalk.red('update failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
                console.log(chalk.bgRed('Error: ' + error.response.data.error.errors[0].reason))
              } else if (error) {
                console.log(error)
              } else {
                console.log(chalk.yellow('--> updated event') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
              }
            })
          }
        } else if (error && error.response.data) {
          console.log(chalk.red('creation failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
          console.log(chalk.bgRed('Error: ' + error.response.data.error.errors[0].reason))
        } else if (error) {
          console.log(error)
        } else {
          console.log(chalk.green('--> created event') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
        }
      })
      return

    } else if (event.status === 'cancelled') {
      // delete event

      deleteEvent(sync, event, (error, _) => {
        if (error) {
          console.log(chalk.red('deletion failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
          console.log(error)
        } else {
          console.log(chalk.red('--> deleted event') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
        }
      })
    }
  }

  const getMinTime = () => {
    const now = new Date()
    now.setDate(now.getDate())
    return now.toISOString()
  }

  const fetchAllEvents = async () => {
    for (const user of users) {
      await handleJob(`fetching calendars for user ${user.name}`, async () => {
        for (const sync of user.syncs) {
          await fetchEventsFromSync(sync)
        }
      })
    }
  }

  const fetchEventsFromSync = async (sync: SyncConfig) => {
    for (const source of sync.sources) {
      await fetchEventsFromSource(source, sync)
    }
  }

  const fetchEventsFromSource = async (source: string, sync: SyncConfig | undefined = undefined) => {
    if (!sync) {
      sync = syncs.find(sync => sync.sources.includes(source))
    }

    if (!sync) {
      console.log(chalk.red('no sync found for source ' + source))
      return
    }

    const events = await getEvents(source)

    // send events to queue
    for (const event of events) {
      await queue.add(event.id, { source, sync, event }, { removeOnComplete: true })
      console.log(chalk.gray(`<-- event queued from ${source}`))
    }
  }

  const getEvents = async (calendarId: string) => {
    let result: GaxiosResponse<calendar_v3.Schema$Events>

    let cache = loadCache()
    if (cache[calendarId].nextSyncToken !== undefined) {
      // nth request for this source calendar
      try {
        result = await calendar.events.list({
          calendarId: calendarId,
          syncToken: cache[calendarId].nextSyncToken,
        })
      } catch(error) {
        if (error.response.data && error.response.data.error.errors[0].reason === 'fullSyncRequired') {
          // sync token invalid --> reset cache
          cache[calendarId].nextSyncToken = undefined
          saveCache(cache)
          return await getEvents(calendarId)
        }
      }
    } else {
      // first request for this source calendar

      result = await calendar.events.list({
        calendarId: calendarId,
        timeMin: getMinTime(),
      })

      console.log(chalk.yellow('✨ got response') + ' from calendar ' + chalk.gray(calendarId))
    }

    cache[calendarId].nextSyncToken = result.data.nextSyncToken
    saveCache(cache)

    // ignore events that were created by CalSync
    return result.data.items.filter(event => event.creator.email !== process.env.GOOGLE_API_CLIENT_MAIL)
  }

  const isOutdated = (source: CalendarCacheEntry) => {
    const expirationDate = new Date(source.expirationDate)
    const hoursLeft = (expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)

    return hoursLeft < 24
  }

  const checkExpirationDates = async () => {
    await handleJob('checking expiration dates', async () => {
      let cache = loadCache()
      for (const key of Object.keys(cache)) {

        if (isOutdated(cache[key])) {
          // update webhook
          const { channel, expirationDate } = await registerWebhook(key)
          cache[key].channel = channel
          cache[key].expirationDate = expirationDate
          saveCache(cache)
          console.log('updated webhook for calendar ' + chalk.gray(key))
        }
      }
    })
  }

  return { registerWebhook, getEvents, fetchAllEvents, fetchEventsFromSync, fetchEventsFromSource, syncEvent, checkExpirationDates, isOutdated }
}
