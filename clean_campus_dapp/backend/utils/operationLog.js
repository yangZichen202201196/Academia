import { getDB } from '../db/database.js'

export function logOperation({ userId, studentId, action, targetType, targetId, details }) {
  try {
    const db = getDB()
    db.prepare(`
      INSERT INTO operation_logs (user_id, student_id, action, target_type, target_id, details)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId ?? null, studentId ?? null, action, targetType ?? null, targetId ?? null, details ?? null)
  } catch (e) {
    console.warn('操作日志写入失败:', e?.message)
  }
}
