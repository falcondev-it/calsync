export type Config = {
  clientMail: string
  receiverWebhookURL: string
  port: number
  initialLastDaysToSync: number
  users: Record<string, Array<SyncConfig>>
}

export type SyncConfig = {
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
