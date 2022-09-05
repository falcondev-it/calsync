export type Config = {
  users: Record<string, { syncs: Array<SyncConfig> }>
}

type SyncConfig = {
  source: string,
  target: string,
  authName?: string,
  private?: boolean,
  color?: string,
  text?: string
}

export type TokenRecord = {
  user: string,
  authname: string,
  accessToken: string,
  refreshToken: string
}