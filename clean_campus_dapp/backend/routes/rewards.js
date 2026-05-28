import express from 'express'
import { getDB } from '../db/database.js'
import { ethers } from 'ethers'
import { getChainConfig } from '../config/chain.js'

const router = express.Router()
const db = getDB()
const SIGN_EXPIRE_MS = 5 * 60 * 1000

function parseSignedAt(input) {
  const n = Number(input)
  if (!Number.isFinite(n)) return null
  return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000)
}

/** 生成唯一取货码/凭证码，格式 GCT-XXXX-XXXX */
function generateRedemptionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const segment = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `GCT-${segment()}-${segment()}`
}

function ensureUniqueRedemptionCode() {
  let code = generateRedemptionCode()
  for (let i = 0; i < 20; i++) {
    const exists = db.prepare('SELECT id FROM user_rewards WHERE redemption_code = ?').get(code)
    if (!exists) return code
    code = generateRedemptionCode()
  }
  return code + '-' + Date.now().toString(36)
}

// 可选：前端获取链 ID、合约地址、区块链浏览器（用于连接钱包与链上查看）
router.get('/chain-config', async (req, res) => {
  try {
    const { rpcUrl, contractAddress, blockExplorerUrl, chainId, chainName } = getChainConfig()
    if (!contractAddress || !rpcUrl) {
      return res.json({ ok: false, error: `未配置当前链（${chainName}）的合约地址或 RPC，请检查 .env 中 ACTIVE_CHAIN 与对应 SEPOLIA_* / HARDHAT_*` })
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const c = new ethers.Contract(contractAddress, ['function symbol() view returns (string)'], provider)
    let symbol
    try {
      symbol = await c.symbol()
    } catch (e) {
      return res.json({ ok: false, error: '合约地址与当前链不一致，请确认已部署且 .env 中合约地址正确' })
    }
    if (symbol !== 'GCT') {
      return res.json({ ok: false, error: '当前地址不是 GCT 合约' })
    }
    return res.json({
      ok: true,
      chainId,
      contractAddress,
      blockExplorerUrl: blockExplorerUrl || undefined,
      chainName
    })
  } catch (e) {
    res.json({ ok: false, error: e?.message || '获取失败' })
  }
})

// 获取所有奖励（公开接口仅返回上架）
router.get('/', (req, res) => {
  try {
    const rewards = db.prepare(`
      SELECT * FROM rewards 
      WHERE COALESCE(status, 'on_shelf') = 'on_shelf'
      ORDER BY points_required ASC
    `).all()
    res.json(rewards.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      pointsRequired: r.points_required,
      type: r.type,
      stock: r.stock,
      imageUrl: r.image_url,
      pickupAddress: r.pickup_address || null
    })))
  } catch (error) {
    console.error('获取奖励失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

// 兑换奖励（仅链下记录，不涉及链上）
router.post('/redeem', (req, res) => {
  try {
    const { rewardId, walletAddress } = req.body

    if (!rewardId || !walletAddress) {
      return res.status(400).json({ error: '缺少必要字段' })
    }

    // 检查奖励是否存在
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId)
    if (!reward) {
      return res.status(404).json({ error: '奖励不存在' })
    }

    // 检查库存
    if (reward.stock <= 0) {
      return res.status(400).json({ error: '库存不足' })
    }

    // 插入兑换记录
    const result = db.prepare(`
      INSERT INTO user_rewards (reward_id, wallet_address)
      VALUES (?, ?)
    `).run(rewardId, walletAddress)

    // 更新库存
    db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ?').run(rewardId)

    res.json({
      id: result.lastInsertRowid,
      rewardId,
      walletAddress,
      redeemedAt: new Date().toISOString(),
      reward: {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        pointsRequired: reward.points_required,
        type: reward.type
      }
    })
  } catch (error) {
    console.error('兑换失败:', error)
    res.status(500).json({ error: '兑换失败' })
  }
})

// redeemForReward(uint256,uint256,string) 的 function selector (keccak256 前 4 字节)
const REDEEM_SELECTOR = '0x' + ethers.id('redeemForReward(uint256,uint256,string)').slice(2, 10)

/**
 * 上链兑换确认：用户已在前端调用合约 redeemForReward 完成链上扣款，后端凭 txHash 校验为“发往 GCT 的兑换交易”后记库。
 * 与审核发放（awardPoints）流程一致：链上操作由前端/用户完成，后端只做校验与落库。
 */
router.post('/redeem-with-tx', async (req, res) => {
  try {
    const { rewardId, walletAddress, txHash } = req.body
    if (!rewardId || !walletAddress || !txHash) {
      return res.status(400).json({ error: '缺少 rewardId、walletAddress 或 txHash' })
    }
    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId)
    if (!reward) return res.status(404).json({ error: '奖励不存在' })
    if (reward.stock <= 0) return res.status(400).json({ error: '库存不足' })

    const { rpcUrl, contractAddress } = getChainConfig()
    if (!rpcUrl || !contractAddress) {
      return res.status(500).json({ error: '未配置当前链的 RPC 或合约地址，无法校验链上交易' })
    }
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const receipt = await provider.getTransactionReceipt(txHash)
    if (!receipt || receipt.status !== 1) {
      return res.status(400).json({ error: '交易未成功或不存在，请确认已在 MetaMask 完成链上兑换' })
    }
    if (receipt.to && receipt.to.toLowerCase() !== contractAddress.toLowerCase()) {
      return res.status(400).json({ error: '交易并非发往当前配置的 GCT 合约' })
    }
    const tx = await provider.getTransaction(txHash)
    if (tx && tx.data && typeof tx.data === 'string' && !tx.data.toLowerCase().startsWith(REDEEM_SELECTOR.toLowerCase())) {
      return res.status(400).json({ error: '该交易不是兑换积分调用，请使用奖励页的「兑换」完成链上操作' })
    }

    db.prepare(`
      INSERT INTO user_rewards (reward_id, wallet_address, tx_hash)
      VALUES (?, ?, ?)
    `).run(rewardId, walletAddress, txHash)
    db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ?').run(rewardId)

    res.json({
      success: true,
      txHash,
      rewardId,
      walletAddress,
      redeemedAt: new Date().toISOString(),
      reward: {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        pointsRequired: reward.points_required,
        type: reward.type
      }
    })
  } catch (e) {
    console.error('兑换（凭 tx 记录）失败:', e)
    res.status(500).json({ error: e?.message || '兑换失败' })
  }
})

