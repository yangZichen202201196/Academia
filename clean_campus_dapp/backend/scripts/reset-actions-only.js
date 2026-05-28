/**
 * 清空“行为/操作”相关数据，保留用户信息：
 * - 保留 student_whitelist
 * - 保留 users（不删用户），可选清零 escrow_points
 * - 删除 reports / user_rewards / operation_logs
 *
 * 运行：node scripts/reset-actions-only.js
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
    const escrowReset = db.prepare('UPDATE users SET escrow_points = 0').run()

    console.log('已删除：')
    console.log('  user_rewards:', userRewardsDel.changes)
    console.log('  reports:', reportsDel.changes)
    console.log('  operation_logs:', logsDel.changes)
    console.log('已清零 users.escrow_points:', escrowReset.changes)
  })

  tx()
  closeDB()
  console.log('完成：仅保留用户信息（users + student_whitelist）')
}

main()

