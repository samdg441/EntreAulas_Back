const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const vitest = spawnSync('npx', ['vitest', 'run', '--coverage'], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

spawnSync('node', [path.join(__dirname, 'clean-lcov.js')], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
})

process.exit(vitest.status ?? 1)
