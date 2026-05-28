import express from 'express'
import { getDB, syncPointsColumn } from '../db/database.js'
import { ethers } from 'ethers'
import { requireStudent } from '../middleware/auth.js'
import { getChainConfig } from '../config/chain.js'

const router = express.Router()
const db = getDB()
const ADMIN_PRIVATE_KEY = process.env.ADMIN_PRIVATE_KEY
const SIGN_EXPIRE_MS = 5 * 60 * 1000

// 解绑时不能把 reports/user_rewards.wallet_address 置为 NULL：
// reports.wallet_address 在 schema 中是 TEXT NOT NULL，同时启用了 foreign_keys 约束。
// 这里把“脱敏后的关联”转移到一个系统脱敏钱包，使得外键仍然成立，
// 同时用户自己的 wallet_address 会被清空，从而实现“可解绑 + 可被其他学号重新绑定”。
const DETACHED_WALLET_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const DETACHED_STUDENT_ID = '__detached_wallet__'

function parseSignedAt(input) {
  const n = Number(input)
  if (!Number.isFinite(n)) return null
  return n > 1e12 ? Math.floor(n) : Math.floor(n * 1000)
}

function walletAlreadyBound(address, studentId) {
  const row = db
    .prepare('SELECT student_id FROM users WHERE wallet_address = ? AND student_id != ?')
    .get(address, studentId)
  return !!row
}

// 绑定钱包：学号登录用户在兑换前触发
router.post('/bind', requireStudent, (req, res) => {
  try {
    const { walletAddress, signature } = req.body
    const { studentId } = req.user

    if (!walletAddress || !signature) {
      return res.status(400).json({ error: '缺少钱包地址或签名' })
    }

    if (walletAlreadyBound(walletAddress, studentId)) {
      return res.status(400).json({ error: '该钱包已绑定其他学号' })
    }

    const message = `Bind wallet for studentId:${studentId}`
    const recovered = ethers.verifyMessage(message, signature)
    if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
      return res.status(400).json({ error: '签名校验失败' })
    }

    db.prepare(`
      UPDATE users
      SET wallet_address = ?
      WHERE student_id = ?
    `).run(walletAddress, studentId)

    const user = db
      .prepare('SELECT escrow_points FROM users WHERE student_id = ?')
      .get(studentId)

    res.json({
      studentId,
      walletAddress,
      escrowPoints: user?.escrow_points || 0,
      canClaim: (user?.escrow_points || 0) > 0
    })
  } catch (err) {
    console.error('绑定钱包失败:', err)
    res.status(500).json({ error: '绑定失败' })
  }
})

// 解绑钱包：学号登录用户主动解除当前积分钱包的绑定关系
router.post('/unbind', requireStudent, (req, res) => {
  try {
    const { studentId } = req.user
    const user = db
      .prepare('SELECT wallet_address FROM users WHERE student_id = ?')
      .get(studentId)

    if (!user || !user.wallet_address) {
      return res.status(400).json({ error: '当前学号尚未绑定积分钱包' })
    }

    const oldWallet = user.wallet_address

    // 确保脱敏钱包存在（满足 FK users(wallet_address)）
    db.prepare(`
      INSERT OR IGNORE INTO users (student_id, password_hash, wallet_address, nickname, role, status)
      VALUES (?, ?, ?, ?, 'student', 'active')
    `).run(DETACHED_STUDENT_ID, null, DETACHED_WALLET_ADDRESS, 'detached')

    // 提醒：前端在调用前已进行二次确认；这里直接执行解绑和关联数据清理
    const tx = db.transaction(() => {
      // 将与该钱包地址关联的记录“脱敏”：保留记录，但不再关联此钱包
      db.prepare('UPDATE reports SET wallet_address = ? WHERE wallet_address = ?').run(DETACHED_WALLET_ADDRESS, oldWallet)
      db.prepare('UPDATE user_rewards SET wallet_address = ? WHERE wallet_address = ?').run(DETACHED_WALLET_ADDRESS, oldWallet)
      // 最后清除用户表中的钱包绑定，使该地址可以被其他学号重新绑定
      db.prepare('UPDATE users SET wallet_address = NULL WHERE student_id = ?').run(studentId)
    })

    tx()

    res.json({
      studentId,
      walletAddress: null,
      message: '已解绑，该积分地址相关记录已从当前账号中解除关联，可供其他用户重新绑定。'
    })
  } catch (err) {
    console.error('解绑钱包失败:', err)
    res.status(500).json({ error: '解绑失败' })
  }
})

