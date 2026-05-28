import express from 'express'
import { getDB } from '../db/database.js'
import { requireStudent, requireAuditor } from '../middleware/auth.js'

const router = express.Router()
const db = getDB()

// 公开：获取行为类型与积分（与规则配置一致，供行为上报表单下拉使用）
router.get('/behavior-types', (req, res) => {
  try {
    const rows = db.prepare('SELECT behavior_type, points FROM behavior_rules ORDER BY behavior_type').all()
    res.json(rows.map(r => ({ behaviorType: r.behavior_type, points: Number(r.points) || 0 })))
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: '获取失败' })
  }
})

// 提交报告（要求至少有行为类型和图片；推荐已学号登录并绑定钱包）
router.post('/', (req, res) => {
  try {
    const {
      walletAddress,
      behaviorType,
      imageUrl,
      description,
      name: reportName,
      studentId,
      aiConfidence,
      aiBehaviorType,
      aiSuggestedPoints
    } = req.body

    if (!behaviorType || !imageUrl) {
      return res.status(400).json({ error: '缺少必要字段' })
    }

    // AI 预审：置信度 < 0.3 直接拒绝
    const confidence = aiConfidence != null ? Number(aiConfidence) : null
    let initialStatus = 'pending'
    if (confidence !== null && confidence < 0.3) {
      initialStatus = 'rejected'
    }

    // 先根据 studentId（如果有）查用户，再在必要时根据钱包查
    let user = null
    let finalStudentId = studentId || null

    if (studentId) {
      user = db.prepare('SELECT * FROM users WHERE student_id = ?').get(studentId)
      if (!user) {
        return res.status(400).json({ error: '学号不存在，请先完成学号注册' })
      }
    }

    // 若未携带学号，仅凭钱包尝试找到已绑定的学号（兼容旧数据）
    if (!user && walletAddress) {
      const byWallet = db.prepare('SELECT * FROM users WHERE wallet_address = ?').get(walletAddress)
      if (byWallet) {
        user = byWallet
        finalStudentId = byWallet.student_id || finalStudentId
      }
    }

    // 如果找到了用户且请求中也带了钱包地址，检查“学号-钱包”是否一一对应
    if (user && walletAddress) {
      const boundWallet = user.wallet_address
      if (boundWallet && boundWallet.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(400).json({ error: '当前连接的钱包地址与学号绑定的钱包不一致，请检查后重试' })
      }

      // 若当前学号尚未绑定钱包，但该钱包已绑定到其他学号，也不允许使用
      if (!boundWallet) {
        const other = db
          .prepare('SELECT student_id FROM users WHERE wallet_address = ? AND student_id != ?')
          .get(walletAddress, user.student_id)
        if (other) {
          return res
            .status(400)
            .json({ error: '该钱包已绑定到其他学号，请更换钱包或使用对应学号登录' })
        }
      }
    }

    // 不允许完全匿名（既没有学号，也没找到与钱包绑定的学号）
    if (!finalStudentId) {
      return res.status(400).json({
        error: '请先使用学号登录，并确认学号与积分钱包已绑定后再进行上报'
      })
    }

    // 如果用户存在且请求中带了姓名，则同步更新 users.name
    if (user && reportName != null && reportName !== '' && reportName !== user.name) {
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(reportName, user.id)
    }

    const usedWallet = walletAddress || (user && user.wallet_address) || null
    if (!usedWallet) {
      return res.status(400).json({ error: '缺少钱包地址，请先绑定或连接钱包' })
    }

    const stmt = db.prepare(`
      INSERT INTO reports (
        student_id,
        wallet_address,
        behavior_type,
        image_url,
        description,
        status,
        ai_confidence,
        ai_behavior_type,
        ai_suggested_points
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const result = stmt.run(
      finalStudentId,
      usedWallet,
      behaviorType,
      imageUrl,
      description || null,
      initialStatus,
      confidence,
      aiBehaviorType || null,
      aiSuggestedPoints ?? null
    )

    res.json({
      id: result.lastInsertRowid,
      studentId: finalStudentId,
      walletAddress: usedWallet,
      behaviorType,
      imageUrl,
      description,
      status: initialStatus,
      aiConfidence: confidence,
      aiBehaviorType: aiBehaviorType || null,
      aiSuggestedPoints: aiSuggestedPoints ?? null,
      createdAt: new Date().toISOString()
    })
  } catch (error) {
    console.error('提交报告失败:', error)
    res.status(500).json({ error: '提交失败' })
  }
})

// 将数据库行转为前端需要的结构（展示用姓名字段 name）
function reportRowToApi(row) {
  return {
    id: row.id,
    walletAddress: row.wallet_address,
    studentId: row.student_id,
    behaviorType: row.behavior_type,
    imageUrl: row.image_url,
    description: row.description,
    status: row.status,
    points: row.points,
    txHash: row.tx_hash,
    aiConfidence: row.ai_confidence,
    aiBehaviorType: row.ai_behavior_type,
    aiSuggestedPoints: row.ai_suggested_points,
    rejectReason: row.reject_reason,
    reviewedAt: row.reviewed_at,
    reviewedBy: row.reviewed_by,
    createdAt: row.created_at,
    name: row.name
  }
}

// 按钱包地址获取用户报告列表（前端 /report 页“我的报告”）
router.get('/user/:walletAddress', (req, res) => {
  try {
    const { walletAddress } = req.params
    const rows = db.prepare(`
      SELECT r.*, u.name
      FROM reports r
      LEFT JOIN users u ON r.wallet_address = u.wallet_address
      WHERE r.wallet_address = ?
      ORDER BY r.created_at DESC
    `).all(walletAddress)
    res.json(rows.map(reportRowToApi))
  } catch (error) {
    console.error('获取报告失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

// 按学号获取当前学生的报告列表（需学号登录）
router.get('/student/me', requireStudent, (req, res) => {
  try {
    const { studentId } = req.user
    const rows = db.prepare(`
      SELECT r.*, u.name
      FROM reports r
      LEFT JOIN users u ON r.wallet_address = u.wallet_address
      WHERE r.student_id = ?
      ORDER BY r.created_at DESC
    `).all(studentId)
    res.json(rows.map(reportRowToApi))
  } catch (error) {
    console.error('按学号获取报告失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

// 校园动态：最近报告（全部用户，不鉴权，供首页展示）
router.get('/recent', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50)
    const rows = db.prepare(`
      SELECT r.id, r.wallet_address, r.student_id, r.behavior_type, r.image_url, r.description,
             r.status, r.points, r.tx_hash, r.reviewed_at, r.reviewed_by, r.created_at, u.name
      FROM reports r
      LEFT JOIN users u ON r.wallet_address = u.wallet_address
      ORDER BY r.created_at DESC
      LIMIT ?
    `).all(limit)
    res.json(rows.map(reportRowToApi))
  } catch (error) {
    console.error('获取最近报告失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

// 获取所有待审核报告（管理员审核中心使用）
router.get('/pending', requireAuditor, (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT r.*, u.name
      FROM reports r
      LEFT JOIN users u ON r.wallet_address = u.wallet_address
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `).all()
    res.json(rows.map(reportRowToApi))
  } catch (error) {
    console.error('获取待审核报告失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

export default router








