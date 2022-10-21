import { calendar_v3, google } from 'googleapis'
import { v4 as uuidv4 } from 'uuid'
import dotenv from 'dotenv'
import chalk from 'chalk'

import { GaxiosResponse } from 'gaxios'
import { CustomApiCall, DefaultApiCall } from './types.js'
import { useCache } from './useCache.js'

dotenv.config()
const SCOPES = 'https://www.googleapis.com/auth/calendar'
const { loadCache, saveCache } = useCache()

const calendar = google.calendar({
  version: 'v3',
  auth: new google.auth.JWT(process.env.GOOGLE_API_CLIENT_MAIL, undefined, process.env.GOOGLE_PRIVATE_KEY, SCOPES),
})

export const useCalendar = () => {
  // api
  const getCalendarEvent = async (calendarId: string, eventId: string) => {
    return await calendar.events.get({
      calendarId: calendarId,
      eventId: eventId,
    })
  }

  const updateCalendarInstance: CustomApiCall = (sync, event, callback) => {
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

  const insertCalendarEvent: CustomApiCall = (sync, event, callback) => {
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

  const updateCalendarEvent: CustomApiCall = (sync, event, callback) => {
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

  const deleteCalendarEvent: DefaultApiCall = (sync, event, callback) => {
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

  const getMinTime = () => {
    const now = new Date()
    now.setDate(now.getDate())
    return now.toISOString()
  }

  const getEvents = async (calendarId: string) => {
    let result: GaxiosResponse<calendar_v3.Schema$Events>

    const cache = loadCache()
    if (cache.calendars[calendarId].nextSyncToken !== undefined) {
      // nth request for this source calendar
      try {
        result = await calendar.events.list({
          calendarId: calendarId,
          syncToken: cache.calendars[calendarId].nextSyncToken,
        })
      } catch(error) {
        if (error.response.data && error.response.data.error.errors[0].reason === 'fullSyncRequired') {
          // sync token invalid --> reset cache
          cache.calendars[calendarId].nextSyncToken = undefined
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

    cache.calendars[calendarId].nextSyncToken = result.data.nextSyncToken
    saveCache(cache)

      // ignore events that were created by CalSync
    return result.data.items.filter(event => {
      if (!event.creator) return true
      return event.creator.email !== process.env.GOOGLE_API_CLIENT_MAIL
    })
  }

  return {
    getCalendarEvent,
    updateCalendarInstance,
    insertCalendarEvent,
    updateCalendarEvent,
    deleteCalendarEvent,
    registerWebhook,
    getEvents
  }
}
