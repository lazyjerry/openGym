// @vitest-environment happy-dom
/* Traditional Chinese through the real packs: setLang('zh-TW') loads the words, the exercise
   names, steps and descriptions, and whatever a pack lacks shows in English, or as the exercise's
   own words for one somebody added. Expected values are copied from locales/zh-TW.js and
   catalogue/i18n/zh-TW.json. */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { setLang, getLang, dateLocale, t, tn, exerciseNameFor, instrFor, descFor } from './i18n.js'
import { fmtDate, fmtNum, fmtVol } from './format.js'
import { measurementUnit, measurementUnitLabel, toMeasurementDisplay } from './measurements.js'

const calfRaise = { id: '1000', n: 'band single leg reverse calf raise' }
const custom = { id: 'custom-zh-tw-test', n: 'My cable thing', st: ['Pull it.'], desc: 'Mine.' }

describe('zh-TW', () => {
  beforeAll(async () => { await setLang('zh-TW') })

  it('切到繁體中文後介面字串、複數與日期都走 zh-TW', () => {
    expect(getLang()).toBe('zh-TW')
    expect(t('Settings')).toBe('設定')
    expect(tn('{0} set', '{0} sets', 3)).toBe('3 組')
    expect(dateLocale()).toBe('zh-TW')
    expect(document.documentElement.lang).toBe('zh-TW')
    expect(document.documentElement.dir).toBe('ltr')
  })

  it('繁中語系包沒有的字串回退成英文原文，參數照樣代入', () => {
    expect(t('A sentence no pack has, {0} times', 2)).toBe('A sentence no pack has, 2 times')
  })

  it('動作名稱用繁中並附英文原名，自訂動作保留原名', () => {
    expect(exerciseNameFor(calfRaise)).toBe('彈力帶單腿反向提踵 (band single leg reverse calf raise)')
    expect(exerciseNameFor(custom)).toBe('My cable thing')
  })

  it('動作步驟與描述用繁中，自訂動作用它自己的內容', async () => {
    expect(instrFor(calfRaise)[0]).toBe('雙腳分開站立，與臀部同寬，將彈力帶套在腳掌前緣。')
    expect(instrFor(custom)).toEqual(['Pull it.'])
    descFor(calfRaise)
    await vi.waitFor(() => expect(descFor(calfRaise)).toBe('用彈力帶做的單腿提踵，墊起腳尖到前腳掌。主要訓練小腿。'), { timeout: 20000 })
    expect(descFor(custom)).toBe('Mine.')
  })

  it('日期與數字用 zh-TW 格式，kg／lb、cm／in 照個人檔案的單位，不隨語系改變', () => {
    expect(fmtDate('2026-03-05')).toBe('3月5日')
    // Older ICU (CI's Node 22) may put a space before the weekday.
    expect(fmtDate('2026-03-05', true, true)).toMatch(/^2026年3月5日 ?週四$/)
    expect(fmtNum(7535.25)).toBe('7,535.3')
    expect(fmtVol(7535, 'kg')).toBe('7,535 kg')
    expect(fmtVol(7535, 'lb')).toBe('7,535 lb')
    expect(measurementUnit('kg')).toBe('cm')
    expect(measurementUnit('lb')).toBe('in')
    expect(toMeasurementDisplay(25.4, 'lb')).toBe(10)
    expect(measurementUnitLabel('in')).toBe('in')
  })
})
