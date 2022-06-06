import fastify from "fastify"
import axios, { Axios } from "axios"
import { config } from "dotenv"
import calendar from "./calendar"
config()

const token = `Bearer ${process.env.ACCESS_TOKEN}`
export const authHeaders = { 'Authorization': token }

const app = fastify({
  logger: true
})

app.all('/', (req, res) => {
  res.code(200).send()
})

app.post('/notifications', async (req, res) => {
  console.log('getting last updated event')

  // get modified event
  const updatedEvent = await calendar.getLastUpdated(process.env.CALENDAR_ID)

  const existing = await calendar.getEvent(process.env.TARGET_ID, updatedEvent.id)

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

  } else {
    calendar.createEvent(process.env.TARGET_ID, {
      summary: updatedEvent.summary,
      start: updatedEvent.start,
      end: updatedEvent.end,
      description: updatedEvent.id
    })
  }

  res.code(200).send()
})


app.listen(3000)