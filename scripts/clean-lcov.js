const fs = require('fs')

const path = process.argv[2] || 'coverage/lcov.info'
let text = fs.readFileSync(path, 'utf8')

const records = text.split('end_of_record')
const byFile = new Map()

for (const raw of records) {
  if (!raw.includes('SF:') || raw.includes('(empty-report)')) continue
  const normalized = raw.replace(/^SF:(.*)$/m, (_, p) => 'SF:' + String(p).trim().replace(/\\/g, '/'))
  const sf = (normalized.match(/^SF:(.*)$/m) || [])[1]
  if (!sf) continue
  const key = sf.toLowerCase()
  const hits = Number((normalized.match(/^LH:(\d+)/m) || [])[1] || 0)
  const prev = byFile.get(key)
  if (!prev || hits >= prev.hits) {
    byFile.set(key, { text: normalized, hits })
  }
}

const kept = [...byFile.values()].map((v) => v.text)
function hitsDe(record) {
  const lh = record.match(/^LH:(\d+)/m)
  if (lh) return Number(lh[1])
  return [...record.matchAll(/^DA:\d+,(\d+)/gm)].reduce((acc, m) => acc + Number(m[1]), 0)
}

const records = text
  .split('end_of_record')
  .map((r) => r.replace(/^SF:(.*)$/m, (_, p) => 'SF:' + String(p).trim().replace(/\\/g, '/')))
  .filter((r) => r.includes('SF:') && !r.includes('(empty-report)'))

const best = new Map()
for (const record of records) {
  const sf = (record.match(/^SF:(.*)$/m) || [])[1]
  if (!sf) continue
  const prev = best.get(sf)
  if (!prev || hitsDe(record) >= hitsDe(prev)) best.set(sf, record)
}

const kept = [...best.values()]
const out = kept.join('end_of_record') + (kept.length ? 'end_of_record\n' : '')

fs.writeFileSync(path, out)
const sf = out.split('\n').filter((l) => l.startsWith('SF:'))
console.log('records kept:', kept.length)
console.log(sf.filter((l) => /auth\.ts|teachers\.routes|ai\.service|ai\.routes|users\.controller|app\.ts|auth\.routes|teachers-analytics/.test(l)).join('\n'))
console.log(sf.join('\n'))
