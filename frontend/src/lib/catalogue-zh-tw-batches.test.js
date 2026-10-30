/* scripts/catalogue/zh-tw-batches.mjs moves the catalogue's missing zh-TW text out to batch files
 * and folds the translated batches back into catalogue/i18n/zh-TW.json.
 *
 * Run the way it is used: the real script is copied into a throwaway tree (scripts/catalogue/
 * beside catalogue/) with two exercises in it, executed, and judged by the files it leaves and
 * its exit code. */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const script = join(dirname(fileURLToPath(import.meta.url)), '../../../scripts/catalogue/zh-tw-batches.mjs')

const EN = {
  '0001': { id: '0001', name: 'sit-up', description: 'A short sit-up.', instructions: ['Lie down.', 'Curl up.', 'Lower.'] },
  '0002': { id: '0002', name: 'squat', description: 'The basic squat.', instructions: ['Stand.', 'Sit back.'] },
}

const tree = zh => {
  const dir = mkdtempSync(join(tmpdir(), 'zh-tw-batches-'))
  mkdirSync(join(dir, 'scripts', 'catalogue'), { recursive: true })
  mkdirSync(join(dir, 'catalogue', 'exercises'), { recursive: true })
  mkdirSync(join(dir, 'catalogue', 'i18n'), { recursive: true })
  copyFileSync(script, join(dir, 'scripts', 'catalogue', 'zh-tw-batches.mjs'))
  for (const e of Object.values(EN)) writeFileSync(join(dir, 'catalogue', 'exercises', e.id + '.json'), JSON.stringify(e))
  writeFileSync(join(dir, 'catalogue', 'i18n', 'zh-TW.json'), JSON.stringify(zh))
  return dir
}
const run = (dir, ...args) => {
  const r = spawnSync(process.execPath, [join(dir, 'scripts', 'catalogue', 'zh-tw-batches.mjs'), ...args], { encoding: 'utf8' })
  return { code: r.status, out: r.stdout + r.stderr }
}
const zhOf = dir => JSON.parse(readFileSync(join(dir, 'catalogue', 'i18n', 'zh-TW.json'), 'utf8'))
const outBatch = (dir, name, rows) => {
  mkdirSync(join(dir, 'work', 'out'), { recursive: true })
  writeFileSync(join(dir, 'work', 'out', name), JSON.stringify(rows))
}

describe('zh-tw-batches.mjs export', () => {
  it('writes only the missing English fields, with the zh-TW name beside them, in batches', () => {
    const dir = tree({
      '0001': { name: '仰臥起坐', description: '幅度較短的仰臥起坐。', instructions: ['躺下。', '捲起上身。', '放下。'] },
      '0002': { name: '深蹲', description: '最基本的深蹲。' },
    })
    try {
      writeFileSync(join(dir, 'catalogue', 'exercises', '0003.json'), JSON.stringify({ id: '0003', name: 'push-up', description: 'A push-up.', instructions: ['Plank.', 'Lower.'] }))
      writeFileSync(join(dir, 'catalogue', 'exercises', '0004.json'), JSON.stringify({ id: '0004', variantOf: '0003' }))
      const r = run(dir, 'export', join(dir, 'work'), '--size', '1')
      expect(r.code).toBe(0)
      expect(readdirSync(join(dir, 'work', 'in')).sort()).toEqual(['zh-TW-01.json', 'zh-TW-02.json'])
      const read = f => JSON.parse(readFileSync(join(dir, 'work', 'in', f), 'utf8'))
      expect(read('zh-TW-01.json')).toEqual({ '0002': { name: '深蹲', instructions: ['Stand.', 'Sit back.'] } })
      expect(read('zh-TW-02.json')).toEqual({ '0003': { name: 'push-up', description: 'A push-up.', instructions: ['Plank.', 'Lower.'] } })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('zh-tw-batches.mjs import', () => {
  it('fills only what is missing and never replaces a translation already there', () => {
    const dir = tree({ '0001': { name: '仰臥起坐', instructions: ['躺下。', '捲起上身。', '放下。'] }, '0002': { name: '深蹲' } })
    try {
      outBatch(dir, 'zh-TW-01.json', {
        '0001': { description: '幅度較短的仰臥起坐。', instructions: ['別的。', '譯法。', '不該進來。'] },
        '0002': { description: '最基本的深蹲。', instructions: ['站直。', '臀部往後坐。'] },
      })
      const r = run(dir, 'import', join(dir, 'work'))
      expect(r.code).toBe(0)
      expect(zhOf(dir)).toEqual({
        '0001': { name: '仰臥起坐', description: '幅度較短的仰臥起坐。', instructions: ['躺下。', '捲起上身。', '放下。'] },
        '0002': { name: '深蹲', description: '最基本的深蹲。', instructions: ['站直。', '臀部往後坐。'] },
      })
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('refuses the whole run when a row does not match the English, and writes nothing', () => {
    const before = { '0001': { name: '仰臥起坐' }, '0002': { name: '深蹲' } }
    const dir = tree(before)
    try {
      outBatch(dir, 'zh-TW-01.json', {
        '0001': { instructions: ['躺下。', '捲起上身。'] },   // English has three steps
        '0002': { description: '  ' },
        '9999': { description: '沒有這個動作。' },
      })
      const r = run(dir, 'import', join(dir, 'work'))
      expect(r.code).toBe(1)
      expect(r.out).toContain('0001')
      expect(r.out).toContain('0002')
      expect(r.out).toContain('9999')
      expect(zhOf(dir)).toEqual(before)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
