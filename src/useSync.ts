
import { calendar_v3 } from 'googleapis'
import chalk from 'chalk'

import { useConfig } from './useConfig.js'
import { useQueue } from './useQueue.js'
import { useCache } from './useCache.js'
import { useCalendar } from './useCalendar.js'
import { useOutputFormatter } from './useOutputFormatter.js'
import { CalendarCacheEntry, SyncConfig } from './types.js'

const { syncs, users } = useConfig()
const { loadCache, saveCache } = useCache()
const {
  updateCalendarInstance,
  insertCalendarEvent,
  updateCalendarEvent,
  getCalendarEvent,
  deleteCalendarEvent,
  getEvents,
  registerWebhook,
} = useCalendar()
const { queue } = useQueue()
const { handleJob } = useOutputFormatter()

export const useSync = () => {

  const deleteEvent = async (sync: SyncConfig, event: calendar_v3.Schema$Event, source: string) => {
    // check if event to delete was created by CalSync
    const result = await getCalendarEvent(sync.target, event.id)

    if (result.data.creator.email === process.env.GOOGLE_API_CLIENT_MAIL) {
      // delete event
      deleteCalendarEvent(sync, event, (error, _) => {
        if (error) {
          console.log(chalk.red('deletion failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
          console.log(chalk.bgRed('Error: ' + (error as any).errors[0].message))
        } else {
          console.log(chalk.red('--> deleted event') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
        }
      })
    } else {
      console.log(chalk.blue('skipped deletion') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
      console.log(chalk.bgBlue('Info: ' + 'Event was not created by CalSync'))
    }
  }

  const syncEvent = async (source: string, sync: SyncConfig, event: calendar_v3.Schema$Event) => {
    if (event.transparency === 'transparent') {
      // try to delete events of target calendar, if transparency was changed to transparent
      console.log(chalk.bgBlue('Info: Event is not busy --> try to delete target event, if it exists'))
      await deleteEvent(sync, event, source)
      return
    }

    if (event.status === 'confirmed') {
      // insert new event

      if (event.recurringEventId) {
        updateCalendarInstance(sync, event, (error, _) => {
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

      insertCalendarEvent(sync, event, (error, _) => {
        if (error && error.response.data) {
          if (error.response.data.error.errors[0].reason === 'duplicate') {
            // event already exists --> try to update event

            updateCalendarEvent(sync, event, (error, _) => {
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
      await deleteEvent(sync, event, source)
    }
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

  const fetchEventsFromSource = async (source: string, specificSync: SyncConfig | undefined = undefined) => {
    // find all syncs that include the source
    const syncsWithSource = specificSync ? [specificSync] : syncs.filter(sync => sync.sources.includes(source))

    if (syncsWithSource.length === 0) {
      console.log(chalk.red('no sync found for source ' + source))
      return
    }

    const events = await getEvents(source)

    // send events to queue
    for (const event of events) {
      for (const sync of syncsWithSource) {
        await queue.add(event.id, { source, sync, event }, { removeOnComplete: true })
        console.log(chalk.gray(`<-- event queued from ${source}`))
      }
    }
  }

  const isOutdated = (source: CalendarCacheEntry) => {
    const expirationDate = new Date(source.expirationDate)
    const hoursLeft = (expirationDate.getTime() - new Date().getTime()) / (1000 * 60 * 60)

    return hoursLeft < 24
  }

  const checkExpirationDates = async () => {
    await handleJob('checking expiration dates', async () => {
      const cache = loadCache()
      for (const key of Object.keys(cache)) {

        if (isOutdated(cache[key])) {
          // update webhook
          const { channel, expirationDate } = await registerWebhook(key)
          cache.calendars[key].channel = channel
          cache.calendars[key].expirationDate = expirationDate
          saveCache(cache)
          console.log('updated webhook for calendar ' + chalk.gray(key))
        }
      }
    })
  }

  return {
    fetchAllEvents,
    fetchEventsFromSync,
    fetchEventsFromSource,
    syncEvent,
    checkExpirationDates,
    isOutdated
  }
}