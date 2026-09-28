const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const vitest = spawnSync('npx', ['vitest', 'run', '--coverage', ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

const clean = spawnSync(process.execPath, [path.join(__dirname, 'clean-lcov.js')], {
  cwd: root,
  stdio: 'inherit',
})

process.exit(vitest.status ?? clean.status ?? 1)