/**
 * 由后端托管管理员私钥，直接在链上调用 adminRedeem 为用户扣减并销毁积分，再落库。
 * 前端无需 MetaMask 签名，所有链上写操作都通过 RPC_URL=8545 完成。
 */
router.post('/redeem-onchain', async (req, res) => {
  try {
    const { rewardId, walletAddress, signature, signedAt } = req.body
    if (!rewardId || !walletAddress || !signature || signedAt == null) {
      return res.status(400).json({ error: '缺少 rewardId、walletAddress、signature 或 signedAt' })
    }
    const wallet = String(walletAddress).trim()
    const signedAtMs = parseSignedAt(signedAt)
    if (!signedAtMs) return res.status(400).json({ error: 'signedAt 无效' })
    if (Math.abs(Date.now() - signedAtMs) > SIGN_EXPIRE_MS) {
      return res.status(400).json({ error: '签名已过期，请重新发起兑换' })
    }
    const message =
      `Redeem reward onchain\n` +
      `wallet:${wallet.toLowerCase()}\n` +
      `rewardId:${Number(rewardId)}\n` +
      `signedAt:${signedAtMs}`
    const recovered = ethers.verifyMessage(message, signature)
    if (!recovered || recovered.toLowerCase() !== wallet.toLowerCase()) {
      return res.status(401).json({ error: '签名校验失败，请使用对应钱包重新签名' })
    }

    const reward = db.prepare('SELECT * FROM rewards WHERE id = ?').get(rewardId)
    if (!reward) return res.status(404).json({ error: '奖励不存在' })
    if (reward.stock <= 0) return res.status(400).json({ error: '库存不足' })

    const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY
    const { rpcUrl, contractAddress } = getChainConfig()
    if (!rpcUrl || !contractAddress || !ADMIN_PRIVATE_KEY) {
      return res.status(500).json({ error: '未配置当前链的合约地址 / RPC / ADMIN_PRIVATE_KEY，无法在链上兑换' })
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider)
    const abi = ['function adminRedeem(address user, uint256 rewardId, uint256 cost, string meta)']
    const contract = new ethers.Contract(contractAddress, abi, adminWallet)

    const costRequired = Number(reward.points_required || 0)
    if (!Number.isFinite(costRequired) || costRequired <= 0) {
      return res.status(500).json({ error: '奖品所需积分配置有误' })
    }
    const costWei = ethers.parseEther(costRequired.toString())

    const tx = await contract.adminRedeem(wallet, BigInt(rewardId), costWei, reward.name || 'reward')
    const receipt = await tx.wait()
    const txHash = receipt?.transactionHash || tx.hash
    const redemptionCode = ensureUniqueRedemptionCode()

    db.prepare(`
      INSERT INTO user_rewards (reward_id, wallet_address, tx_hash, redemption_code)
      VALUES (?, ?, ?, ?)
    `).run(rewardId, wallet, txHash, redemptionCode)
    db.prepare('UPDATE rewards SET stock = stock - 1 WHERE id = ?').run(rewardId)

    res.json({
      success: true,
      txHash,
      redemptionCode,
      rewardId,
      walletAddress: wallet,
      redeemedAt: new Date().toISOString(),
      reward: {
        id: reward.id,
        name: reward.name,
        description: reward.description,
        pointsRequired: reward.points_required,
        type: reward.type
      }
    })
  } catch (e) {
    console.error('兑换（后台链上扣减）失败:', e)
    const msg = e?.reason || e?.shortMessage || e?.message || '链上兑换失败'
    res.status(500).json({ error: msg })
  }
})

