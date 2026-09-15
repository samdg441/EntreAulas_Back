const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const vitest = spawnSync('npx', ['vitest', 'run', '--coverage'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

const clean = spawnSync(process.execPath, [path.join(__dirname, 'clean-lcov.js')], {
  cwd: root,
  stdio: 'inherit',
})

process.exit(vitest.status ?? clean.status ?? 1)
