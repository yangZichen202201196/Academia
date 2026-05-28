/**
 * 编译后同步 ABI：将 artifacts 中的 GreenToken 复制到 frontend，避免前端使用旧 ABI。
 * 在 contracts 目录执行：node scripts/copy-abi-to-frontend.js
 * 或通过 npm run compile 自动执行。
 */
const fs = require('fs')
const path = require('path')

const artifactsPath = path.join(__dirname, '../artifacts/contracts/GreenToken.sol/GreenToken.json')
const frontendAbiPath = path.join(__dirname, '../../frontend/src/abis/GreenToken.json')

if (!fs.existsSync(artifactsPath)) {
  console.error('未找到编译产物，请先执行: npx hardhat compile')
  process.exit(1)
}

const artifact = JSON.parse(fs.readFileSync(artifactsPath, 'utf8'))
const dir = path.dirname(frontendAbiPath)
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true })
}
fs.writeFileSync(frontendAbiPath, JSON.stringify(artifact, null, 2), 'utf8')
console.log('已同步 ABI 到 frontend/src/abis/GreenToken.json')
