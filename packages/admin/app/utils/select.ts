/**
 * Reka UI (behind `USelect`) throws — and takes the whole page down with a
 * 500 — as soon as a `SelectItem` carries `value=""`: the empty string is
 * reserved for "nothing selected, show the placeholder".
 *
 * Screens that need an explicit "Tous" / "Aucun" row (a filter reset, an
 * optional parent, an optional default) use this sentinel as that row's
 * value and translate it back to `''` / `null` at the API boundary.
 */
export const SELECT_NONE = '__none__'

/** Sentinel -> the value an API expects for "not set". */
export function selectValue(value: string): string {
  return value === SELECT_NONE ? '' : value
}
