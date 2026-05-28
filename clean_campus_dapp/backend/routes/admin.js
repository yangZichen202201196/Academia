import express from 'express'
import { getDB } from '../db/database.js'
import { ethers } from 'ethers'
import { requireAdmin, requireAuditor } from '../middleware/auth.js'
import { logOperation } from '../utils/operationLog.js'
import { getChainConfig } from '../config/chain.js'

const router = express.Router()
const db = getDB()

/** 校验某条报告的学号与积分地址是否一致，返回用于发放积分的钱包地址 */
function getAndValidateReportWallet(reportId, fallbackWallet) {
  const report = db
    .prepare('SELECT id, student_id, wallet_address FROM reports WHERE id = ?')
    .get(reportId)
  if (!report) {
    const err = new Error('报告不存在')
    err.code = 'REPORT_NOT_FOUND'
    throw err
  }

  const wallet = (report.wallet_address || fallbackWallet || '').trim()
  if (!wallet) {
    const err = new Error('报告缺少积分钱包地址，请先确保用户完成钱包绑定')
    err.code = 'NO_WALLET'
    throw err
  }

  const studentId = report.student_id || null

  // 若报告中带有学号，则要求：该学号在 users 中绑定的钱包（如有）必须与本报告钱包一致
  if (studentId) {
    const uByStudent = db
      .prepare('SELECT wallet_address FROM users WHERE student_id = ?')
      .get(studentId)
    if (uByStudent && uByStudent.wallet_address) {
      const bound = String(uByStudent.wallet_address).toLowerCase()
      if (bound && bound !== wallet.toLowerCase()) {
        const err = new Error('报告中的学号与当前积分地址不一致，请先在用户管理中修正绑定关系')
        err.code = 'STUDENT_WALLET_MISMATCH'
        throw err
      }
    }
  }

  // 反向检查：该钱包在 users 中若已绑定到某个学号，则必须与报告的学号一致
  const uByWallet = db
    .prepare('SELECT student_id FROM users WHERE wallet_address = ?')
    .get(wallet)
  if (uByWallet && studentId && uByWallet.student_id !== studentId) {
    const err = new Error('该积分地址已绑定到其他学号，与报告记录不一致，请先解绑或修正后再审核')
    err.code = 'WALLET_STUDENT_MISMATCH'
    throw err
  }

  return wallet
}

/** 根据报告的行为类型从规则表取积分，与规则配置一致 */
function getPointsByReportBehavior(reportId) {
  const report = db.prepare('SELECT behavior_type FROM reports WHERE id = ?').get(reportId)
  if (!report || !report.behavior_type) return null
  const rule = db.prepare('SELECT points FROM behavior_rules WHERE behavior_type = ?').get(report.behavior_type)
  if (!rule || rule.points == null) return null
  return Math.max(1, Math.floor(Number(rule.points)) || 10)
}

/** 检查某地址是否为合约管理员（可发放积分） */
async function checkContractAdmin(address) {
  const { rpcUrl, contractAddress } = getChainConfig()
  if (!contractAddress || !rpcUrl || !address) return false
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contract = new ethers.Contract(contractAddress, [
      'function admins(address) view returns (bool)'
    ], provider)
    return await contract.admins(address)
  } catch (_) {
    return false
  }
}

/** 链上合约是否就绪（可读 totalSupply） */
async function getContractStatus() {
  const { rpcUrl, contractAddress } = getChainConfig()
  if (!contractAddress || !rpcUrl) {
    return { ok: false, error: '未配置当前链的合约地址或 RPC' }
  }
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contract = new ethers.Contract(contractAddress, [
      'function totalSupply() view returns (uint256)'
    ], provider)
    const supply = await contract.totalSupply()
    return { ok: true, totalSupply: ethers.formatEther(supply) }
  } catch (e) {
    return { ok: false, error: e?.message || '链上无合约或 RPC 不可达，请按 DEPLOY.md 启动 node 并部署' }
  }
}

