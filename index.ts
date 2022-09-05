import fastify from "fastify"
import dotenv from "dotenv"
import calendar from "./calendar"
import { initDB, getTokens, setTokens } from './credentialManager'
import fs from "fs"
import yml from "yaml"
import type { Config, TokenRecord } from "./types"
import { OAuth2Client } from "google-auth-library"
import { exit } from "process"

export const authHeaders = {}

dotenv.config()

const configFile = fs.readFileSync('./config.yml', 'utf8')
const config = yml.parse(configFile) as Config

const apiClients = new Map<string, OAuth2Client>();

(async () => {
  console.log('opening db')
  initDB()

  console.log('creating oauth clients...')
  for (let user in config.users) {
    for (let syncConfig of config.users[user].syncs) {
      const tokenName = syncConfig.authName ?? `${user}_default`
      if (!apiClients.has(tokenName)) {
        const client = new OAuth2Client()

        client.on('tokens', (tokens) => setTokens(tokenName, tokens))

        const initialTokens = await getTokens(tokenName)

        client.setCredentials({ access_token: initialTokens.accessToken, refresh_token: initialTokens.refreshToken })
      }
    }
  }


  if (1) exit()


  // console.log('checking if all webhooks are installed...')
  // for (let user in config.users) {
  //   for (let syncConfig of config.users[user].syncs) {
  //     const tokenName = syncConfig.authName ?? `${user}_default`
  //     if (!tokens.has(tokenName)) tokens.set(tokenName, await getTokens(tokenName))

  //   }
  // }

  const app = fastify({
    // logger: true
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
})()
