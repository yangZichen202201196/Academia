/**
 * 重置到“只保留白名单”：
 * - 保留 student_whitelist（由 initDatabase() 自动补齐）
 * - 删除 users（含 admin/脱敏伪用户等全部用户）
 * - 删除 reports / user_rewards / operation_logs（避免外键约束）
 *
 * 运行：node scripts/reset-whitelist-only.js
 */
import { initDatabase, getDB, closeDB } from '../db/database.js'

function main() {
  initDatabase()
  const db = getDB()

  db.pragma('foreign_keys = ON')

  const tx = db.transaction(() => {
    const userRewardsDel = db.prepare('DELETE FROM user_rewards').run()
    const reportsDel = db.prepare('DELETE FROM reports').run()
    const logsDel = db.prepare('DELETE FROM operation_logs').run()

    const usersDel = db.prepare('DELETE FROM users').run()

    console.log('已删除：')
    console.log('  user_rewards:', userRewardsDel.changes)
    console.log('  reports:', reportsDel.changes)
    console.log('  operation_logs:', logsDel.changes)
    console.log('  users:', usersDel.changes)
  })

  tx()
  closeDB()
  console.log('完成：当前仅保留 student_whitelist（白名单）')
}

main()

