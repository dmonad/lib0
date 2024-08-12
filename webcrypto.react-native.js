// @ts-ignore
import webcrypto from 'isomorphic-webcrypto'

webcrypto.ensureSecure()

export const subtle = webcrypto.subtle
export const getRandomValues = webcrypto.getRandomValues.bind(webcrypto)
