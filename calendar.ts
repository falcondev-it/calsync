import axios from "axios"
import { authHeaders } from "."

const BASE_URL = 'https://www.googleapis.com/calendar/v3/calendars/'
// const apiClient = axios.create({
//   baseURL: BASE_URL,
//   headers: {
//     'Authorization': `Bear`
//   }
// })

export default {
  deleteEvent: async (calendarId: string, eventId: string) => {
    const { status } = await axios.delete(`${BASE_URL}${calendarId}/events/${eventId}`, { headers: authHeaders })
    return status.toString().startsWith('2')
  },
  updateEvent: async (calendarId: string, eventData: CalendarEvent): Promise<boolean> => {
    const { status } = await axios.put(`${BASE_URL}${calendarId}/events/${eventData.id}`, {
      start: { dateTime: eventData.start.dateTime },
      end: { dateTime: eventData.end.dateTime },
      summary: eventData.summary,
      description: eventData.description
    }, { headers: authHeaders })
    return status.toString().startsWith('2')
  },
  createEvent: async (calendarId: string, eventData: CalendarEvent): Promise<boolean> => {
    const { status } = await axios.post(`${BASE_URL}${calendarId}/events`, eventData, { headers: authHeaders })
    return status.toString().startsWith('2')
  },
  getEvent: async (calendarId: string, q?: string): Promise<CalendarEvent | null> => {
    const { data } = await axios.get<{ items: CalendarEvent[] }>(`${BASE_URL}${calendarId}/events`, {
      params: { q },
      headers: authHeaders
    })
    return data.items[0]
  },
  getLastUpdated: async (calendarId: string): Promise<CalendarEvent | null> => {
    const updatedDate = (new Date(((new Date()).getTime() - 10000))).toISOString()

    // get modified event
    const { data } = await axios.get<{ items: CalendarEvent[] }>(`${BASE_URL}${calendarId}/events`, {
      params: { orderBy: 'updated', maxResults: 10, updatedMin: updatedDate },
      headers: authHeaders
    })
    const updatedEvent = data.items[data.items.length - 1]
    return updatedEvent as CalendarEvent
  },
  checkWebhook: async (calendarId: string) => {

  }
}

type CalendarEvent = Partial<{
  id: string,
  status: string,
  start: {
    dateTime: string
  },
  end: {
    dateTime: string
  },
  summary: string,
  description: string
}>