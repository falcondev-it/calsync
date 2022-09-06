import fastify from 'fastify'
import { google } from 'googleapis'
import dotenv from 'dotenv'

const SCOPES = 'https://www.googleapis.com/auth/calendar';
const BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/';
const GOOGLE_PRIVATE_KEY = './calsync-private-key.pem';

const POLLING_INTERVAL = 1000 * 60;
let nextSyncToken: any = null; // TODO: load from db for specific calendar

// TODO: make seperate jwtclient for source and target calendar
dotenv.config()
const jwtClient = new google.auth.JWT(process.env.GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, undefined, SCOPES);
const calendar = google.calendar({ version: 'v3', auth: jwtClient });

const getEvents = async (calendarId: any) => {
  let result: any

  if (nextSyncToken) {
    // nth request for this source calendar
    console.log('polling with sync token', nextSyncToken)
    result = await calendar.events.list({
      calendarId: calendarId,
      syncToken: nextSyncToken,
      maxResults: 10, // TODO: Pagination
    })
  } else {
    // first request for this source calendar
    console.log('first polling')
    result = await calendar.events.list({
      calendarId: calendarId,
      maxResults: 10, // TODO: Pagination
      timeMin: (new Date()).toISOString(),
    })
  }

  nextSyncToken = result.data.nextSyncToken
  return result.data.items
}

const syncEvents = async () => {
  // get added events since last polling
  const events = await getEvents(process.env.GOOGLE_SOURCE_CALENDAR_ID)

  // add events to target calendar
  for (const event of events) {
    calendar.events.insert({
      calendarId: process.env.GOOGLE_TARGET_CALENDAR_ID,
      requestBody: {
        summary: 'Busy',
        start: event.start,
        end: event.end,
        id: event.id, // TODO: already existing events dont't need to be added
      }
    }, (error: any, _:any) => {
      if (error) {
        console.error(error)
      }
    })
  }
}

(
  //main
  async () => {
    const app = fastify()

    setInterval(async () => {
      await syncEvents()
    }, POLLING_INTERVAL);

    await syncEvents()

    if (existing) {
      if (updatedEvent.status == 'cancelled')
        calendar.deleteEvent(process.env.TARGET_ID, existing.id)

      else
        calendar.updateEvent(process.env.TARGET_ID, {
          summary: updatedEvent.summary,
          start: updatedEvent.start,
          end: updatedEvent.end,
          id: existing.id,
          description: updatedEvent.id
        })

    app.listen({ port: 3000 }, () => console.log('Listening on port 3000!'))
  }
)()