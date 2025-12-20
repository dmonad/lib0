/**
 * @template T
 * @template Then
 * @template Else
 * @typedef {0 extends (1 & T) ? Then : Else} TypeIsAny
 */

/**
 * Resolve a type with all sub-properties. Useful for returning prettified results.
 * @template T
 * @template {number} [Depth=10]
 * @template {any[]} [Cache=[]]
 * @typedef {Cache['length'] extends Depth ? T : T extends object ? { [K in keyof T]: Prettify<T[K], Depth, [any, ...Cache]> } & {} : T} Prettify
 */

/**
 * @template {true} C
 * @typedef {C} Assert
 */

/**
 * @template A
 * @template B
 * @typedef {(<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false} Equal
 */

/**
 * @template {B} A
 * @template B
 * @typedef {A} AssertExtends
 */
