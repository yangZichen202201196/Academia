/**
 * 链配置：支持切换 Sepolia 测试网 / Hardhat 本地链
 * 通过环境变量 ACTIVE_CHAIN=sepolia|hardhat 切换，无需改代码
 */
import dotenv from 'dotenv'
dotenv.config()

const ACTIVE_CHAIN = (process.env.ACTIVE_CHAIN || 'sepolia').toLowerCase()

const SEPOLIA = {
  rpcUrl: process.env.SEPOLIA_RPC_URL || process.env.RPC_URL || 'https://ethereum-sepolia.publicnode.com',
  contractAddress: process.env.SEPOLIA_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS,
  blockExplorerUrl: (process.env.SEPOLIA_BLOCK_EXPLORER_URL || process.env.BLOCK_EXPLORER_URL || 'https://sepolia.etherscan.io').trim() || null,
  chainId: 11155111
}

const HARDHAT = {
  rpcUrl: process.env.HARDHAT_RPC_URL || process.env.RPC_URL || 'http://localhost:8545',
  contractAddress: process.env.HARDHAT_CONTRACT_ADDRESS || process.env.CONTRACT_ADDRESS,
  blockExplorerUrl: (process.env.HARDHAT_BLOCK_EXPLORER_URL || '').trim() || null,
  chainId: 31337
}

const configs = { sepolia: SEPOLIA, hardhat: HARDHAT }
const active = configs[ACTIVE_CHAIN] || configs.sepolia

/**
 * 获取当前生效的链配置（供路由使用）
 */
export function getChainConfig() {
  return {
    chainId: active.chainId,
    rpcUrl: active.rpcUrl,
    contractAddress: active.contractAddress,
    blockExplorerUrl: active.blockExplorerUrl,
    chainName: ACTIVE_CHAIN === 'hardhat' ? 'Hardhat 本地链' : 'Sepolia 测试网'
  }
}

export { ACTIVE_CHAIN }
