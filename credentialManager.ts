import type { Credentials } from 'google-auth-library'
import { Database, open } from 'sqlite'
import sqlite3 from 'sqlite3'
import { TokenRecord } from './types'

let db: Database;

export async function initDB() {
  db = await open({
    filename: './data.sqlite',
    driver: sqlite3.Database
  })
}

export async function getTokens(authName: string) {
  return db.get('SELECT * FROM auth WHERE authname = :authName', { authName }) as Promise<TokenRecord>
}

export async function setTokens(authName: string, tokens: Credentials) {
  console.log('saving tokens for', authName, { tokens })
  db.run('UPDATE accessToken = :accessToken, refreshToken = :refreshToken', { accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
}

// export async function getAuth(userName: string) {
//   const data = await db.all(`SELECT * FROM auth WHERE user = :userName`, { userName })

// }