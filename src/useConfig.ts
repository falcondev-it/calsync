import { UserConfig, SyncConfig, Config } from './types.js'

export const useConfig = () => {
  const users: Array<UserConfig> = []
  const syncs: Array<SyncConfig> = []
  const sources: Array<string> = []

  const config = JSON.parse(process.env.CONFIG.replaceAll('\\', '')) as Config

  for (const user of config.users) {
    users.push(user)

    for (const sync of user.syncs) {
      syncs.push(sync)

      for (const source of sync.sources) {
        sources.push(source)
      }
    }
  }

  return { config, syncs, sources, users }
}
