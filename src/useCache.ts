import fs from 'fs'
import dotenv from 'dotenv'
import { Cache } from './types'

dotenv.config()

const initialCache = {
  webhookUrl: "",
  calendars: {},
}

export const useCache = () => {

  const clearCache = () => {
    fs.writeFileSync(process.env.CALENDAR_CACHE_PATH, JSON.stringify(initialCache))
  }

  const loadCache = () => {
    return JSON.parse(fs.readFileSync(process.env.CALENDAR_CACHE_PATH, 'utf8')) as Cache
  }

  const saveCache = (cache: Cache) => {
    fs.writeFileSync(process.env.CALENDAR_CACHE_PATH, JSON.stringify(cache))
  }

  if (!fs.existsSync(process.env.CALENDAR_CACHE_PATH)) clearCache()

  return { loadCache, saveCache, clearCache }
}