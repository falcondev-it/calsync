export type Config = {
  clientMail: string;
  initialLastDaysToSync: number
  pollingInterval: number
  users: Record<string, Array<UserConfig>>
}

type UserConfig = {
  sources: Array<string>
  target: string
  eventSummary: string
}

// export type SyncTokenCache = {
//   syncTokens: Array<SyncToken>
// }

// type SyncToken = {
//   string: string
// }