// 查询当前学生钱包与链下积分状态
router.get('/me', requireStudent, (req, res) => {
  try {
    const { studentId } = req.user
    const user = db
      .prepare('SELECT wallet_address, escrow_points FROM users WHERE student_id = ?')
      .get(studentId)

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const escrowPoints = user.escrow_points || 0

    res.json({
      studentId,
      walletAddress: user.wallet_address || null,
      escrowPoints,
      canClaim: escrowPoints > 0
    })
  } catch (err) {
    console.error('获取钱包信息失败:', err)
    res.status(500).json({ error: '获取失败' })
  }
})

// 认领链下积分到链上：后端代付 Gas，调用合约 awardPoints（合约铸币给用户，非从管理员钱包转出）
router.post('/claim-escrow', requireStudent, async (req, res) => {
  try {
    const { rpcUrl, contractAddress } = getChainConfig()
    if (!contractAddress || !rpcUrl || !ADMIN_PRIVATE_KEY) {
      return res.status(500).json({ error: '未配置当前链的合约地址 / RPC / ADMIN_PRIVATE_KEY，无法认领积分' })
    }

    const { studentId } = req.user
    const { amount, signature, signedAt } = req.body || {}

    const user = db
      .prepare('SELECT wallet_address, escrow_points FROM users WHERE student_id = ?')
      .get(studentId)

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const walletAddress = user.wallet_address
    const escrowPoints = Number(user.escrow_points || 0)

    if (!walletAddress) {
      return res.status(400).json({ error: '尚未绑定钱包，无法认领' })
    }

    if (!Number.isFinite(escrowPoints) || escrowPoints <= 0) {
      return res.status(400).json({ error: '没有可认领的链下积分' })
    }

    let claimAmount = escrowPoints
    let requestedAmountText = 'all'
    if (amount !== undefined) {
      const reqAmount = Number(amount)
      if (!Number.isFinite(reqAmount) || reqAmount <= 0) {
        return res.status(400).json({ error: '认领数量必须大于 0' })
      }
      requestedAmountText = String(Math.floor(reqAmount))
      claimAmount = Math.min(escrowPoints, Math.floor(reqAmount))
    }

    if (claimAmount <= 0) {
      return res.status(400).json({ error: '认领数量无效' })
    }

    if (!signature || signedAt == null) {
      return res.status(400).json({ error: '缺少 signature 或 signedAt' })
    }
    const signedAtMs = parseSignedAt(signedAt)
    if (!signedAtMs) return res.status(400).json({ error: 'signedAt 无效' })
    if (Math.abs(Date.now() - signedAtMs) > SIGN_EXPIRE_MS) {
      return res.status(400).json({ error: '签名已过期，请重新发起认领' })
    }
    const message =
      `Claim escrow points\n` +
      `studentId:${studentId}\n` +
      `wallet:${String(walletAddress).toLowerCase()}\n` +
      `requestedAmount:${requestedAmountText}\n` +
      `signedAt:${signedAtMs}`
    const recovered = ethers.verifyMessage(message, signature)
    if (!recovered || recovered.toLowerCase() !== String(walletAddress).toLowerCase()) {
      return res.status(401).json({ error: '签名校验失败，请使用绑定钱包重新签名' })
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const adminWallet = new ethers.Wallet(ADMIN_PRIVATE_KEY, provider)
    const contractABI = [
      'function awardPoints(address to, uint256 amount, string memory reason) external'
    ]
    const contract = new ethers.Contract(contractAddress, contractABI, adminWallet)

    const amountWei = ethers.parseEther(claimAmount.toString())
    const tx = await contract.awardPoints(walletAddress, amountWei, '链下积分认领')
    const receipt = await tx.wait()

    // 链上成功后再扣减链下积分
    const updateStmt = db.prepare(`
      UPDATE users
      SET escrow_points = escrow_points - ?
      WHERE student_id = ? AND escrow_points >= ?
    `)
    const result = updateStmt.run(claimAmount, studentId, claimAmount)

    if (result.changes === 0) {
      // 理论上不会发生，如发生则记录但不回滚链上交易
      console.warn('认领后扣减链下积分失败，studentId=', studentId)
    }

    const updated = db
      .prepare('SELECT escrow_points FROM users WHERE student_id = ?')
      .get(studentId)
    syncPointsColumn(db, studentId, updated?.escrow_points ?? 0)

    res.json({
      success: true,
      txHash: receipt?.transactionHash || tx.hash,
      claimedPoints: claimAmount,
      newEscrowPoints: updated?.escrow_points || 0
    })
  } catch (err) {
    console.error('认领链下积分失败:', err)
    res.status(500).json({ error: '认领失败', details: err.message || String(err) })
  }
})

export default router

