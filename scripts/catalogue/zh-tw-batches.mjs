#!/usr/bin/env node
// Fills the catalogue's missing zh-TW descriptions and steps in batches, the way the v1.4.0 name
// work went in (import-names.mjs): text goes out to batch files, comes back translated, and is
// folded in. Only missing fields are filled; a translation someone already wrote is never replaced.
//
//   node scripts/catalogue/zh-tw-batches.mjs export <work> [--size 100]   writes <work>/in/zh-TW-NN.json
//   node scripts/catalogue/zh-tw-batches.mjs import <work>                folds <work>/out/*.json in
//
// A batch in <work>/in/ is { "<id>": { "name", "description"?, "instructions"? } }: the zh-TW name
// (English when there is none) to keep the wording consistent, and the English fields still missing.
// The translated batch in <work>/out/ is the same shape without the name.
// <work> is a scratch directory outside the repo; batches are not committed.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const I18N = path.join(ROOT, 'catalogue/i18n/zh-TW.json')
const [cmd, work, ...rest] = process.argv.slice(2)

if (!['export', 'import'].includes(cmd) || !work) {
  console.error('usage: zh-tw-batches.mjs export <work> [--size 100] | import <work>')
  process.exit(2)
}

const EX = path.join(ROOT, 'catalogue/exercises')

if (cmd === 'export') {
  const size = Number(rest[rest.indexOf('--size') + 1]) || 100
  const zh = JSON.parse(fs.readFileSync(I18N, 'utf8'))
  const ids = fs.readdirSync(EX).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).sort()
  const todo = []
  for (const id of ids) {
    const en = JSON.parse(fs.readFileSync(path.join(EX, id + '.json'), 'utf8'))
    if (en.variantOf) continue   // an alias of another exercise, with no text of its own
    const cur = zh[id] || {}
    const row = { name: cur.name || en.name }
    if (cur.description == null && en.description) row.description = en.description
    if (cur.instructions == null && en.instructions?.length) row.instructions = en.instructions
    if (row.description || row.instructions) todo.push([id, row])
  }
  const inDir = path.join(path.resolve(work), 'in')
  fs.mkdirSync(inDir, { recursive: true })
  for (let i = 0; i < todo.length; i += size) {
    const name = `zh-TW-${String(i / size + 1).padStart(2, '0')}.json`
    fs.writeFileSync(path.join(inDir, name), JSON.stringify(Object.fromEntries(todo.slice(i, i + size)), null, 2) + '\n')
  }
  console.log(`zh-TW: ${todo.length} exercises to translate, ${Math.ceil(todo.length / size)} batch(es) in ${inDir}`)
  process.exit(0)
}

const english = id => {
  const p = path.join(EX, id + '.json')
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null
}
const isText = s => typeof s === 'string' && s.trim() !== ''

// A translated row has to line up with its English one: same exercise, one step for each step.
// Anything off stops the run before a byte is written, so a bad batch is fixed and rerun whole.
const problems = []
const rowProblems = (id, row) => {
  const en = english(id)
  if (!en) return ['no such exercise']
  const out = []
  if (row.description != null && !isText(row.description)) out.push('description is blank')
  if (row.instructions != null) {
    if (!Array.isArray(row.instructions) || !row.instructions.every(isText)) out.push('instructions must be a list of steps')
    else if (row.instructions.length !== (en.instructions || []).length)
      out.push(`instructions has ${row.instructions.length} steps, English has ${(en.instructions || []).length}`)
  }
  return out
}

const zh = JSON.parse(fs.readFileSync(I18N, 'utf8'))
const outDir = path.join(path.resolve(work), 'out')
let added = 0
for (const f of fs.readdirSync(outDir).filter(f => f.endsWith('.json')).sort()) {
  for (const [id, row] of Object.entries(JSON.parse(fs.readFileSync(path.join(outDir, f), 'utf8')))) {
    const bad = rowProblems(id, row)
    if (bad.length) { problems.push(...bad.map(b => `  ${f} ${id}: ${b}`)); continue }
    const cur = zh[id] ||= {}
    for (const k of ['description', 'instructions'])
      if (row[k] != null && cur[k] == null) { cur[k] = row[k]; added++ }
  }
}

if (problems.length) {
  console.error(`zh-TW: nothing written, ${problems.length} problem(s)\n`)
  for (const p of problems) console.error(p)
  process.exit(1)
}

// Rows in id order, and inside a row name, description, instructions: the order a translator reads.
const sorted = Object.fromEntries(Object.keys(zh).sort().map(id => {
  const r = zh[id]
  return [id, Object.fromEntries(['name', 'description', 'instructions'].filter(k => r[k] != null).map(k => [k, r[k]]))]
}))
fs.writeFileSync(I18N, JSON.stringify(sorted, null, 2) + '\n')
console.log(`zh-TW: +${added} fields`)
