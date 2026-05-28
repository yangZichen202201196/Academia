import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret'

export function requireStudent(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    // 学生接口：默认学生账号可用，同时允许 admin/auditor 也访问学生视角的数据
    if (payload.role !== 'student' && payload.role !== 'admin' && payload.role !== 'auditor') {
      return res.status(403).json({ error: '学生权限不足' })
    }
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: '登录已失效' })
  }
}

export function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.role !== 'admin') {
      return res.status(403).json({ error: '需要 admin 权限' })
    }
    req.admin = payload
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: '登录已失效' })
  }
}

/** 审核中心：admin 或 auditor 均可访问 */
export function requireAuditor(req, res, next) {
  const auth = req.headers.authorization || ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return res.status(401).json({ error: '未登录' })

  try {
    const payload = jwt.verify(token, JWT_SECRET)
    if (payload.role !== 'admin' && payload.role !== 'auditor') {
      return res.status(403).json({ error: '需要审核员或管理员权限' })
    }
    req.admin = payload
    req.user = payload
    next()
  } catch (err) {
    return res.status(401).json({ error: '登录已失效' })
  }
}

