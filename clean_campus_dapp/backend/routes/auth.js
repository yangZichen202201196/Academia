import express from 'express'
import { getDB } from '../db/database.js'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { ethers } from 'ethers'
import crypto from 'crypto'

const router = express.Router()
const db = getDB()
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

/** 获取当前登录用户信息（用于刷新 role 等） */
router.get('/me', (req, res) => {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })
  try {
    const payload = jwt.verify(token, JWT_SECRET)
    const user = db.prepare('SELECT student_id, name, college, wallet_address, escrow_points, role, status FROM users WHERE student_id = ?').get(payload.studentId)
    if (!user) return res.status(401).json({ error: '用户不存在' })
    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: '账号已被禁用' })
    }
    const points = user.escrow_points ?? user.user_points ?? 0
    res.json({
      studentId: user.student_id,
      name: user.name,
      college: user.college,
      walletAddress: user.wallet_address,
      escrowPoints: points,
      hasWalletBound: !!user.wallet_address,
      role: user.role || 'student'
    })
  } catch (err) {
    return res.status(401).json({ error: '登录已失效' })
  }
})
const CUSTODY_ENC_KEY = process.env.CUSTODY_ENC_KEY || 'dev-custody-key-change-me'

function encryptPrivateKey(privKey) {
  // 使用 AES-256-GCM 简单加密私钥（生产环境务必更换密钥策略）
  const key = crypto.createHash('sha256').update(CUSTODY_ENC_KEY).digest()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(privKey, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, encrypted]).toString('base64')
}

// 学号注册：
// 步骤1：前端输入学号 + 初始密码 + 正式密码 + 基本资料
// 步骤2：后端校验学号在白名单中，且 initialPassword 与 white.initial_pwd 一致
// 步骤3：使用“正式密码”生成 password_hash，创建用户，并为其生成托管地址
router.post('/register', (req, res) => {
  try {
    const { studentId, initialPassword, password, name, college } = req.body

    if (!studentId || !initialPassword || !password) {
      return res.status(400).json({ error: '缺少学号或密码' })
    }

    const white = db
      .prepare('SELECT * FROM student_whitelist WHERE student_id = ?')
      .get(studentId)
    if (!white) {
      return res.status(400).json({ error: '学号不在白名单中，无法注册' })
    }

    // 校验初始密码（模拟学校系统下发的默认密码）
    if (white.initial_pwd && white.initial_pwd !== initialPassword) {
      return res.status(401).json({ error: '初始密码不正确' })
    }

    const exists = db
      .prepare('SELECT id FROM users WHERE student_id = ?')
      .get(studentId)
    if (exists) {
      return res.status(400).json({ error: '该学号已注册' })
    }

    const passwordHash = bcrypt.hashSync(password, 10)

    // 生成托管地址（系统代管）
    const custodyWallet = ethers.Wallet.createRandom()
    const encryptedPriv = encryptPrivateKey(custodyWallet.privateKey)

    // 管理员账号（学号为 admin）注册时直接赋予 admin 角色
    const role = studentId === 'admin' ? 'admin' : 'student'
    const stmt = db.prepare(`
      INSERT INTO users (
        student_id,
        password_hash,
        name,
        college,
        escrow_points,
        role,
        custody_address,
        custody_private_key_encrypted,
        status
      )
      VALUES (?, ?, ?, ?, 0, ?, ?, ?, 'active')
    `)
    const result = stmt.run(
      studentId,
      passwordHash,
      name || white.name || null,
      college || white.college || null,
      role,
      custodyWallet.address,
      encryptedPriv
    )

    const token = jwt.sign(
      { userId: result.lastInsertRowid, studentId, role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    res.json({
      token,
      studentId,
      name: name || white.name,
      college: college || white.college,
      escrowPoints: 0,
      hasWalletBound: false
    })
  } catch (err) {
    console.error('注册失败:', err)
    res.status(500).json({ error: '注册失败' })
  }
})

// 学号登录
router.post('/login', (req, res) => {
  try {
    const { studentId, password } = req.body
    if (!studentId || !password) {
      return res.status(400).json({ error: '缺少学号或密码' })
    }

    const user = db
      .prepare('SELECT * FROM users WHERE student_id = ?')
      .get(studentId)
    if (!user) return res.status(401).json({ error: '学号不存在' })

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: '账号已被禁用，请联系管理员' })
    }

    const ok = bcrypt.compareSync(password, user.password_hash || '')
    if (!ok) return res.status(401).json({ error: '密码错误' })

    const token = jwt.sign(
      { userId: user.id, studentId: user.student_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    const points = user.escrow_points ?? user.user_points ?? 0
    res.json({
      token,
      studentId: user.student_id,
      name: user.name,
      college: user.college,
      walletAddress: user.wallet_address,
      escrowPoints: points,
      hasWalletBound: !!user.wallet_address,
      role: user.role || 'student'
    })
  } catch (err) {
    console.error('登录失败:', err)
    res.status(500).json({ error: '登录失败' })
  }
})

// 钱包登录：如果钱包地址已在 users 表中绑定某个学号，则自动生成学号登录态
router.post('/login-wallet', (req, res) => {
  try {
    const { walletAddress } = req.body
    if (!walletAddress) {
      return res.status(400).json({ error: '缺少钱包地址' })
    }

    const user = db
      .prepare('SELECT * FROM users WHERE wallet_address = ?')
      .get(walletAddress)

    if (!user) {
      return res
        .status(404)
        .json({ error: '该钱包尚未绑定学号，请先使用学号登录并在首页绑定钱包后再尝试' })
    }

    if (user.status && user.status !== 'active') {
      return res.status(403).json({ error: '账号已被禁用，请联系管理员' })
    }

    const token = jwt.sign(
      { userId: user.id, studentId: user.student_id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    )

    const points = user.escrow_points ?? user.user_points ?? 0

    res.json({
      token,
      studentId: user.student_id,
      name: user.name,
      college: user.college,
      walletAddress: user.wallet_address,
      escrowPoints: points,
      hasWalletBound: !!user.wallet_address,
      role: user.role || 'student'
    })
  } catch (err) {
    console.error('钱包登录失败:', err)
    res.status(500).json({ error: '钱包登录失败' })
  }
})

export default router

