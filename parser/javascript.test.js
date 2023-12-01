import * as t from '../testing.js' // eslint-disable-line
import * as jsparser from './javascript.js'
import * as parsing from './parser.js'
// import * as text from '../text.js'

/**
 * @param {t.TestCase} _tc
 */
export const testVariableDeclaration = _tc => {
  const r1 = jsparser.parse('const x = 4')
  const r2 = jsparser.parse('const x = 4')
  console.log(r1)
  console.log(jsparser.parse('const x 4'))
  t.assert(parsing.isError(jsparser.parse('const x 4')))
  t.assert(!parsing.isError(r1))
  t.compare(r1.hash, r2.hash)
  console.log({ hash: r1.hash })
}

/**
 * @param {t.TestCase} _tc
 */
export const testUpdates = _tc => {
  const r1 = jsparser.parse('const x = 4\nconst y = 5')
  console.log(r1)
}

// Idea for annotating an incrementally updatable ast
// /**
//  * @param {t.TestCase} _tc
//  */
// export const testIncrementalUpdate = _tc => {
//   class DeclarationAnnotation {}
//   class VariableUse {}
//   const definitionAnnotation = new Annotation({
//     node: jsparser.Identifier,
//     dependencies = [],
//     do: (path, node) => {
//       path.target // typeof Identifier
//       const declaration = path.findPreviousInScope(p => p.target instanceof jsparser.VariableDeclaration && p.target.id === node.name)
//       declaration.annotate(VariableUse, node)
//       return new DeclarationAnnotation(declaration)
//     }
//   })
//   const variableUseAnnotation = new Annotation({
//     node: jsparser.VariableDeclaration,
//     dependencies = [definitonAnnotation]
//   })
//   const t1 = text.from('const x = 4')
//   const ast = jsparser.ast(t1)
//   ast.on('change', event => {
//     console.log(event)
//   })
//   t1.applyDelta(text.delta().retain(6).insert('y'))
// }

/**
 * # Approach to update an AST tree based on a text-delta.
 *
 * There two ASTs: previous ast `past` and the new ast we want to generate `nast`
 *
 * * start parsing of nast as if we would do a fresh parse.
 * * whenever we want to parse a new node, the `parseNodeHelper` checks if past encodered the same
 *   node at the same position**. If so, we reuse that node and return a successful parse.
 * * (**) we use a `path` to follow along the parsing process in the `past`. We adjust the position
 *   by the delta that was applied.
 *
 */
