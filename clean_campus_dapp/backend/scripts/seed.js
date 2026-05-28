/**
 * 系统数据种子脚本 - 补充至少 20 个用户及相应操作信息
 * 运行: node scripts/seed.js (在 backend 目录下)
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

// 与 database 初始化一致：示例 IPFS 图，便于审核页直接看到真实配图
const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'
const DEMO_IPFS_CIDS = [
  'bafybeifzawej6g2sckzvnyekyhosph43wjtyd7xmge5puizf4qr4edz73q',
  'bafybeihvpcmbueugzt3y7fhbr6ro6pepvggce6q7lvxwdrpu6l6ojje5o4',
  'bafybeihgc3tmm4qe5xfygr75s6jpxi7s2uqcl2kjsdx5halj2ptgp2mpau',
  'bafybeiagshsxaxuvfosmygdbkurrg2nxwrwwg2743sk3k543tgrjuz7qhi',
  'bafybeicvmqfetafbwx4so3s2inohko2jt7wdniejquewnjdls3misvqblm',
  'bafybeidndzjctdewoxzugbxhiseqp6q2waiy2sxs2g5u35x6thqslbkeja',
  'bafybeib2tawwjnvjbcu23qvft7yiakiz6fkupahrtu575z6f7ivcfnufse',
  'bafybeidixvvuj7yqfkhpzg4utvwwsraul3hh3yxj4ux6rethunz4kxxxqi'
]

function demoImageUrl (index) {
  return IPFS_GATEWAY + DEMO_IPFS_CIDS[index % DEMO_IPFS_CIDS.length]
}

// 20+ 名学生（2026 级示例学号 + 学院名便于答辩演示）
const STUDENTS = [
  { studentId: '2026310101', name: '陈思远', college: '计算机科学与技术学院' },
  { studentId: '2026310201', name: '林雨桐', college: '环境科学与工程学院' },
  { studentId: '2026310301', name: '王梓涵', college: '能源与动力工程学院' },
  { studentId: '2026310401', name: '赵宇航', college: '机械工程学院' },
  { studentId: '2026310501', name: '钱佳怡', college: '电气工程学院' },
  { studentId: '2026310601', name: '孙博文', college: '材料科学与工程学院' },
  { studentId: '2026310701', name: '周子墨', college: '化学工程学院' },
  { studentId: '2026310801', name: '吴若曦', college: '建筑与城市规划学院' },
  { studentId: '2026310901', name: '郑浩然', college: '经济管理学院' },
  { studentId: '2026311001', name: '王诗涵', college: '公共管理学院' },
  { studentId: '2026311101', name: '李俊熙', college: '法学院' },
  { studentId: '2026311201', name: '陈语彤', college: '人文学院' },
  { studentId: '2026311301', name: '刘景行', college: '理学院' },
  { studentId: '2026311401', name: '杨思琪', college: '外国语学院' },
  { studentId: '2026311501', name: '黄明轩', college: '艺术设计与传媒学院' },
  { studentId: '2026311601', name: '林可欣', college: '体育学院' },
  { studentId: '2026310102', name: '何志远', college: '计算机科学与技术学院' },
  { studentId: '2026310202', name: '徐静雯', college: '环境科学与工程学院' },
  { studentId: '2026310302', name: '马骏驰', college: '能源与动力工程学院' },
  { studentId: '2026310402', name: '朱欣怡', college: '机械工程学院' },
  { studentId: '2026310502', name: '胡文博', college: '电气工程学院' },
  { studentId: '2026310602', name: '郭晓雯', college: '材料科学与工程学院' }
]

// 干净校园行为（与后端 behavior_rules 口径保持一致）
const BEHAVIOR_RULES = [
  { behaviorType: '校园卫生整治', points: 12 },
  { behaviorType: '宿舍内务整理', points: 6 },
  { behaviorType: '教室自觉清扫', points: 8 },
  { behaviorType: '楼道与楼梯清洁', points: 8 },
  { behaviorType: '校园“弯腰行动”', points: 4 },
  { behaviorType: '垃圾分类投放', points: 5 },
  { behaviorType: '垃圾分类宣传志愿服务', points: 8 },
  { behaviorType: '共享单车规范摆放', points: 5 },
  { behaviorType: '公共卫生间清洁维护', points: 10 },
  { behaviorType: '食堂餐桌清理与文明就餐', points: 4 },
  { behaviorType: '寝室走廊与门前“三包”', points: 6 },
  { behaviorType: '黑板报与宣传栏整洁维护', points: 5 },
  { behaviorType: '无烟楼层巡查与劝导', points: 6 },
  { behaviorType: '爱护公物·擦拭与保养', points: 6 },
  { behaviorType: '拒绝乱贴乱画专项行动', points: 10 },
  { behaviorType: '绿化带杂物清理', points: 6 },
  { behaviorType: '教学楼自习区整洁维护', points: 6 },
  { behaviorType: '宿舍区垃圾桶定点维护', points: 6 },
  { behaviorType: '干净校园主题宣传活动', points: 5 },
  { behaviorType: '环保创意海报/标语设计', points: 10 },
  { behaviorType: '绿色校园绿植养护', points: 5 },
  { behaviorType: '其他干净校园志愿服务', points: 5 }
]

const BEHAVIOR_TYPES = BEHAVIOR_RULES.map(r => r.behaviorType)
const POINTS_BY_BEHAVIOR = Object.fromEntries(BEHAVIOR_RULES.map(r => [r.behaviorType, r.points]))

const BEHAVIOR_SCENE = {
  '校园卫生整治': (name) => `参与「校园卫生整治志愿服务」，清理绿化带与校园死角垃圾，并对公共区域进行简单打扫。（${name}）`,
  '宿舍内务整理': (name) => `完成寝室卫生清扫与物品归位：地面拖扫、桌面整理、垃圾打包带走。（${name}）`,
  '教室自觉清扫': (name) => `课后自觉清扫教室：整理桌椅、清理地面纸屑、擦拭讲台/黑板，保持教室整洁。（${name}）`,
  '楼道与楼梯清洁': (name) => `清理楼道与楼梯间杂物：扫除烟头纸屑，保持通道畅通无杂物。（${name}）`,
  '校园“弯腰行动”': (name) => `路过随手捡拾地面垃圾（纸屑/瓶子/塑料袋等），投入就近垃圾桶。（${name}）`,
  '垃圾分类投放': (name) => `在宿舍楼下垃圾分类点按规定投放：可回收物与其他垃圾分开，拍照留存。（${name}）`,
  '垃圾分类宣传志愿服务': (name) => `在垃圾分类点位做引导志愿：提醒同学正确分类投放，协助维持点位整洁。（${name}）`,
  '共享单车规范摆放': (name) => `整理共享单车乱停放：将车辆集中摆放到划线区域，避免堵塞道路。（${name}）`,
  '公共卫生间清洁维护': (name) => `协助公共卫生间清洁维护：擦拭洗手台/镜面、清理地面水渍，保持干净无异味。（${name}）`,
  '食堂餐桌清理与文明就餐': (name) => `食堂就餐后主动清理餐桌：餐具归位、擦拭桌面、椅子复位，倡导文明就餐。（${name}）`,
  '寝室走廊与门前“三包”': (name) => `完成寝室门前与走廊责任区卫生：清扫地面、清理散落垃圾，保持区域干净。（${name}）`,
  '黑板报与宣传栏整洁维护': (name) => `维护宣传栏整洁：清理过期海报与残胶，保持版面整洁清爽。（${name}）`,
  '无烟楼层巡查与劝导': (name) => `参与无烟校园巡查劝导：在楼层公共区域提醒文明禁烟，维护清新环境。（${name}）`,
  '爱护公物·擦拭与保养': (name) => `擦拭课桌、栏杆等公共设施并进行简单保养，倡议爱护公物不损坏。（${name}）`,
  '拒绝乱贴乱画专项行动': (name) => `参与“拒绝涂鸦/乱贴”专项：清理墙面小广告与乱贴纸张，保持环境整洁。（${name}）`,
  '绿化带杂物清理': (name) => `清理花坛与绿化带杂物：捡拾塑料、纸屑等，保护校园绿化环境。（${name}）`,
  '教学楼自习区整洁维护': (name) => `整理自习区公共桌面：清理残留垃圾与饮品杯，保持学习环境安静整洁。（${name}）`,
  '宿舍区垃圾桶定点维护': (name) => `维护宿舍区垃圾桶周边整洁：清理桶边散落垃圾，提醒同学规范投放。（${name}）`,
  '干净校园主题宣传活动': (name) => `参加干净校园主题团日/班会：围绕环境卫生与文明习惯进行分享与倡议。（${name}）`,
  '环保创意海报/标语设计': (name) => `提交“干净校园”主题海报/标语作品，用于线上线下宣传展示。（${name}）`,
  '绿色校园绿植养护': (name) => `认养/养护校园绿植：浇水修剪、清理枯叶，让公共空间更整洁美观。（${name}）`,
  '其他干净校园志愿服务': (name) => `参与其他与校园整洁相关的志愿服务，完成任务并提交记录。（${name}）`
}

function reportDescription (behavior, name) {
  const fn = BEHAVIOR_SCENE[behavior] || BEHAVIOR_SCENE['其他干净校园志愿服务']
  return fn(name)
}

function run() {
  console.log('开始执行数据种子脚本...')

  // 1. 学号白名单
  const insertWhite = db.prepare(`
    INSERT OR IGNORE INTO student_whitelist (student_id, name, college, initial_pwd)
    VALUES (?, ?, ?, ?)
  `)
  for (const s of STUDENTS) {
    insertWhite.run(s.studentId, s.name, s.college, DEFAULT_PWD)
  }
  console.log(`已补充学号白名单: ${STUDENTS.length} 条`)

  // 2. 用户表（学号注册 + 绑定钱包）
  const insertUser = db.prepare(`
    INSERT INTO users (student_id, password_hash, name, college, escrow_points, role, wallet_address, status)
    VALUES (?, ?, ?, ?, 0, 'student', ?, 'active')
  `)
  const updateWallet = db.prepare(`
    UPDATE users SET wallet_address = ?, wallet_bound_at = datetime('now') WHERE student_id = ? AND (wallet_address IS NULL OR wallet_address = '')
  `)
  let userCount = 0
  const usedWallets = new Set()
  for (let i = 0; i < STUDENTS.length; i++) {
    const s = STUDENTS[i]
    if (s.studentId === 'admin') continue // admin 由系统初始化
    let wallet = HARDHAT_ACCOUNTS[i % HARDHAT_ACCOUNTS.length]
    while (usedWallets.has(wallet.toLowerCase())) {
      wallet = HARDHAT_ACCOUNTS[(i + usedWallets.size) % HARDHAT_ACCOUNTS.length]
    }
    usedWallets.add(wallet.toLowerCase())
    try {
      const exists = db.prepare('SELECT id FROM users WHERE student_id = ?').get(s.studentId)
      if (!exists) {
        insertUser.run(s.studentId, PASSWORD_HASH, s.name, s.college, wallet)
        userCount++
      } else {
        const bound = db.prepare('SELECT wallet_address FROM users WHERE student_id = ?').get(s.studentId)
        if (!bound?.wallet_address) updateWallet.run(wallet, s.studentId)
      }
    } catch (e) {
      if (e.message?.includes('UNIQUE')) {
        wallet = HARDHAT_ACCOUNTS[(i + 10) % HARDHAT_ACCOUNTS.length]
        try { insertUser.run(s.studentId, PASSWORD_HASH, s.name, s.college, wallet); userCount++ } catch (_) {}
      }
    }
  }
  console.log(`已补充/更新用户: ${userCount} 条`)

  // 3. 报告（环保行为上报）- 每人若干条，含待审/已通过/已驳回
  const insertReport = db.prepare(`
    INSERT INTO reports (student_id, wallet_address, behavior_type, image_url, description, status, points, ai_confidence, ai_suggested_points, reviewed_at, reviewed_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const getRewardIds = db.prepare('SELECT id FROM rewards LIMIT 4').all()
  const rewardIds = getRewardIds.map(r => r.id)
  if (rewardIds.length === 0) {
    console.warn('rewards 表为空，请先启动后端完成数据库初始化')
  }

  let reportCount = 0
  const now = new Date().toISOString()
  const dayAgo = (d) => new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString()

  for (let i = 0; i < Math.min(22, STUDENTS.length); i++) {
    const s = STUDENTS[i]
    const user = db.prepare('SELECT id, wallet_address FROM users WHERE student_id = ?').get(s.studentId)
    if (!user || !user.wallet_address) continue
    const wallet = user.wallet_address

    const numReports = 2 + (i % 4) // 每人 2~5 条
    for (let r = 0; r < numReports; r++) {
      const behavior = BEHAVIOR_TYPES[r % BEHAVIOR_TYPES.length]
      const points = Number(POINTS_BY_BEHAVIOR[behavior] ?? 5)
      const statusRand = r % 5
      let status = 'pending'
      let pts = null
      let reviewedAt = null
      let reviewedBy = null
      if (statusRand === 0) {
        status = 'approved'
        pts = points
        reviewedAt = dayAgo(r)
        reviewedBy = 'admin'
      } else if (statusRand === 1) {
        status = 'rejected'
        reviewedAt = dayAgo(r)
        reviewedBy = 'admin'
      }
      try {
        insertReport.run(
          s.studentId,
          wallet,
          behavior,
          demoImageUrl(reportCount + i * 10 + r),
          reportDescription(behavior, s.name),
          status,
          pts,
          0.85,
          points,
          reviewedAt,
          reviewedBy,
          dayAgo(r + 1)
        )
        reportCount++
      } catch (e) {
        console.warn('报告插入跳过:', e?.message)
      }
    }
  }
  console.log(`已补充报告: ${reportCount} 条`)

  // 4. 用户兑换记录（需 users 表中有对应 wallet_address）
  const insertUserReward = db.prepare(`
    INSERT INTO user_rewards (reward_id, wallet_address, redeemed_at)
    VALUES (?, ?, ?)
  `)
  const userWallets = db.prepare('SELECT wallet_address FROM users WHERE wallet_address IS NOT NULL').all()
  let redeemCount = 0
  for (let i = 0; i < Math.min(15, userWallets.length); i++) {
    const wallet = userWallets[i].wallet_address
    const rewardId = rewardIds[i % (rewardIds.length || 1)]
    if (!rewardId) continue
    try {
      insertUserReward.run(rewardId, wallet, dayAgo(i + 2))
      redeemCount++
    } catch (e) {
      // 忽略重复等
    }
  }
  console.log(`已补充兑换记录: ${redeemCount} 条`)

  // 5. 操作日志（模拟管理员审核等）
  const insertLog = db.prepare(`
    INSERT INTO operation_logs (user_id, student_id, action, target_type, target_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const adminUser = db.prepare('SELECT id FROM users WHERE student_id = ?').get('admin') || db.prepare('SELECT id FROM users WHERE role IN (\'admin\',\'auditor\')').get()
  const adminId = adminUser?.id ?? null
  const reports = db.prepare('SELECT id, student_id FROM reports WHERE status = ? LIMIT 20').all('approved')
  for (let i = 0; i < Math.min(15, reports.length); i++) {
    const r = reports[i]
    insertLog.run(
      adminId,
      'admin',
      'approve_report',
      'report',
      r.id,
      JSON.stringify({ points: 10, txHash: `0x${'a'.repeat(64)}`, auditorWalletAddress: HARDHAT_ACCOUNTS[19] }),
      dayAgo(i)
    )
  }
  console.log(`已补充操作日志: ${Math.min(15, reports.length)} 条`)

  // 6. 同步积分信息：按已通过报告汇总，更新用户的 escrow_points（链下可认领积分）
  const updateEscrow = db.prepare(`
    UPDATE users SET escrow_points = (
      SELECT COALESCE(SUM(r.points), 0)
      FROM reports r
      WHERE r.wallet_address = users.wallet_address AND r.status = 'approved'
    )
    WHERE wallet_address IS NOT NULL
  `)
  try {
    updateEscrow.run()
    const withPoints = db.prepare('SELECT COUNT(*) as c FROM users WHERE wallet_address IS NOT NULL AND escrow_points > 0').get().c
    console.log(`已同步积分信息: ${withPoints} 名用户具有链下积分(escrow_points)`)
  } catch (e) {
    console.warn('同步积分跳过:', e?.message)
  }

  // 统计
  const userTotal = db.prepare('SELECT COUNT(*) as c FROM users').get().c
  const reportTotal = db.prepare('SELECT COUNT(*) as c FROM reports').get().c
  const rewardTotal = db.prepare('SELECT COUNT(*) as c FROM user_rewards').get().c
  const logTotal = db.prepare('SELECT COUNT(*) as c FROM operation_logs').get().c

  console.log('--- 种子数据执行完成 ---')
  console.log(`用户总数: ${userTotal}`)
  console.log(`报告总数: ${reportTotal}`)
  console.log(`兑换记录总数: ${rewardTotal}`)
  console.log(`操作日志总数: ${logTotal}`)
  const totalEscrow = db.prepare('SELECT COALESCE(SUM(escrow_points), 0) as s FROM users').get().s
  console.log(`链下积分合计(escrow_points): ${totalEscrow}`)
  console.log('默认密码: 123456 (学号登录)')
  closeDB()
}

run()
