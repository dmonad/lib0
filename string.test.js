import * as string from './string.js'
import * as t from './testing.js'

export const testLowercaseTransformation = () => {
  t.compareStrings(string.fromCamelCase('ThisIsATest', ' '), 'this is a test')
  t.compareStrings(string.fromCamelCase('Testing', ' '), 'testing')
  t.compareStrings(string.fromCamelCase('testingThis', ' '), 'testing this')
  t.compareStrings(string.fromCamelCase('testYAY', ' '), 'test y a y')
}
