import fastify from 'fastify'
import { google } from 'googleapis'
import * as fs from 'fs'
import * as yml from 'yaml'

import { Config/*, SyncTokenCache */ } from './types'

// TODO: make type-safe

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const GOOGLE_PRIVATE_KEY = './calsync-private-key.pem';
const CONFIG_FILE = './config.yml';
const SYNC_TOKENS_CACHE = './syncTokenCache.json';

const configFile = fs.readFileSync(CONFIG_FILE, 'utf8')
const config = yml.parse(configFile) as Config

const syncTokenCache = fs.readFileSync(SYNC_TOKENS_CACHE, 'utf8')
const syncTokens = JSON.parse(syncTokenCache)

// TODO: make separate jwtClient for source and target calendar
const jwtClient = new google.auth.JWT(config.clientMail, GOOGLE_PRIVATE_KEY, undefined, SCOPES);
const calendar = google.calendar({ version: 'v3', auth: jwtClient });

const getMinTime = () => {
  const now = new Date()
  now.setDate(now.getDate() - config.initialLastDaysToSync)
  return now.toISOString()
}

const getEvents = async (calendarId: string) => {
  let result: any

  if (syncTokens[calendarId]) {
    // nth request for this source calendar
    console.log('polling with sync token', syncTokens[calendarId])
    result = await calendar.events.list({
      calendarId: calendarId,
      syncToken: syncTokens[calendarId],
      maxResults: 10, // TODO: Pagination
    })
  } else {
    // first request for this source calendar
    console.log('first polling')
    result = await calendar.events.list({
      calendarId: calendarId,
      maxResults: 10, // TODO: Pagination
      timeMin: getMinTime(),
    })
  }

  syncTokens[calendarId] = result.data.nextSyncToken
  fs.writeFileSync('./syncTokenCache.json', JSON.stringify(syncTokens))
  console.log(result.data.items)
  return result.data.items
}

const syncEvents = async () => {
  // iterate over all users and sync all events

  for (const user in config.users) {
    for (const sync of config.users[user]) {
      for (const source of sync.sources) {

        // get added events since last polling
        const events = await getEvents(source)

        // add events to target calendar
        for (const event of events) {
          if (event.status === 'confirmed') {
            // insert new event

            calendar.events.insert({
              calendarId: sync.target,
              requestBody: {
                summary: sync.eventSummary,
                start: event.start,
                end: event.end,
                id: event.id,
              }
            }, (error: any, _: any) => {
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
                    }
                  })  
                } else {
                  console.log(error)
                }
              }
            })
          } else if (event.status === 'cancelled') {
            // delete event

            calendar.events.delete({
              calendarId: sync.target,
              eventId: event.id,
            }, (error: any, _: any) => {
              if (error) {
                console.log(error)
              }
            })
          }
        }
      }
    }
  }
}

(
  //main
  async () => {
    console.log("starting Calsync...")
    console.log("Add the Calsync client mail to your source and target calendars as a guest:", config.clientMail)

    const app = fastify()

    setInterval(async () => {
      await syncEvents()
    }, config.pollingInterval * 1000);

    await syncEvents()

    app.listen({ port: 3000 })
  }
)()