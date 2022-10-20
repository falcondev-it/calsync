import fs from 'fs'
import dotenv from 'dotenv'
import { CalendarCacheEntry } from './types'

dotenv.config()

export const useCache = () => {
  if (!fs.existsSync(process.env.CALENDAR_CACHE_PATH)) {
    fs.writeFileSync(process.env.CALENDAR_CACHE_PATH, '{}')
  }

  const loadCache = () => {
    return JSON.parse(fs.readFileSync(process.env.CALENDAR_CACHE_PATH, 'utf8'))
  }

  const saveCache = (cache: CalendarCacheEntry[]) => {
    fs.writeFileSync(process.env.CALENDAR_CACHE_PATH, JSON.stringify(cache))
  }

  return { loadCache, saveCache }
}