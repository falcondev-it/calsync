
import { calendar_v3 } from 'googleapis'
import chalk from 'chalk'

import { useConfig } from './useConfig.js'
import { useQueue } from './useQueue.js'
import { useCalendar } from './useCalendar.js'
import { useOutputFormatter } from './useOutputFormatter.js'
import { SyncConfig } from './types.js'
import { inspect } from 'util'

const { syncs, users } = useConfig()
const {
  updateCalendarInstance,
  insertCalendarEvent,
  updateCalendarEvent,
  getCalendarEvent,
  deleteCalendarEvent,
  getEvents,
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
    // console.log({
    //   id: event.id,
    //   recurrence: event.recurrence,
    //   recurringEventId: event.recurringEventId,
    //   status: event.status,
    //   organizer: event.organizer
    // })

    let eventId = event.id

    const isSelfCreated = event.organizer && event.organizer.email === source
    const isRecurring = !!event.recurrence
    const isInstance = !!event.recurringEventId
    const isDeleted = event.status === 'cancelled'
    const isPrivate = event.visibility === 'private'
    const isBusy = event.transparency !== 'transparent'

    if ((!isSelfCreated && isRecurring) || (isDeleted && isInstance)) {
      eventId = event.id!.split('_')[0]
    }

    const tmpEvent = {
      ...event,
      id: eventId
    }

    if (!isBusy) {
      console.log(chalk.bgBlue('Info: Event is not busy --> try to delete target event, if it exists'))
      await deleteEvent(sync, tmpEvent, source)
      return
    }

    if (isDeleted) {
      await deleteEvent(sync, tmpEvent, source)
      return
    }

    if (isInstance) {
      updateCalendarInstance(sync, tmpEvent, isPrivate, (error, _)=> {
        if (error && error.response.data) {
          if (error.response.data.error.errors[0].reason === 'notFound') {
            // insert missing recurring parent
            const missingParent = {
              ...event,
              id: event.recurringEventId,
              recurringEventId: undefined,
            }

            syncEvent(source, sync, missingParent)
          } else {
            console.log(chalk.red('creation of instance failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
            console.log(chalk.red('Error: ' + inspect(error.response.data.error.errors[0])))
            console.log(error)
          }
        } else {
          console.log(chalk.green('--> created instance') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
        }
      })
      return
    }

    insertCalendarEvent(sync, tmpEvent, isPrivate, (error, _) => {
      if (error && error.response.data) {
        if (error.response.data.error.errors[0].reason === 'duplicate') {
          // event already exists --> try to update event

          updateCalendarEvent(sync, tmpEvent, isPrivate, (error, _) => {
            if (error && error.response.data) {
              console.log(chalk.red('update failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
              console.log(chalk.bgRed('Error: ' + inspect(error.response.data.error.errors[0])))
            } else if (error) {
              console.log(error)
            } else {
              console.log(chalk.yellow('--> updated event') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
            }
          })
        }
      } else if (error && error.response.data) {
        console.log(chalk.red('creation failed') + ' @ ' + chalk.gray(source) + chalk.red(' -/-> ')  + chalk.gray(sync.target))
        console.log(chalk.bgRed('Error: ' + inspect(error.response.data.error.errors[0])))
      } else if (error) {
        console.log(error)
      } else {
        console.log(chalk.green('--> created event') + ' @ ' + chalk.gray(source + ' -> ' + sync.target))
      }
    })
    return
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
    let jobs = []

    // send events to queue
    for (const event of events) {
      for (const sync of syncsWithSource) {
        jobs.push({name: event.id, data: { source, sync, event }, opts:{ removeOnComplete: true }})
      }
    }

    await queue.addBulk(jobs)
    console.log(chalk.gray(`<-- queued ${jobs.length} jobs from ${source}`))
  }

  return {
    fetchAllEvents,
    fetchEventsFromSync,
    fetchEventsFromSource,
    syncEvent,
  }
}
