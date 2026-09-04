#!/usr/bin/env node
// pygmalion-migrate: production schema tool.
//
// The composed schema only exists inside a Nuxt app: core's tables plus
// whatever every installed module adds through the `pygmalion:schema` hook. So
// this CLI loads the app the way Nuxt does, replays that hook against its own
// registry, imports the collected specifiers, and hands the merged tables to
// drizzle-kit.
//
//   pygmalion-migrate generate [--out FILE]   full DDL, no database needed
//   pygmalion-migrate up [--dry-run]          converge DATABASE_URL onto it
//
// Known ceiling, on purpose: `up` is drizzle-kit's *push* — it introspects the
// live database and emits the statements that close the gap. There is no
// migration history, no versioned files, no down. A rename reads as a drop plus
// a create (data loss), and destructive statements are applied as generated.
// Run `--dry-run` first, back up, then apply. Reviewable migration files are the
// upgrade path the day a schema change needs a human diff.
import { realpathSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import process from 'node:process'

/**
 * stdout, whole. On a pipe (`… | psql`) writes are asynchronous and the kernel
 * buffer holds 64 kB: both `process.exit` and a raw `writeSync` loop drop the
 * tail of a 70 kB script. Waiting for the write callback is the one form that
 * survives.
 */
function writeStdout(text) {
  return new Promise((resolveWrite, reject) => {
    process.stdout.write(text, (error) => (error ? reject(error) : resolveWrite()))
  })
}

/** Replays the `pygmalion:schema` hook of the app at `cwd`, returns the merged tables. */
export async function composeSchema(cwd) {
  const { loadNuxt } = await import('@nuxt/kit')
  const nuxt = await loadNuxt({ cwd, dev: false, ready: true })
  const specifiers = ['@oumarbarry/pygmalion-core/schema']
  const seen = new Set(specifiers)
  try {
    await nuxt.callHook('pygmalion:schema', {
      add: (specifier) => {
        if (seen.has(specifier)) return
        seen.add(specifier)
        specifiers.push(specifier)
      },
      get specifiers() {
        return specifiers
      },
    })
  } finally {
    await nuxt.close()
  }
  // Specifiers are package subpaths OR absolute, extension-less paths to a
  // module's TypeScript file (`createResolver(...).resolve('./schema')`) — the
  // same thing Nuxt itself only reads through jiti.
  const { createJiti } = await import('jiti')
  const jiti = createJiti(pathToFileURL(resolve(cwd, 'index.mjs')).href)
  const modules = await Promise.all(specifiers.map((specifier) => jiti.import(specifier)))
  return { schema: Object.assign({}, ...modules), specifiers }
}

async function main(argv) {
  const command = argv[0]
  const cwdFlag = argv.indexOf('--cwd')
  const outFlag = argv.indexOf('--out')
  const cwd = cwdFlag === -1 ? process.cwd() : resolve(argv[cwdFlag + 1])
  const dryRun = argv.includes('--dry-run')

  if (command !== 'generate' && command !== 'up') {
    console.log(`pygmalion-migrate — Postgres schema for a Pygmalion app

  generate [--out FILE]   Write the full DDL of the composed schema (no DB needed)
  up [--dry-run]          Apply what DATABASE_URL is missing (--dry-run prints only)

  --cwd DIR               App directory (default: current)

'up' converges the live database onto the schema. It keeps no migration history
and no down step: review --dry-run and back up before applying.`)
    return command ? 1 : 0
  }

  const { schema, specifiers } = await composeSchema(cwd)
  console.error(`[pygmalion-migrate] schema from ${specifiers.length} module(s): ${specifiers.join(', ')}`)

  if (command === 'generate') {
    const { generateSchemaSql } = await import('@oumarbarry/pygmalion-core')
    const sql = `${(await generateSchemaSql(schema)).join('\n')}\n`
    if (outFlag === -1) await writeStdout(sql)
    else {
      writeFileSync(resolve(argv[outFlag + 1]), sql)
      console.error(`[pygmalion-migrate] wrote ${argv[outFlag + 1]}`)
    }
    return 0
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('[pygmalion-migrate] DATABASE_URL is required for `up` (dev uses PGlite auto-push instead).')
    return 1
  }
  const { pushDbSchema } = await import('@oumarbarry/pygmalion-core')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const db = drizzle({ connection: databaseUrl })
  try {
    const statements = await pushDbSchema(db, schema, { dryRun })
    if (!statements.length) console.error('[pygmalion-migrate] database already up to date.')
    else {
      await writeStdout(`${statements.join('\n')}\n`)
      console.error(
        dryRun
          ? `[pygmalion-migrate] ${statements.length} statement(s) NOT applied (--dry-run).`
          : `[pygmalion-migrate] applied ${statements.length} statement(s).`,
      )
    }
  } finally {
    await db.$client.end()
  }
  return 0
}

// Importable (the migration test drives `composeSchema` through the real
// CLI), executable as a bin. realpath: the installed `node_modules/.bin` shim
// hands over a symlinked argv[1], which `import.meta.url` reports resolved.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(error)
      process.exit(1)
    })
}
