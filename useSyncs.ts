import { SyncConfig } from './types'
import { useConfig } from './useConfig'

const config = useConfig()

export const useSyncs = () => {
  const syncs: Array<SyncConfig> = []
  const sources: Array<string> = []

  for (const user in config.users) {
    for (const sync of config.users[user]) {
      syncs.push(sync)

      for (const source of sync.sources) {
        sources.push(source)
      }
    }
  }

  return { syncs, sources }
}
