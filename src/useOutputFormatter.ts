import chalk from 'chalk'

export const useOutputFormatter = () => {

  const handleJob = async (name: string, fn: () => Promise<any>) => {
    console.log(`${name}... `)
    await fn().then(() => {
      console.log(chalk.green('done\n'))
    }).catch((error: Error) => {
      console.log(chalk.red('failed\n'))
      console.log(error)
    })
  }


  return { handleJob }
}