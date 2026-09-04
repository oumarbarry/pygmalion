import { nanoid } from 'nanoid'

/** Prefixed, URL-safe id: `pygId('prod') -> 'prod_V1StGXR8_Z5jdHi6B'`. */
export function pygId(prefix: string): string {
  return `${prefix}_${nanoid()}`
}
