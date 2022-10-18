import * as fs from 'fs'
import * as yml from 'yaml'

import { SyncConfig, Config } from './types'
import { CONFIG_FILE } from './globals'

export const useConfig = () => {
  const users: Array<string> = []
  const syncs: Array<SyncConfig> = []
  const sources: Array<string> = []

  const configFile = fs.readFileSync(CONFIG_FILE, 'utf8')
  const config = yml.parse(configFile) as Config

  for (const user in config.users) {
    for (const sync of config.users[user]) {
      users.push(user)
      syncs.push(sync)

      for (const source of sync.sources) {
        sources.push(source)
      }
    }
  }

  return { config, syncs, sources, users }
}
