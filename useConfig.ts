import * as fs from 'fs'
import * as yml from 'yaml'

import { Config } from './types'

const CONFIG_FILE = './config.yml'


export const useConfig = () => {
  const configFile = fs.readFileSync(CONFIG_FILE, 'utf8')
  const config = yml.parse(configFile) as Config

  return config
}

