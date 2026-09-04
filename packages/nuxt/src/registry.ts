/**
 * Build-time collectors for the pygmalion:* extension hooks. Drizzle tables and
 * provider factories are live JS objects (they can't be serialized into a template), so
 * modules contribute *import specifiers* (a package subpath or an absolute file
 * path) to a module that exports the tables / provider descriptors. A generated
 * template re-imports and merges them for the Nitro runtime.
 */
export interface SpecifierRegistry {
  add(specifier: string): void
  readonly specifiers: readonly string[]
}

export function createSpecifierRegistry(initial: string[] = []): SpecifierRegistry {
  const specifiers: string[] = []
  const seen = new Set<string>()
  const add = (specifier: string) => {
    if (seen.has(specifier)) return
    seen.add(specifier)
    specifiers.push(specifier)
  }
  initial.forEach(add)
  return {
    add,
    get specifiers() {
      return specifiers
    },
  }
}

/** Module merging every `export const <table>` (namespace) into one `schema`. */
export function renderSchemaTemplate(specifiers: readonly string[]): string {
  const imports = specifiers.map((s, i) => `import * as _s${i} from ${JSON.stringify(s)}`)
  const spread = specifiers.map((_, i) => `..._s${i}`).join(', ')
  return `${imports.join('\n')}\nexport const schema = { ${spread} }\n`
}

/** Module flattening every default-exported `ProviderDescriptor[]` into one list. */
export function renderProvidersTemplate(specifiers: readonly string[]): string {
  const imports = specifiers.map((s, i) => `import _p${i} from ${JSON.stringify(s)}`)
  const spread = specifiers.map((_, i) => `..._p${i}`).join(', ')
  const body = specifiers.length ? ` ${spread} ` : ''
  return `${imports.join('\n')}\nexport const providerDescriptors = [${body}]\n`
}

/**
 * Module merging every default-exported `Partial<BetterAuthOptions>` into one
 * object (the `customerAuth` extension point, see `utils/customer-auth.ts`).
 * Shallow-merged in registration order, later specifiers win: the same
 * last-write-wins rule a plain `{ ...a, ...b }` would give the framework's
 * user for e.g. `socialProviders` or `plugins`.
 */
export function renderCustomerAuthOptionsTemplate(specifiers: readonly string[]): string {
  const imports = specifiers.map((s, i) => `import _o${i} from ${JSON.stringify(s)}`)
  const spread = specifiers.map((_, i) => `..._o${i}`).join(', ')
  return `${imports.join('\n')}\nexport const customerAuthOptions = { ${spread} }\n`
}