// ========== 审核中心（auditor + admin） ==========

// 合约就绪检测（审核页用于提示「链未就绪」）
router.get('/contract-status', requireAuditor, async (req, res) => {
  try {
    const status = await getContractStatus()
    res.json(status)
  } catch (e) {
    console.error(e)
    res.status(500).json({ ok: false, error: '检查失败' })
  }
})

// 检查当前连接的钱包是否为合约管理员（审核发放必须使用该钱包）
router.get('/check-auditor-wallet', requireAuditor, async (req, res) => {
  try {
    const { address } = req.query
    if (!address) return res.status(400).json({ error: '缺少 address 参数' })
    const isAdmin = await checkContractAdmin(address)
    res.json({ isAdmin })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '检查失败' })
  }
})

// 审核统计（待审、已通过、已驳回）
router.get('/audit-stats', requireAuditor, (req, res) => {
  try {
    const pendingToday = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'pending'`).get()?.c ?? 0
    const approvedCount = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'approved'`).get()?.c ?? 0
    const rejectedCount = db.prepare(`SELECT COUNT(*) as c FROM reports WHERE status = 'rejected'`).get()?.c ?? 0
    res.json({
      pendingToday: Number(pendingToday),
      approvedCount: Number(approvedCount),
      rejectedCount: Number(rejectedCount)
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

// 单条审核通过（链上发放由前端用管理员钱包完成，后端仅校验管理员身份并登记 txHash）
router.post('/approve', requireAuditor, async (req, res) => {
  try {
    const { reportId, points, walletAddress, auditorWalletAddress, txHash } = req.body
    const { studentId } = req.user

    if (!reportId || points == null || !walletAddress) {
      return res.status(400).json({ error: '缺少必要字段' })
    }
    if (!auditorWalletAddress || !txHash) {
      return res.status(400).json({ error: '请先使用合约管理员钱包在链上发放积分，再提交确认' })
    }

    const isAdmin = await checkContractAdmin(auditorWalletAddress)
    if (!isAdmin) {
      return res.status(403).json({ error: '当前钱包不是合约管理员，不允许审核发放。请连接积分管理员钱包。' })
    }

    let usedWallet
    try {
      usedWallet = getAndValidateReportWallet(reportId, walletAddress)
    } catch (e) {
      console.error('报告钱包校验失败:', e)
      return res.status(400).json({ error: e.message || '报告与积分地址校验失败' })
    }
    // 与规则配置一致：优先使用该报告行为类型在 behavior_rules 中的积分
    const safePoints = getPointsByReportBehavior(reportId) ?? Math.max(1, Math.floor(Number(points)) || 10)

    db.prepare(`
      UPDATE reports 
      SET status = 'approved', points = ?, reviewed_at = datetime('now'), reviewed_by = ?
      WHERE id = ?
    `).run(safePoints, studentId, reportId)

    logOperation({
      studentId,
      action: 'approve_report',
      targetType: 'report',
      targetId: reportId,
      details: JSON.stringify({ points: safePoints, txHash, auditorWalletAddress })
    })

    res.json({
      success: true,
      message: '审核通过，积分已发放',
      txHash,
      chainSuccess: true
    })
  } catch (error) {
    console.error('审核失败:', error)
    res.status(500).json({ error: '审核失败' })
  }
})

// 批量审核通过并由后端代发链上积分（路径须在 /reports/:reportId 之前注册）
router.post('/reports/approve-batch-with-chain', requireAuditor, async (req, res) => {
  const { items } = req.body || {} // [{ reportId, points }]
  const { studentId } = req.user
  const { rpcUrl, contractAddress } = getChainConfig()
  const adminKey = process.env.ADMIN_PRIVATE_KEY

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: '缺少 items 数组' })
  }
  if (!contractAddress || !rpcUrl || !adminKey) {
    return res.status(500).json({ error: '未配置链上环境' })
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl)
  const adminWallet = new ethers.Wallet(adminKey, provider)
  const contract = new ethers.Contract(contractAddress, [
    'function awardPoints(address to, uint256 amount, string memory reason) external'
  ], adminWallet)

  const results = []
  for (const it of items) {
    const reportId = Number(it.reportId)
    // 与规则配置一致：优先使用该报告行为类型在 behavior_rules 中的积分
    const points = getPointsByReportBehavior(reportId) ?? Math.max(1, Math.floor(Number(it.points)) || 10)
    if (!reportId || reportId <= 0) continue
    let walletAddress
    try {
      walletAddress = getAndValidateReportWallet(reportId, null)
    } catch (e) {
      return res.status(400).json({ error: `报告 ${reportId}: ${e.message}` })
    }
    try {
      const tx = await contract.awardPoints(walletAddress, ethers.parseEther(points.toString()), '环保行为奖励')
      const receipt = await tx.wait()
      const txHash = receipt?.transactionHash || tx.hash
      console.log('[链上] awardPoints 批量 →', walletAddress, points, 'GCT, txHash:', txHash)
      results.push({ reportId, points, txHash })
    } catch (e) {
      const msg = e?.reason || e?.shortMessage || e?.message || '链上发放失败'
      return res.status(500).json({ error: `报告 ${reportId} 发放失败: ${msg}` })
    }
  }

  for (const { reportId, points, txHash } of results) {
    db.prepare(`
      UPDATE reports SET status = 'approved', points = ?, reviewed_at = datetime('now'), reviewed_by = ?, tx_hash = ?
      WHERE id = ?
    `).run(points, studentId, txHash, reportId)
  }
  logOperation({
    studentId,
    action: 'approve_batch',
    targetType: 'report',
    details: JSON.stringify({ count: results.length, via: 'backend-award', items: results })
  })
  res.json({ success: true, message: `已批量通过 ${results.length} 条`, count: results.length, items: results })
})

// 审核通过并由后端代发链上积分（避免前端 MetaMask RPC 报错）
router.post('/reports/:reportId/approve-with-chain', requireAuditor, async (req, res) => {
  const reportId = Number(req.params.reportId)
  const { points } = req.body || {}
  const { studentId } = req.user
  const { rpcUrl, contractAddress } = getChainConfig()
  const adminKey = process.env.ADMIN_PRIVATE_KEY

  if (!reportId || reportId <= 0) {
    return res.status(400).json({ error: '无效的报告 ID' })
  }
  if (!contractAddress || !rpcUrl || !adminKey) {
    return res.status(500).json({ error: '未配置当前链的合约地址 / RPC / ADMIN_PRIVATE_KEY' })
  }

  let walletAddress
  try {
    walletAddress = getAndValidateReportWallet(reportId, null)
  } catch (e) {
    return res.status(400).json({ error: e.message || '报告与积分地址校验失败' })
  }

  // 与规则配置一致：优先使用该报告行为类型在 behavior_rules 中的积分
  const safePoints = getPointsByReportBehavior(reportId) ?? Math.max(1, Math.floor(Number(points)) || 10)
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const adminWallet = new ethers.Wallet(adminKey, provider)
    const contract = new ethers.Contract(contractAddress, [
      'function awardPoints(address to, uint256 amount, string memory reason) external'
    ], adminWallet)
    const amountWei = ethers.parseEther(safePoints.toString())
    const tx = await contract.awardPoints(walletAddress, amountWei, '环保行为奖励')
    console.log('[链上] awardPoints 已发送 →', walletAddress, safePoints, 'GCT, txHash:', tx.hash)
    const receipt = await tx.wait()
    const txHash = receipt?.transactionHash || tx.hash

    db.prepare(`
      UPDATE reports
      SET status = 'approved', points = ?, reviewed_at = datetime('now'), reviewed_by = ?, tx_hash = ?
      WHERE id = ?
    `).run(safePoints, studentId, txHash, reportId)

    logOperation({
      studentId,
      action: 'approve_report',
      targetType: 'report',
      targetId: reportId,
      details: JSON.stringify({ points: safePoints, txHash, via: 'backend-award' })
    })

    res.json({ success: true, txHash, message: '审核通过，积分已发放' })
  } catch (e) {
    console.error('后端代发积分失败:', e)
    const msg = e?.reason || e?.shortMessage || e?.message || '链上发放失败'
    res.status(500).json({ error: msg })
  }
})

