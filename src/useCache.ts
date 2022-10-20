import fs from 'fs'
import dotenv from 'dotenv'

dotenv.config()

export const useCache = () => {
  let cache = JSON.parse(fs.readFileSync(process.env.CALENDAR_CACHE_PATH, 'utf8'))

  const loadCache = () => {
    cache = JSON.parse(fs.readFileSync(process.env.CALENDAR_CACHE_PATH, 'utf8'))
  }

  const saveCache = () => {
    fs.writeFileSync(process.env.CALENDAR_CACHE_PATH, JSON.stringify(cache))
  }

  return { cache, loadCache, saveCache }
}