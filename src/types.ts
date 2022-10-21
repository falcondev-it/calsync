import { calendar_v3 } from "googleapis"
import { GaxiosError, GaxiosResponse } from "gaxios"
import { BodyResponseCallback } from "googleapis/build/src/apis/abusiveexperiencereport"

export type SyncConfig = {
  sources: string[]
  target: string
  eventSummary: string
}

export type UserConfig = {
  name: string,
  syncs: SyncConfig[]
}

export type Config = {
  users: UserConfig[]
}

export type Cache = {
  webhookUrl: string,
  calendars: CalendarCacheEntry[]
}

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