// 批量审核通过（链上发放由前端用管理员钱包完成，每条需带 txHash；后端校验管理员身份并登记）
router.post('/approve-batch', requireAuditor, async (req, res) => {
  try {
    const { items, auditorWalletAddress } = req.body // items: [{ reportId, points, walletAddress, txHash }]
    const { studentId } = req.user

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: '缺少 items 数组' })
    }
    if (!auditorWalletAddress) {
      return res.status(400).json({ error: '请使用合约管理员钱包发起链上发放后再提交' })
    }

    const isAdmin = await checkContractAdmin(auditorWalletAddress)
    if (!isAdmin) {
      return res.status(403).json({ error: '当前钱包不是合约管理员，不允许审核发放。请连接积分管理员钱包。' })
    }

    const results = []
    for (const it of items) {
      const { reportId, points, walletAddress, txHash } = it
      if (!reportId || points == null || !walletAddress || !txHash) continue

      let usedWallet
      try {
        usedWallet = getAndValidateReportWallet(reportId, walletAddress)
      } catch (e) {
        console.error('批量审核：报告钱包校验失败 reportId=', reportId, e)
        continue
      }
      // 与规则配置一致：优先使用该报告行为类型在 behavior_rules 中的积分
      const safePoints = getPointsByReportBehavior(reportId) ?? Math.max(1, Math.floor(Number(points)) || 10)

      db.prepare(`
        UPDATE reports SET status = 'approved', points = ?, reviewed_at = datetime('now'), reviewed_by = ?, tx_hash = ?
        WHERE id = ?
      `).run(safePoints, studentId, txHash, reportId)
      results.push({ reportId, points: safePoints, txHash })
    }

    logOperation({
      studentId,
      action: 'approve_batch',
      targetType: 'report',
      details: JSON.stringify({ count: results.length, auditorWalletAddress, items: results })
    })

    res.json({ success: true, message: `已批量通过 ${results.length} 条`, count: results.length })
  } catch (error) {
    console.error('批量审核失败:', error)
    res.status(500).json({ error: '批量审核失败' })
  }
})

