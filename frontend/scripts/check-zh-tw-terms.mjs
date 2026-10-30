#!/usr/bin/env node
// Guards the wording of the Traditional Chinese pack (src/locales/zh-TW.js), which is written
// for Taiwan. check-locales only proves a key is translated; a translation in mainland usage
// passes it, and so does one that drifts between two words for the same thing.
//
//   node scripts/check-zh-tw-terms.mjs
//
// The word list is the glossary agreed for this fork (TODO/m1-zh-tw-audit.md).

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const file = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'locales', 'zh-TW.js')
const { default: pack } = await import(pathToFileURL(file).href)

// Mainland term → what Taiwan says. Only words that are wrong in Taiwan whatever the sentence:
// 項目, 服務, 配置, 通過 read fine here and stay off the list.
const MAINLAND = {
  數據: '資料、紀錄或統計',
  點擊: '點一下',
  菜單: '課表',
  運行: '執行',
  綁定: '連結或加入',
  獲取: '取得',
  反饋: '回饋',
  消息: '訊息',
  重置: '重設',
  支持: '支援或贊助',
  軟件: '軟體',
  硬件: '硬體',
  用戶: '使用者',
  設置: '設定',
  視頻: '影片',
  屏幕: '螢幕',
  默認: '預設',
  信息: '資訊',
  網絡: '網路',
  文件夾: '資料夾',
  登錄: '登入',
  鏈接: '連結',
  界面: '介面',
  搜索: '搜尋',
  創建: '建立',
  加載: '載入',
  緩存: '快取',
  在線: '線上',
  實時: '即時',
  窗口: '視窗',
  刷新: '重新整理',
  導出: '匯出',
  導入: '匯入',
  二維碼: 'QR Code',
  模板: '範本',
  字體: '字型',
  內存: '記憶體',
  當前: '目前',
  截屏: '截圖',
  存儲: '儲存',
  激活: '啟用',
  服務器: '伺服器',
  打印: '列印',
  質量: '品質',
  智能: '智慧',
}

// Common characters that exist only in Simplified Chinese. Forms Taiwan also writes (台, 只, 里,
// 划, 后, 准, 干, 余, 系, 制, 着) are left out on purpose: they would flag correct text.
const SIMPLIFIED = new Set([...
  '这们个为时会过还发么样实现开关门问间网络运动没进长东业应让认识给写见观学习觉亲头买卖电话车' +
  '软数据库户设视频讯录链页码热报纸组练训计级选择单双项输显减负载轮转换历记读详请错误删储图标' +
  '该际续继统总类号务档将帐账达连边闭阶节称积稳强弹张归当录径态总复钟钮钥锁键针铃领题额颜风' +
  '飞饭饮馆驱验骤鸡鱼齐龄广庆库废异弃岁岛币师带帮协单卖卫厅压厌参双变叙叠叶吗听启员响团园' +
  '围国图圆场块坚垫墙壮声处备够夺奖妈孙宁宝审宽对寻导层届属岗岭峡巩币帅帐扩扫扬扰抢护报担拟拥' +
  '拦择挂挡挣挤挥损换据摄摆摇撑敌敛断无旧显晒晓晕暂机杀杂权条杨极构枪标栏树桥检楼横欢欧残毁毕' +
  '气汇汉污汤沟泪泽洁浅测济浓涂润涨渐温湾湿满滤灭灯灵灾炉烂烟烦烧爱牵独狭献环电画畅疗盐监盖盘' +
  '矫矿确础礼离种积称穷窃竞笔笼筛签简粮紧红纤约级纪纯纲纳纵纷纸线练组细织终绍经绑结绕绘给络绝' +
  '统继绩续绳维绵绿缓编缘缩罗职联聪肃肠肤肿胀胁胆胜脉脏脑脚脱脸舍艰艺节药获营虑虚虽补装见观规' +
  '视览觉触计订认讨让训议讯记讲许论设访证评识诉词译试话询该详语误说请诸读课谁调谈谢谱负财责败' +
  '货质购贵费资赛赞赢赶趋跃践踪轨转轮软轻载较辅辆输边达过运还这进远违连迟适选递遗邮释针钢钱铁' +
  '链销锁错键锻镜长门闪闭问间闻阅队阳阴阵阶际陆险随隐难静页顶项顺须顾顿预领频题风饮饱驶验骑鸣'
])

// One word per glossary term. These words are right elsewhere (進階 is "advanced"), so they
// only count where the English key carries the term.
const GLOSSARY = [
  { en: /\btap/i, avoid: ['輕觸', '點選', '點按'], use: '點一下' },
  { en: /\broutines?\b/i, avoid: ['訓練表'], use: '課表' },
  { en: /\bprogression\b/i, avoid: ['進階'], use: '漸進' },
]

const texts = v => (typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v) : [])

const problems = []
// `key` is the English original where there is one (the UI pack); the catalogue has none, so the
// glossary, which reads the English, only runs on the pack.
const check = (label, text, key) => {
  for (const [word, use] of Object.entries(MAINLAND))
    if (text.includes(word)) problems.push(`  ${label}: ${word} → ${use}`)
  const simplified = [...new Set([...text].filter(c => SIMPLIFIED.has(c)))]
  if (simplified.length) problems.push(`  ${label}: simplified ${simplified.join('')}`)
  if (key === undefined) return
  for (const { en, avoid, use } of GLOSSARY) {
    if (!en.test(key)) continue
    for (const word of avoid) if (text.includes(word)) problems.push(`  ${label}: ${word} → ${use}`)
  }
}

for (const [key, value] of Object.entries(pack))
  for (const text of texts(value)) check(JSON.stringify(key), text, key)

// catalogue/i18n/zh-TW.json: { "<id>": { name, description?, instructions?: [] } }
const catalogueFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'catalogue', 'i18n', 'zh-TW.json')
const catalogue = JSON.parse(readFileSync(catalogueFile, 'utf8'))
for (const [id, entry] of Object.entries(catalogue))
  for (const [field, value] of Object.entries(entry))
    for (const text of [value].flat()) if (typeof text === 'string') check(`catalogue ${id} ${field}`, text)

if (problems.length) {
  console.error(`zh-TW: ${problems.length} wording problem(s)\n`)
  for (const p of problems) console.error(p)
  process.exit(1)
}

console.log(`zh-TW: ${Object.keys(pack).length} strings and ${Object.keys(catalogue).length} exercises, Taiwan wording.`)
