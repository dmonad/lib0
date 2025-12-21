import * as log from 'lib0/logging'

export const testLogging = () => {
  log.print(log.BLUE, 'blue ')
  log.print(log.BLUE, 'blue ', log.BOLD, 'blue,bold')
  log.print(log.GREEN, log.RED, 'red ', 'red')
  log.print(log.ORANGE, 'orange')
  log.print(log.BOLD, 'bold ', log.UNBOLD, 'nobold')
  log.print(log.GREEN, 'green ', log.UNCOLOR, 'nocolor')
  log.print('expecting objects from now on!')
  log.print({ 'my-object': 'isLogged' })
  log.print(log.GREEN, 'green ', { 'my-object': 'isLogged' })
  log.print(log.GREEN, 'green ', { 'my-object': 'isLogged' }, 'unformatted')
  log.print(log.BLUE, log.BOLD, 'number', 1)
  log.print(log.BLUE, log.BOLD, 'number', 1, {}, 's', 2)
  log.print({}, 'dtrn')
  log.print(() => [log.GREEN, 'can lazyprint stuff ', log.RED, 'with formatting'])
  log.print(undefined, 'supports undefined')
}

export const testModuleLogger = () => {
  // if you want to see the messages, enable logging: LOG=* npm run test --filter logging
  const mlog = log.createModuleLogger('testing')
  mlog('can print ', log.GREEN, 'with colors')
  mlog(() => ['can lazyprint ', log.GREEN, 'with colors'])
  mlog(undefined, 'supports undefined')
  mlog(() => [undefined, 'supports lazyprint undefined'])
}