// 手动发放积分（测试用）：后台托管管理员私钥，直接在链上调用 awardPoints
router.post('/manual-award', requireAdmin, async (req, res) => {
  try {
    const { to, amount, reason } = req.body || {}
    if (!to || !amount) {
      return res.status(400).json({ error: '缺少接收地址或积分数量' })
    }

    const { rpcUrl, contractAddress } = getChainConfig()
    const adminKey = process.env.ADMIN_PRIVATE_KEY

    if (!contractAddress || !rpcUrl || !adminKey) {
      return res.status(500).json({ error: '未配置当前链的合约地址 / RPC / ADMIN_PRIVATE_KEY' })
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const adminWallet = new ethers.Wallet(adminKey, provider)
    const contract = new ethers.Contract(contractAddress, [
      'function awardPoints(address to, uint256 amount, string memory reason) external'
    ], adminWallet)

    const pts = Math.max(1, Math.floor(Number(amount)) || 0)
    const amountWei = ethers.parseEther(pts.toString())
    const tx = await contract.awardPoints(to, amountWei, reason || '手动发放')
    const receipt = await tx.wait()
    const txHash = receipt?.transactionHash || tx.hash

    res.json({ success: true, txHash })
  } catch (e) {
    console.error('手动链上发放失败:', e)
    const msg = e?.reason || e?.shortMessage || e?.message || '链上发放失败'
    res.status(500).json({ error: msg })
  }
})

// 拒绝报告（含原因）
router.post('/reject', requireAuditor, (req, res) => {
  try {
    const { reportId, reason } = req.body
    const { studentId } = req.user

    if (!reportId) return res.status(400).json({ error: '缺少报告ID' })

    db.prepare(`
      UPDATE reports SET status = 'rejected', reject_reason = ?, reviewed_at = datetime('now'), reviewed_by = ?
      WHERE id = ?
    `).run(reason || null, studentId, reportId)

    logOperation({
      studentId,
      action: 'reject_report',
      targetType: 'report',
      targetId: reportId,
      details: reason || ''
    })

    res.json({ success: true, message: '已拒绝' })
  } catch (error) {
    console.error('拒绝失败:', error)
    res.status(500).json({ error: '操作失败' })
  }
})

// ========== 奖品管理（仅 admin） ==========

router.get('/rewards', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM rewards ORDER BY points_required ASC').all()
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      pointsRequired: r.points_required,
      type: r.type,
      stock: r.stock,
      status: r.status || 'on_shelf',
      imageUrl: r.image_url,
      pickupAddress: r.pickup_address || null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

router.post('/rewards', requireAdmin, (req, res) => {
  try {
    const { name, description, pointsRequired, type, stock, imageUrl, pickupAddress } = req.body
    if (!name || !description || pointsRequired == null || !type) {
      return res.status(400).json({ error: '缺少必要字段' })
    }
    const result = db.prepare(`
      INSERT INTO rewards (name, description, points_required, type, stock, status, image_url, pickup_address)
      VALUES (?, ?, ?, ?, ?, 'on_shelf', ?, ?)
    `).run(name, description, Number(pointsRequired) || 0, type, Number(stock) || 0, imageUrl || null, pickupAddress || null)
    res.json({ id: result.lastInsertRowid, success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '新增失败' })
  }
})

router.put('/rewards/:id', requireAdmin, (req, res) => {
  try {
    const id = Number(req.params.id)
    const { name, description, pointsRequired, type, stock, status, imageUrl, pickupAddress } = req.body
    const r = db.prepare('SELECT id FROM rewards WHERE id = ?').get(id)
    if (!r) return res.status(404).json({ error: '奖励不存在' })

    const updates = []
    const params = []
    if (name != null) { updates.push('name = ?'); params.push(name) }
    if (description != null) { updates.push('description = ?'); params.push(description) }
    if (pointsRequired != null) { updates.push('points_required = ?'); params.push(Number(pointsRequired)) }
    if (type != null) { updates.push('type = ?'); params.push(type) }
    if (stock != null) { updates.push('stock = ?'); params.push(Number(stock)) }
    if (status != null) { updates.push('status = ?'); params.push(status) }
    if (imageUrl !== undefined) { updates.push('image_url = ?'); params.push(imageUrl || null) }
    if (pickupAddress !== undefined) { updates.push('pickup_address = ?'); params.push(pickupAddress || null) }
    if (updates.length === 0) return res.status(400).json({ error: '无更新字段' })

    updates.push("updated_at = datetime('now')")
    params.push(id)
    db.prepare(`UPDATE rewards SET ${updates.join(', ')} WHERE id = ?`).run(...params)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '更新失败' })
  }
})

