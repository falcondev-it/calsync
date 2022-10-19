import { calendar_v3 } from "googleapis"
import { GaxiosError, GaxiosResponse } from "gaxios"
import { BodyResponseCallback } from "googleapis/build/src/apis/abusiveexperiencereport"

export type Config = {
  clientMail: string
  receiverWebhookURL: string
  port: number
  users: Record<string, Array<SyncConfig>>
}

export type SyncConfig = {
  sources: Array<string>
  target: string
  eventSummary: string
}

// type CalendarCache = Record<string, CalendarCacheEntry>

export type CalendarCacheEntry = {
  channel: string,
  expirationDate: string,
  nextSyncToken: string,
}

type ApiCallback<T = any> = (err: GaxiosError<T> | null, res?: GaxiosResponse<T> | null) => void
type SchemaErrorEvent = calendar_v3.Schema$Event
  & { error: { errors: Array<calendar_v3.Schema$Error & { message: string }> }}

export type CustomApiCall = (
  sync: SyncConfig,
  event: calendar_v3.Schema$Event,
  callback: ApiCallback<calendar_v3.Schema$Event | void> | ApiCallback<SchemaErrorEvent>,
) => void

export type DefaultApiCall = (
  sync: SyncConfig,
  event: calendar_v3.Schema$Event,
  callback: BodyResponseCallback<void>
) => void