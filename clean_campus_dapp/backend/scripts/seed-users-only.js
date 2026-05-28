/**
 * 仅灌入“用户信息”演示数据：
 * - 保留/补齐 student_whitelist（由 initDatabase() 自动完成）
 * - 生成 users（学生账号 + 绑定钱包），不生成 reports/user_rewards/operation_logs
 *
 * 运行：node scripts/seed-users-only.js
 */
import bcrypt from 'bcryptjs'
import { initDatabase, getDB, closeDB } from '../db/database.js'

initDatabase()
const db = getDB()

// Hardhat 默认 20 个测试账户 + 2 个备用（与 npx hardhat node 一致，便于本地测试）
const HARDHAT_ACCOUNTS = [
  '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199',
  '0xdD2FD4581271e230360230F9337D5c0430Bf44C0',
  '0xbDA5747bFD65F08deb54cb465eB87D40e51B197E',
  '0x2546BcD3c84621e976D8185a91A922aE77ECEc30',
  '0xcd3B766CCDd6AE721141F452C550Ca635964ce71',
  '0xdF3e18d64BC6A983f673Ab319CCaE4f1a57C7097',
  '0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec',
  '0xFABB0ac9d68B0B445fB7357272Ff202C5651694a',
  '0x71bE63f3384f5fb98995898A86B02Fb2426c5788',
  '0xBcd4042DE499D14e55001CcbB24a551F3b954096',
  '0xa0Ee7A142d267C1f36714E4a8F75612F20a79720',
  '0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f',
  '0x14dC79964da2C08b23698B3D3cc7Ca32193d9955',
  '0x976EA74026E726554dB657fA54763abd0C3a0aa9',
  '0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc',
  '0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65',
  '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
  '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
  '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
  '0x0000000000000000000000000000000000000011',
  '0x0000000000000000000000000000000000000012'
]

const DEFAULT_PWD = '123456'
const PASSWORD_HASH = bcrypt.hashSync(DEFAULT_PWD, 10)

function run() {
  console.log('开始执行 users-only 种子脚本...')

  // 从白名单读取学生（admin 不自动建为 student）
  const rows = db
    .prepare(`SELECT student_id as studentId, name, college FROM student_whitelist WHERE student_id != 'admin' ORDER BY student_id`)
    .all()

  const insertUser = db.prepare(`
    INSERT INTO users (student_id, password_hash, name, college, escrow_points, role, wallet_address, status, wallet_bound_at)
    VALUES (?, ?, ?, ?, 0, 'student', ?, 'active', datetime('now'))
  `)
  const updateUser = db.prepare(`
    UPDATE users SET
      name = COALESCE(?, name),
      college = COALESCE(?, college),
      status = 'active'
    WHERE student_id = ?
  `)

  let created = 0
  let updated = 0
  const usedWallets = new Set()

  for (let i = 0; i < rows.length; i++) {
    const s = rows[i]
    const studentId = String(s.studentId)
    const exists = db.prepare('SELECT id, wallet_address FROM users WHERE student_id = ?').get(studentId)

    let wallet = HARDHAT_ACCOUNTS[i % HARDHAT_ACCOUNTS.length]
    while (usedWallets.has(wallet.toLowerCase())) {
      wallet = HARDHAT_ACCOUNTS[(i + usedWallets.size) % HARDHAT_ACCOUNTS.length]
    }
    usedWallets.add(wallet.toLowerCase())

    if (!exists) {
      try {
        insertUser.run(studentId, PASSWORD_HASH, s.name || null, s.college || null, wallet)
        created++
      } catch (e) {
        console.warn('插入用户跳过:', studentId, e?.message || e)
      }
    } else {
      // 不强行改已有绑定钱包（演示时保持稳定），只补齐姓名学院
      updateUser.run(s.name || null, s.college || null, studentId)
      updated++
    }
  }

  const userTotal = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  console.log('--- users-only 种子完成 ---')
  console.log('新建 users:', created)
  console.log('更新 users:', updated)
  console.log('users 总数:', userTotal)
  console.log('默认密码: 123456 (学号登录)')
  closeDB()
}

run()