router.get('/rewards/redemptions', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT ur.*, r.name as reward_name, r.points_required
      FROM user_rewards ur
      JOIN rewards r ON ur.reward_id = r.id
      ORDER BY ur.redeemed_at DESC
      LIMIT 200
    `).all()
    res.json(rows.map(row => ({
      id: row.id,
      rewardId: row.reward_id,
      rewardName: row.reward_name,
      pointsRequired: row.points_required,
      walletAddress: row.wallet_address,
      redeemedAt: row.redeemed_at
    })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

// ========== 规则配置（仅 admin） ==========

router.get('/rules', requireAdmin, (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM behavior_rules ORDER BY behavior_type').all()
    res.json(rows.map(r => ({
      id: r.id,
      behaviorType: r.behavior_type,
      points: r.points,
      dailyLimit: r.daily_limit,
      validDays: r.valid_days,
      updatedAt: r.updated_at
    })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

router.put('/rules', requireAdmin, (req, res) => {
  try {
    const { rules } = req.body // [{ behaviorType, points, dailyLimit, validDays }]
    if (!Array.isArray(rules)) return res.status(400).json({ error: 'rules 需为数组' })

    for (const r of rules) {
      const { behaviorType, points, dailyLimit, validDays } = r
      if (!behaviorType) continue
      const existing = db.prepare('SELECT id FROM behavior_rules WHERE behavior_type = ?').get(behaviorType)
      if (existing) {
        db.prepare(`
          UPDATE behavior_rules SET points = ?, daily_limit = ?, valid_days = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(Number(points) ?? 10, Number(dailyLimit) ?? 10, Number(validDays) ?? 365, existing.id)
      } else {
        db.prepare(`
          INSERT INTO behavior_rules (behavior_type, points, daily_limit, valid_days)
          VALUES (?, ?, ?, ?)
        `).run(behaviorType, Number(points) ?? 10, Number(dailyLimit) ?? 10, Number(validDays) ?? 365)
      }
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '更新失败' })
  }
})

