/* check-zh-tw-terms.mjs, run the way CI runs it.
 *
 * Same shape as check-locales.test.mjs: the real script is copied into a throwaway tree
 * (scripts/ beside src/locales/) with a tiny zh-TW pack, executed, and judged by its exit code
 * and what it prints. */
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const script = join(here, 'check-zh-tw-terms.mjs')

const run = (pack, catalogue = {}) => {
  const dir = mkdtempSync(join(tmpdir(), 'check-zh-tw-terms-'))
  try {
    mkdirSync(join(dir, 'frontend', 'scripts'), { recursive: true })
    mkdirSync(join(dir, 'frontend', 'src', 'locales'), { recursive: true })
    mkdirSync(join(dir, 'catalogue', 'i18n'), { recursive: true })
    copyFileSync(script, join(dir, 'frontend', 'scripts', 'check-zh-tw-terms.mjs'))
    writeFileSync(join(dir, 'frontend', 'src', 'locales', 'zh-TW.js'), `export default ${JSON.stringify(pack, null, 2)}\n`)
    writeFileSync(join(dir, 'catalogue', 'i18n', 'zh-TW.json'), JSON.stringify(catalogue))
    const r = spawnSync(process.execPath, [join(dir, 'frontend', 'scripts', 'check-zh-tw-terms.mjs')], { encoding: 'utf8' })
    return { code: r.status, out: r.stdout + r.stderr }
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

describe('check-zh-tw-terms.mjs', () => {
  it('fails a mainland term and names the Taiwan one to use', () => {
    const r = run({ Stats: '數據統計' })
    expect(r.code).toBe(1)
    expect(r.out).toContain('Stats')
    expect(r.out).toContain('數據')
    expect(r.out).toContain('資料')
  })

  it('passes a pack written in Taiwan usage', () => {
    const r = run({ Stats: '統計', Settings: '設定', 'Tap to retry.': '點一下重試。' })
    expect(r.code).toBe(0)
  })

  it('fails a simplified character', () => {
    const r = run({ Workout: '训練' })
    expect(r.code).toBe(1)
    expect(r.out).toContain('Workout')
    expect(r.out).toContain('训')
  })

  it('fails a second word for a glossary term, judged by the English key', () => {
    // 進階 is fine for "advanced"; it is only wrong where the key says progression.
    const r = run({ 'Linear progression': '線性進階', Advanced: '進階' })
    expect(r.code).toBe(1)
    expect(r.out).toContain('Linear progression')
    expect(r.out).toContain('漸進')
    expect(r.out).not.toContain('"Advanced"')
  })

  it('checks the exercise catalogue too, naming the exercise and the field', () => {
    const r = run({ Stats: '統計' }, {
      1000: { name: '彈力帶提踵', instructions: ['站穩。', '慢慢放下，重置姿勢。'] },
      1001: { name: '槓鈴深蹲', description: '下肢的基礎動作。' },
    })
    expect(r.code).toBe(1)
    expect(r.out).toContain('1000')
    expect(r.out).toContain('instructions')
    expect(r.out).toContain('重置')
    expect(r.out).not.toContain('1001')
  })
})
