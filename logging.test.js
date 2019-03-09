
import * as log from './logging.js'

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
}
