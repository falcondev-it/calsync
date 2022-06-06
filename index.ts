import fastify from "fastify"
import axios, { Axios } from "axios"

const token = `Bearer ${process.env.ACCESS_TOKEN}`
const authHeaders = { 'Authorization': token }

const app = fastify({
  logger: true
})

app.all('/', (req, res) => {
  console.log(req.body)
  res.code(200).send()
})

app.post('/notifications', async (req, res) => {
  console.log('getting last updated event')

  const updatedDate = (new Date(((new Date()).getTime() - 10000))).toISOString()
  console.log(updatedDate)

  const { data } = await axios.get(`https://www.googleapis.com/calendar/v3/calendars/${process.env.CALENDAR_ID}/events?orderBy=updated&maxResults=10&updatedMin=${updatedDate}`, { headers: authHeaders })

  const lastItem = data.items[data.items.length - 1]

  res.code(200).send()
})


app.listen(3000)