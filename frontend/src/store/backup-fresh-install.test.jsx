// @vitest-environment happy-dom
/* The backup file is the only way data moves between devices once there is no server. A profile
 * with something in every corner (workouts with photos, weigh-ins, measurements with a custom
 * field, day notes, a photo filed under a day, custom exercises with their picture, and settings
 * changed from their defaults) is exported, the "device" is wiped as a fresh install, and the
 * file is imported there: everything comes back as it was, photos and videos byte for byte, and
 * nothing on the way reaches the network.
 *
 * The real code throughout: Settings' doExport (JSON.stringify of the store), exportBackupZip,
 * readBackupFile, storeBackupMedia, the store's importBackup and its persist. Only fetch is
 * replaced, by one that fails and remembers being called. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEF, useStore } from './useStore.js'
import { exportBackupZip, readBackupFile, storeBackupMedia } from '../lib/backup-media.js'
import { createMediaStore, memoryBackend } from '../lib/media-store.js'
import { sha256Hex } from '../lib/sha256.js'
import { jpeg, png, mp4 } from '../lib/media-samples.test-util.js'

const clone = v => JSON.parse(JSON.stringify(v))
const fetched = []
const offline = vi.fn(async url => { fetched.push(String(url)); throw new TypeError('Failed to fetch') })

const photo = jpeg(), dayShot = png(), clip = mp4().file
const ref = async (bytes, mime, kind = 'image') => ({ kind, hash: await sha256Hex(bytes), mime, size: bytes.length, width: 4, height: 3, at: 1 })

async function richProfile() {
  const exPic = await ref(photo, 'image/jpeg')
  const dayPic = await ref(dayShot, 'image/png')
  const video = await ref(clip, 'video/quicktime', 'video')
  const S = Object.assign(clone(DEF), {
    unit: 'lb', restSec: 150, lang: 'zh-TW', body: 'female', targetW: 140, weekStart: 0, wdec: 2,
    speedUnit: 'kmh', workoutView: 'list', effort: 'rpe', volumeWarmups: true, autoBackup: true,
    reminder: { on: true, time: '07:30', tz: 'Asia/Taipei', nudge: true, tone: 'friendly' },
    bodyweight: [{ d: '2026-10-01', w: 150.4, t: 1790000000000 }],
    measurements: [{ d: '2026-10-01', t: 1790000000000, waist: 80.5, other: [{ id: 'grip', name: '握力', value: 42, unit: 'kg' }] }],
    customMeasurements: [{ id: 'grip', name: '握力', unit: 'kg' }],
    dayNotes: { '2026-10-02': { tag: 'sick', text: '感冒休息', _ts: 1790000000000 } },
    dayPhotos: { [dayPic.hash]: { d: '2026-10-03', m: dayPic, _ts: 1790000000000 } },
    customEx: [{ id: 'c-own', n: 'own cable thing', custom: true, eq: 'cable', bp: 'back', media: exPic }],
    workouts: [{ id: 'w1', d: '2026-10-01', start: 1790000000000, end: 1790003600000, name: '腿日', note: '膝蓋 OK',
      entries: [{ id: '0025', sets: [{ w: 225, r: 5, done: true }] }, { id: 'c-own', sets: [{ w: 50, r: 12, done: true }] }], media: [video] }],
    routines: [{ id: 'r1', name: '推', ex: [{ id: '0025', sets: 3, reps: 5 }] }],
    exNotes: { '0025': '座椅第 4 格' }, exAliases: { '0025': '臥推' }, favEx: ['0025'], barWeights: { '0025': 35 },
    equipProfiles: [{ id: 'home', name: '家裡', eq: ['dumbbell'] }], activeEquipId: 'home',
    _ts: 1790000000000,
  })
  const media = createMediaStore(memoryBackend())
  await media.put(exPic.hash, new Blob([photo]), { mime: 'image/jpeg' })
  await media.put(dayPic.hash, new Blob([dayShot]), { mime: 'image/png' })
  await media.put(video.hash, new Blob([clip]), { mime: 'video/quicktime' })
  return { S, media, hashes: [exPic.hash, dayPic.hash, video.hash], files: [photo, dayShot, clip] }
}

// Bookkeeping the import adds or renews (sync stamps), not what the person entered. So are the
// "added back at" marks of a restore, the negative stamps in `deleted` (lib/sync-merge.js
// stampRestore); a removal on record (a positive one) is still compared.
const STAMPS = new Set(['_ts', '_f', '_u', 'edited'])
const data = S => {
  const d = JSON.parse(JSON.stringify(S, (k, v) => (STAMPS.has(k) ? undefined : v)))
  for (const [f, m] of Object.entries(d.deleted || {})) {
    for (const [k, at] of Object.entries(m)) if (at < 0) delete m[k]
    if (!Object.keys(m).length) delete d.deleted[f]
  }
  if (d.deleted && !Object.keys(d.deleted).length) delete d.deleted
  return d
}

const freshInstall = () => { localStorage.clear(); useStore.setState({ S: clone(DEF), user: null, ready: true }) }
const saved = () => JSON.parse(localStorage.getItem('gym_state_v1'))

beforeEach(() => { fetched.length = 0; vi.stubGlobal('fetch', offline); freshInstall() })
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); useStore.setState({ S: clone(DEF), user: null, ready: false }) })

describe('a backup moved to a fresh install, offline', () => {
  it('JSON 備份在全新安裝上匯入後，整份資料與重開後讀回的都相同，且沒有發出網路請求', async () => {
    const { S } = await richProfile()
    const json = JSON.stringify(S, null, 2)   // Settings.jsx doExport
    freshInstall()
    const { state } = await readBackupFile(new File([json], 'opengym-backup.json', { type: 'application/json' }))
    useStore.getState().importBackup(state)
    expect(data(useStore.getState().S)).toEqual(data(S))
    expect(data(saved())).toEqual(data(S))
    expect(fetched).toEqual([])
  })

  it('含照片與影片的 zip 備份在全新安裝上匯入後，資料相同、每個媒體檔逐位元組相同，且沒有發出網路請求', async () => {
    const { S, media, hashes, files } = await richProfile()
    const { blob, included, missing } = await exportBackupZip(S, { media })
    expect({ included, missing }).toEqual({ included: 3, missing: 0 })
    freshInstall()
    const fresh = createMediaStore(memoryBackend())
    const read = await readBackupFile(new File([blob], 'opengym-backup.zip'))
    expect(await storeBackupMedia(read.files, { media: fresh })).toEqual({ stored: 3, skipped: 0 })
    useStore.getState().importBackup(read.state)
    expect(data(useStore.getState().S)).toEqual(data(S))
    for (const [i, h] of hashes.entries()) {
      const rec = await fresh.get(h)
      expect(new Uint8Array(await rec.blob.arrayBuffer())).toEqual(files[i])
    }
    expect(fetched).toEqual([])
  })
})
