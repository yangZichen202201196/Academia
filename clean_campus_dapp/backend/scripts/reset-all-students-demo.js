/**
 * 重置演示用数据（保留学号白名单）：
 * 1) 删除全体学生的链下行为与兑换记录：reports / user_rewards / operation_logs
 * 2) 重置 users：积分清零、取消钱包绑定（wallet_address 置空）
 * 3) 删除解绑时插入的系统脱敏“伪用户”（__detached_wallet__）
 *
 * 运行：node scripts/reset-all-students-demo.js
 */

import { initDatabase, getDB, closeDB } from '../db/database.js'

const DETACHED_STUDENT_ID = '__detached_wallet__'

function main() {
  initDatabase()
  const db = getDB()

  db.pragma('foreign_keys = ON')

  const tx = db.transaction(() => {
    // 删除子表，避免外键约束问题
    const userRewardsDel = db.prepare('DELETE FROM user_rewards').run()
    const reportsDel = db.prepare('DELETE FROM reports').run()
    const logsDel = db.prepare('DELETE FROM operation_logs').run()

    // 删除所有非 admin 用户记录（保留系统管理员账号，便于后台管理与答辩演示）
    const usersDel = db.prepare(`
      DELETE FROM users
      WHERE role != 'admin'
    `).run()

    // 同时将 admin 的积分与绑定清零，保持干净状态
    const adminReset = db.prepare(`
      UPDATE users
      SET escrow_points = 0,
          wallet_address = NULL,
          wallet_bound_at = NULL
      WHERE role = 'admin'
    `).run()

    // 清理解绑过程插入的脱敏伪用户（如果存在）
    const detachedDel = db.prepare('DELETE FROM users WHERE student_id = ?').run(DETACHED_STUDENT_ID)

    console.log('已删除：')
    console.log('  user_rewards:', userRewardsDel.changes)
    console.log('  reports:', reportsDel.changes)
    console.log('  operation_logs:', logsDel.changes)
    console.log('已删除 users（非 admin）：', usersDel.changes)
    console.log('已重置 admin 用户积分与绑定：', adminReset.changes)
    console.log('已删除脱敏伪用户（如存在）：', detachedDel.changes)
  })

  tx()
  closeDB()
  console.log('已完成：清空学生行为 + 重置积分与钱包绑定（保留 student_whitelist）')
}

main()

