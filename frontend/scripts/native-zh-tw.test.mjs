/* zh-TW for the words the native shells say on their own, outside the page: the iOS permission
 * prompts (Info.plist → App/zh-Hant.lproj/InfoPlist.strings) and the Android notification
 * channels (values/strings.xml → values-zh-rTW). Everything else native shows comes from the
 * page in the app's language, or from ios/ci/watch-strings.mjs and widget-strings.mjs. */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
// A missing file reads as empty, so the test fails on what is missing rather than on the read.
const read = p => { try { return readFileSync(join(root, p), 'utf8') } catch { return '' } }

const plistKeys = xml => [...xml.matchAll(/<key>(NS\w+UsageDescription)<\/key>/g)].map(m => m[1])
const dotStrings = txt => Object.fromEntries([...txt.matchAll(/^"([^"]+)"\s*=\s*"((?:[^"\\]|\\.)*)";/gm)].map(m => [m[1], m[2]]))
const androidStrings = xml => Object.fromEntries([...xml.matchAll(/<string name="(\w+)">([^<]*)<\/string>/g)].map(m => [m[1], m[2]]))
// Names, not words: the same in every language.
const ANDROID_NAMES = ['app_name', 'title_activity_main', 'package_name', 'custom_url_scheme']

describe('native zh-TW strings', () => {
  it('每個 iOS 權限說明都有 zh-Hant 譯文', () => {
    const keys = plistKeys(read('ios/App/App/Info.plist'))
    expect(keys.length).toBeGreaterThan(0)
    const zh = dotStrings(read('ios/App/App/zh-Hant.lproj/InfoPlist.strings'))
    expect(keys.filter(k => !zh[k]?.trim())).toEqual([])
  })

  it('zh-Hant 的 InfoPlist.strings 有放進 App target 的資源', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj')
    expect(pbx).toMatch(/path = "zh-Hant\.lproj\/InfoPlist\.strings";/)
    expect(pbx).toMatch(/InfoPlist\.strings in Resources \*\/,/)
    expect(pbx).toMatch(/knownRegions = \([^)]*"zh-Hant",/)
  })

  it('每個 Android 通知頻道字串都有 zh-TW 譯文', () => {
    const en = androidStrings(read('android/app/src/main/res/values/strings.xml'))
    const words = Object.keys(en).filter(k => !ANDROID_NAMES.includes(k))
    expect(words.length).toBeGreaterThan(0)
    const zh = androidStrings(read('android/app/src/main/res/values-zh-rTW/strings.xml'))
    expect(words.filter(k => !zh[k]?.trim())).toEqual([])
    expect(Object.keys(zh).filter(k => ANDROID_NAMES.includes(k))).toEqual([])
  })
})
