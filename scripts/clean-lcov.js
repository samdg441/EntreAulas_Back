const fs = require('fs')

const path = process.argv[2] || 'coverage/lcov.info'
let text = fs.readFileSync(path, 'utf8')

const records = text.split('end_of_record')
const kept = records.filter((r) => r.includes('SF:') && !r.includes('(empty-report)'))

const out =
  kept
    .map((r) =>
      r.replace(/^SF:(.*)$/m, (_, p) => 'SF:' + String(p).trim().replace(/\\/g, '/'))
    )
    .join('end_of_record') + (kept.length ? 'end_of_record\n' : '')

fs.writeFileSync(path, out)
const sf = out.split('\n').filter((l) => l.startsWith('SF:'))
console.log('records kept:', kept.length)
console.log(sf.filter((l) => /auth\.ts|teachers\.routes|ai\.service|ai\.routes|users\.controller|app\.ts/.test(l)).join('\n'))