// ========== 用户管理（auditor 可查看，admin 可禁用） ==========

router.get('/users', requireAuditor, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT id, student_id, name, college, escrow_points, role, status, created_at, wallet_address
      FROM users
      WHERE student_id IS NOT NULL AND student_id != ''
      ORDER BY created_at DESC
      LIMIT 500
    `).all()
    res.json(rows.map(u => ({
      id: u.id,
      studentId: u.student_id,
      name: u.name,
      college: u.college,
      escrowPoints: u.escrow_points,
      role: u.role,
      status: u.status || 'active',
      createdAt: u.created_at,
      walletAddress: u.wallet_address || null
    })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

// 链上添加管理员（仅合约 owner 可调，使用 RPC 如 8545）
const CONTRACT_OWNER_ABI = [
  'function addAdmin(address admin) external',
  'function removeAdmin(address admin) external'
]

router.post('/users/add-admin', requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.body || {}
    const operatorId = req.user?.studentId
    const sid = String(studentId || '').trim()
    if (!sid) return res.status(400).json({ error: '学号不能为空' })

    const user = db.prepare('SELECT id, student_id, wallet_address, role FROM users WHERE student_id = ?').get(sid)
    if (!user) return res.status(404).json({ error: '用户不存在' })
    if (!user.wallet_address || String(user.wallet_address).trim() === '') {
      return res.status(400).json({ error: '该用户未绑定钱包，请先让用户在个人中心绑定钱包后再设为管理员' })
    }
    if (user.role === 'admin' || user.role === 'auditor') {
      return res.status(400).json({ error: '该用户已是管理员或审核员' })
    }

    const { rpcUrl, contractAddress } = getChainConfig()
    const ownerKey = process.env.ADMIN_PRIVATE_KEY
    if (!contractAddress || !rpcUrl || !ownerKey) {
      return res.status(500).json({ error: '未配置当前链的合约地址 / RPC / ADMIN_PRIVATE_KEY（需为合约 owner）' })
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const ownerWallet = new ethers.Wallet(ownerKey, provider)
    const contract = new ethers.Contract(contractAddress, CONTRACT_OWNER_ABI, ownerWallet)
    const walletAddr = String(user.wallet_address).trim()
    const tx = await contract.addAdmin(walletAddr)
    const receipt = await tx.wait()
    const txHash = receipt?.transactionHash || tx.hash

    db.prepare("UPDATE users SET role = 'admin' WHERE student_id = ?").run(sid)
    logOperation({
      studentId: operatorId,
      action: 'add_admin',
      targetType: 'user',
      targetId: user.id,
      details: JSON.stringify({ studentId: sid, walletAddress: walletAddr, txHash })
    })
    res.json({ success: true, txHash, message: '已上链并设为管理员' })
  } catch (e) {
    console.error('添加链上管理员失败:', e)
    const msg = e?.reason || e?.shortMessage || e?.message || '链上操作失败'
    res.status(500).json({ error: msg })
  }
})

router.post('/users/remove-admin', requireAdmin, async (req, res) => {
  try {
    const { studentId } = req.body || {}
    const operatorId = req.user?.studentId
    const sid = String(studentId || '').trim()
    if (!sid) return res.status(400).json({ error: '学号不能为空' })

    const user = db.prepare('SELECT id, student_id, wallet_address, role FROM users WHERE student_id = ?').get(sid)
    if (!user) return res.status(404).json({ error: '用户不存在' })
    if (user.role !== 'admin' && user.role !== 'auditor') {
      return res.status(400).json({ error: '该用户不是管理员或审核员' })
    }
    const walletAddr = user.wallet_address ? String(user.wallet_address).trim() : ''
    if (!walletAddr) {
      db.prepare("UPDATE users SET role = 'student' WHERE student_id = ?").run(sid)
      logOperation({ studentId: operatorId, action: 'remove_admin', targetType: 'user', targetId: user.id, details: sid })
      return res.json({ success: true, message: '已移除后台权限（未绑定钱包，无链上操作）' })
    }

    const { rpcUrl, contractAddress } = getChainConfig()
    const ownerKey = process.env.ADMIN_PRIVATE_KEY
    if (!contractAddress || !rpcUrl || !ownerKey) {
      return res.status(500).json({ error: '未配置当前链的合约地址 / RPC / ADMIN_PRIVATE_KEY' })
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const ownerWallet = new ethers.Wallet(ownerKey, provider)
    const contract = new ethers.Contract(contractAddress, CONTRACT_OWNER_ABI, ownerWallet)
    const tx = await contract.removeAdmin(walletAddr)
    const receipt = await tx.wait()
    const txHash = receipt?.transactionHash || tx.hash

    db.prepare("UPDATE users SET role = 'student' WHERE student_id = ?").run(sid)
    logOperation({
      studentId: operatorId,
      action: 'remove_admin',
      targetType: 'user',
      targetId: user.id,
      details: JSON.stringify({ studentId: sid, walletAddress: walletAddr, txHash })
    })
    res.json({ success: true, txHash, message: '已上链并移除管理员' })
  } catch (e) {
    console.error('移除链上管理员失败:', e)
    const msg = e?.reason || e?.shortMessage || e?.message || '链上操作失败'
    res.status(500).json({ error: msg })
  }
})

router.post('/users/:studentId/status', requireAdmin, (req, res) => {
  try {
    const studentId = String(req.params.studentId || '').trim()
    const { status } = req.body // 'active' | 'banned'
    if (!studentId) {
      return res.status(400).json({ error: '学号不能为空' })
    }
    if (!['active', 'banned'].includes(status)) {
      return res.status(400).json({ error: 'status 需为 active 或 banned' })
    }
    const r = db.prepare('UPDATE users SET status = ? WHERE student_id = ?').run(status, studentId)
    if (r.changes === 0) {
      return res.status(404).json({ error: '未找到该学号对应用户，请确认后重试' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '操作失败' })
  }
})

router.get('/operation-logs', requireAuditor, (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500)
    const rows = db.prepare(`
      SELECT * FROM operation_logs ORDER BY created_at DESC LIMIT ?
    `).all(limit)
    res.json(rows.map(o => ({
      id: o.id,
      studentId: o.student_id,
      action: o.action,
      targetType: o.target_type,
      targetId: o.target_id,
      details: o.details,
      createdAt: o.created_at
    })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

export default router