// 获取用户的兑换记录
router.get('/user/:walletAddress', (req, res) => {
  try {
    const { walletAddress } = req.params
    const userRewards = db.prepare(`
      SELECT ur.*, r.name, r.description, r.points_required as pointsRequired, r.type, r.pickup_address as pickup_address
      FROM user_rewards ur
      JOIN rewards r ON ur.reward_id = r.id
      WHERE ur.wallet_address = ?
      ORDER BY ur.redeemed_at DESC
    `).all(walletAddress)

    res.json(userRewards.map(ur => ({
      id: ur.id,
      rewardId: ur.reward_id,
      walletAddress: ur.wallet_address,
      redeemedAt: ur.redeemed_at,
      txHash: ur.tx_hash || undefined,
      redemptionCode: ur.redemption_code || undefined,
      reward: {
        id: ur.reward_id,
        name: ur.name,
        description: ur.description,
        pointsRequired: ur.pointsRequired,
        type: ur.type,
        pickupAddress: ur.pickup_address || null
      }
    })))
  } catch (error) {
    console.error('获取兑换记录失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

/** 凭取货码/凭证码查询单条兑换记录（用于电子证书查看、取货核销等） */
router.get('/redemption-by-code/:code', (req, res) => {
  try {
    const code = String(req.params.code || '').trim()
    if (!code) return res.status(400).json({ error: '凭证码不能为空' })
    const row = db.prepare(`
      SELECT ur.id, ur.reward_id, ur.wallet_address, ur.redeemed_at, ur.tx_hash, ur.redemption_code,
             r.name as reward_name, r.description, r.points_required, r.type, r.pickup_address
      FROM user_rewards ur
      JOIN rewards r ON ur.reward_id = r.id
      WHERE UPPER(TRIM(ur.redemption_code)) = UPPER(?)
    `).get(code)
    if (!row) return res.status(404).json({ error: '未找到该凭证码对应的兑换记录' })
    res.json({
      id: row.id,
      rewardId: row.reward_id,
      rewardName: row.reward_name,
      description: row.description,
      pointsRequired: row.points_required,
      type: row.type,
      pickupAddress: row.pickup_address || null,
      redeemedAt: row.redeemed_at,
      txHash: row.tx_hash || undefined,
      redemptionCode: row.redemption_code
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '查询失败' })
  }
})

export default router








