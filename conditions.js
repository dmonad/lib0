
/**
 * @template T
 * @param {T|null|undefined} v
 * @return {T|null}
 */
export const undefinedToNull = v => v === undefined ? null : v
