/**
 * 校验「链上某地址的字节码」是否与「当前编译的 GreenToken」一致。
 * 若不一致，就会出现「无法识别的函数」；请先 clean + compile，再重启 node，再 deploy。
 *
 * 使用（在 contracts 目录，且 node 已启动）：
 *   node scripts/verify-bytecode.js
 * 或
 *   npx hardhat run scripts/verify-bytecode.js --network localhost
 */
const hre = require('hardhat')
const fs = require('fs')
const path = require('path')

async function main() {
  const addrPath = path.join(__dirname, '..', '.deployed-address')
  if (!fs.existsSync(addrPath)) {
    console.error('未找到 .deployed-address，请先执行: npx hardhat run scripts/deploy.js --network localhost')
    process.exit(1)
  }
  const address = fs.readFileSync(addrPath, 'utf8').trim()
  if (!address || !address.startsWith('0x')) {
    console.error('.deployed-address 内容无效')
    process.exit(1)
  }

  const artifactPath = path.join(__dirname, '..', 'artifacts', 'contracts', 'GreenToken.sol', 'GreenToken.json')
  if (!fs.existsSync(artifactPath)) {
    console.error('未找到编译产物，请先执行: npx hardhat compile')
    process.exit(1)
  }
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'))
  const expectedHex = (artifact.deployedBytecode?.object ?? artifact.deployedBytecode ?? '').replace(/^0x/, '')

  const provider = hre.ethers.provider
  const code = await provider.getCode(address)
  const onChainHex = (code || '0x').replace(/0x/, '')

  if (!onChainHex || onChainHex.length === 0) {
    console.error('链上该地址无字节码:', address)
    console.error('请先启动 npx hardhat node，再执行 npx hardhat run scripts/deploy.js --network localhost')
    process.exit(1)
  }

  const lenOk = onChainHex.length === expectedHex.length
  const headOk = onChainHex.slice(0, 200) === expectedHex.slice(0, 200)
  const tailOk = onChainHex.slice(-200) === expectedHex.slice(-200)

  if (lenOk && headOk && tailOk) {
    console.log('OK: 链上字节码与当前编译的 GreenToken 一致，地址:', address)
    return
  }

  console.error('不一致: 链上字节码与当前编译的 GreenToken 不符')
  console.error('  链上长度:', onChainHex.length, '预期长度:', expectedHex.length)
  console.error('请按顺序: 1) 关掉 hardhat node  2) npx hardhat clean && npm run compile  3) 重新 npx hardhat node  4) npx hardhat run scripts/deploy.js --network localhost  5) 重启前后端并强刷浏览器')
  process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
