import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function resolveSqlitePath(databaseUrlOrPath) {
  if (!databaseUrlOrPath) return path.resolve(__dirname, '../database.db')

  let p = String(databaseUrlOrPath).trim()
  if (p.startsWith('sqlite:')) p = p.slice('sqlite:'.length)
  p = p.replace(/^\/\//, '') // tolerate sqlite://./xxx

  if (!p) return path.resolve(__dirname, '../database.db')
  if (path.isAbsolute(p)) return p

  // Resolve relative to backend root (../), not to this file's folder (db/)
  return path.resolve(__dirname, '..', p)
}

const dbPath = resolveSqlitePath(process.env.DATABASE_URL)
const db = new Database(dbPath)

// Safer defaults for concurrent reads + occasional writes
db.pragma('journal_mode = WAL')
db.pragma('synchronous = NORMAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

export function initDatabase() {
  const tableExists = (tableName) => {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
      .get(tableName)
    return !!row
  }

  const getColumns = (tableName) => {
    try {
      return db.prepare(`PRAGMA table_info(${tableName})`).all().map(c => c.name)
    } catch {
      return []
    }
  }

  const hasColumn = (tableName, columnName) => getColumns(tableName).includes(columnName)

  const addColumnIfMissing = (tableName, columnName, sqlType) => {
    if (!tableExists(tableName)) return
    if (hasColumn(tableName, columnName)) return
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${sqlType}`)
  }

  // 用户表（以学号为主，钱包为辅）
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE,                  -- 学号（白名单模拟可为空，推荐新用户必填）
      password_hash TEXT,                     -- 学号登录密码哈希
      wallet_address TEXT UNIQUE,             -- 区块链钱包地址（可选）
      nickname TEXT,
      name TEXT,                              -- 姓名
      college TEXT,                           -- 学院
      escrow_points INTEGER DEFAULT 0,        -- 链下积分
      role TEXT DEFAULT 'student',            -- student / admin
      custody_address TEXT,                   -- 托管地址（系统代管，用于接收链上积分）
      custody_private_key_encrypted TEXT,     -- 托管地址私钥（加密存储）
      wallet_bound_at DATETIME,               -- 绑定自有钱包的时间
      status TEXT DEFAULT 'active',           -- active / banned
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 报告表
  db.exec(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT,                        -- 提交者学号（新逻辑）
      wallet_address TEXT NOT NULL,
      behavior_type TEXT NOT NULL,
      image_url TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending',
      points INTEGER,
      ai_confidence REAL,                    -- AI 初审置信度 0-1
      ai_behavior_type TEXT,                 -- AI 识别行为类型
      ai_suggested_points INTEGER,           -- AI 建议积分
      reject_reason TEXT,                    -- 拒绝原因
      reviewed_at DATETIME,                  -- 审核时间
      reviewed_by TEXT,                      -- 审核人学号
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
    )
  `)

  // 奖励表
  db.exec(`
    CREATE TABLE IF NOT EXISTS rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      points_required INTEGER NOT NULL,
      type TEXT NOT NULL,
      stock INTEGER DEFAULT 0,
      status TEXT DEFAULT 'on_shelf',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `)

  // 用户奖励表
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_rewards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reward_id INTEGER NOT NULL,
      wallet_address TEXT NOT NULL,
      redeemed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (reward_id) REFERENCES rewards(id),
      FOREIGN KEY (wallet_address) REFERENCES users(wallet_address)
    )
  `)

  // 行为规则表（积分值、上限、有效期）
  db.exec(`
    CREATE TABLE IF NOT EXISTS behavior_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      behavior_type TEXT UNIQUE NOT NULL,
      points INTEGER NOT NULL DEFAULT 10,
      daily_limit INTEGER DEFAULT 10,
      valid_days INTEGER DEFAULT 365,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME
    )
  `)

  // 操作日志表
  db.exec(`
    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      student_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `)

  // 学号白名单表（用于模拟学校学号库，可选）
  db.exec(`
    CREATE TABLE IF NOT EXISTS student_whitelist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id TEXT UNIQUE NOT NULL,
      name TEXT,
      college TEXT,
      initial_pwd TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // 兼容旧版本 & 迁移：只做“加列 + 迁移数据”，不破坏旧列
  // users: 补充 wallet_address / 学号相关字段 / 角色等
  try {
    addColumnIfMissing('users', 'wallet_address', 'TEXT')
    addColumnIfMissing('users', 'student_id', 'TEXT')
    addColumnIfMissing('users', 'password_hash', 'TEXT')
    addColumnIfMissing('users', 'escrow_points', 'INTEGER DEFAULT 0')
    // 若存在 user_points 列，将数据同步到 escrow_points（兼容旧 schema）
    if (tableExists('users') && hasColumn('users', 'user_points') && hasColumn('users', 'escrow_points')) {
      db.exec(`UPDATE users SET escrow_points = COALESCE(user_points, escrow_points) WHERE user_points IS NOT NULL`)
    }
    addColumnIfMissing('users', 'role', 'TEXT DEFAULT \'student\'')
    addColumnIfMissing('users', 'name', 'TEXT')
    addColumnIfMissing('users', 'college', 'TEXT')
    addColumnIfMissing('users', 'custody_address', 'TEXT')
    addColumnIfMissing('users', 'custody_private_key_encrypted', 'TEXT')
    addColumnIfMissing('users', 'wallet_bound_at', 'DATETIME')
    addColumnIfMissing('users', 'status', 'TEXT DEFAULT \'active\'')
    if (tableExists('users') && hasColumn('users', 'walletAddress')) {
      db.exec(`UPDATE users SET wallet_address = COALESCE(wallet_address, walletAddress)`)
    }
    // 索引补充（若已有会抛错，忽略）
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address)`)
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_student_id ON users(student_id)`)
  } catch (e) {
    console.warn('users 表迁移跳过：', e?.message || e)
  }

  // reports: walletAddress/behaviorType/imageUrl/createdAt -> snake_case + AI 字段
  try {
    addColumnIfMissing('reports', 'wallet_address', 'TEXT')
    addColumnIfMissing('reports', 'behavior_type', 'TEXT')
    addColumnIfMissing('reports', 'image_url', 'TEXT')
    addColumnIfMissing('reports', 'created_at', 'DATETIME')
    addColumnIfMissing('reports', 'redeemed_at', 'DATETIME')
    addColumnIfMissing('reports', 'ai_confidence', 'REAL')
    addColumnIfMissing('reports', 'ai_behavior_type', 'TEXT')
    addColumnIfMissing('reports', 'ai_suggested_points', 'INTEGER')
    addColumnIfMissing('reports', 'reject_reason', 'TEXT')
    addColumnIfMissing('reports', 'reviewed_at', 'DATETIME')
    addColumnIfMissing('reports', 'reviewed_by', 'TEXT')
    addColumnIfMissing('reports', 'tx_hash', 'TEXT')

    if (tableExists('reports')) {
      if (hasColumn('reports', 'walletAddress')) {
        db.exec(`UPDATE reports SET wallet_address = COALESCE(wallet_address, walletAddress)`)
      }
      if (hasColumn('reports', 'behaviorType')) {
        db.exec(`UPDATE reports SET behavior_type = COALESCE(behavior_type, behaviorType)`)
      }
      if (hasColumn('reports', 'imageUrl')) {
        db.exec(`UPDATE reports SET image_url = COALESCE(image_url, imageUrl)`)
      }
      if (hasColumn('reports', 'createdAt')) {
        db.exec(`UPDATE reports SET created_at = COALESCE(created_at, createdAt)`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_wallet_address ON reports(wallet_address)`)
      db.exec(`CREATE INDEX IF NOT EXISTS idx_reports_status_created ON reports(status, created_at)`)

      // 将空白或无效的 report 图片替换为有效 IPFS 图片，避免审核中心显示错误空白图
      const IPFS_GATEWAY = 'https://gateway.pinata.cloud/ipfs/'
      const IPFS_CIDS = [
        'bafybeifzawej6g2sckzvnyekyhosph43wjtyd7xmge5puizf4qr4edz73q',
        'bafybeihvpcmbueugzt3y7fhbr6ro6pepvggce6q7lvxwdrpu6l6ojje5o4',
        'bafybeihgc3tmm4qe5xfygr75s6jpxi7s2uqcl2kjsdx5halj2ptgp2mpau',
        'bafybeiagshsxaxuvfosmygdbkurrg2nxwrwwg2743sk3k543tgrjuz7qhi',
        'bafybeicvmqfetafbwx4so3s2inohko2jt7wdniejquewnjdls3misvqblm',
        'bafybeidndzjctdewoxzugbxhiseqp6q2waiy2sxs2g5u35x6thqslbkeja',
        'bafybeib2tawwjnvjbcu23qvft7yiakiz6fkupahrtu575z6f7ivcfnufse',
        'bafybeidixvvuj7yqfkhpzg4utvwwsraul3hh3yxj4ux6rethunz4kxxxqi',
        'bafybeia4dcpttepzqzwff73kbtclcxtgpah3jrcp2ge4bgugiefqd6bwku',
        'bafybeibqhzmnriplzutf4cq3heu7youvjkgrkoycl44bue3uihtcdu277e'
      ]
      const needImageFix = db.prepare(`
        SELECT id FROM reports
        WHERE COALESCE(trim(image_url), '') = ''
           OR image_url LIKE '%placeholder%'
           OR image_url LIKE '%placeholder.com%'
           OR (image_url LIKE 'data:%' AND length(image_url) < 500)
      `).all()
      if (needImageFix.length > 0) {
        const stmt = db.prepare('UPDATE reports SET image_url = ? WHERE id = ?')
        for (let i = 0; i < needImageFix.length; i++) {
          const cid = IPFS_CIDS[i % IPFS_CIDS.length]
          stmt.run(IPFS_GATEWAY + cid, needImageFix[i].id)
        }
      }
    }
  } catch (e) {
    console.warn('reports 表迁移跳过：', e?.message || e)
  }

  // rewards: pointsRequired -> points_required, status, image_url, pickup_address
  try {
    addColumnIfMissing('rewards', 'points_required', 'INTEGER')
    addColumnIfMissing('rewards', 'status', 'TEXT DEFAULT \'on_shelf\'')
    addColumnIfMissing('rewards', 'updated_at', 'DATETIME')
    addColumnIfMissing('rewards', 'image_url', 'TEXT')
    addColumnIfMissing('rewards', 'pickup_address', 'TEXT')
    if (tableExists('rewards') && hasColumn('rewards', 'pointsRequired')) {
      db.exec(`UPDATE rewards SET points_required = COALESCE(points_required, pointsRequired)`)
    }
    // 为未填写领取地址的已有奖品补全具体说明（避免全部显示“凭取货码到指定地点领取”）
    if (tableExists('rewards') && hasColumn('rewards', 'pickup_address')) {
      const rows = db.prepare('SELECT id, name, type FROM rewards WHERE COALESCE(trim(pickup_address), \'\') = \'\'').all()
      const stmt = db.prepare('UPDATE rewards SET pickup_address = ? WHERE id = ?')
      for (const r of rows) {
        const name = (r.name || '').toLowerCase()
        const type = (r.type || '').toLowerCase()
        let addr
        if (type === 'certificate') {
          addr = '本页点击「查看证书」在线查看'
        } else if (name.includes('食堂') || name.includes('代金券')) {
          addr = '东区/西区食堂收银台出示取货码'
        } else if (name.includes('兑换码')) {
          addr = '凭兑换码至合作商家或线上客服兑换'
        } else {
          addr = '学生事务中心一楼礼品领取处'
        }
        stmt.run(addr, r.id)
      }
    }
    db.exec(`CREATE INDEX IF NOT EXISTS idx_rewards_points_required ON rewards(points_required)`)
  } catch (e) {
    console.warn('rewards 表迁移跳过：', e?.message || e)
  }

  // user_rewards: rewardId/walletAddress/redeemedAt -> snake_case
  try {
    addColumnIfMissing('user_rewards', 'reward_id', 'INTEGER')
    addColumnIfMissing('user_rewards', 'wallet_address', 'TEXT')
    addColumnIfMissing('user_rewards', 'redeemed_at', 'DATETIME')
    addColumnIfMissing('user_rewards', 'tx_hash', 'TEXT')
    addColumnIfMissing('user_rewards', 'redemption_code', 'TEXT')
    if (tableExists('user_rewards')) {
      if (hasColumn('user_rewards', 'rewardId')) {
        db.exec(`UPDATE user_rewards SET reward_id = COALESCE(reward_id, rewardId)`)
      }
      if (hasColumn('user_rewards', 'walletAddress')) {
        db.exec(`UPDATE user_rewards SET wallet_address = COALESCE(wallet_address, walletAddress)`)
      }
      if (hasColumn('user_rewards', 'redeemedAt')) {
        db.exec(`UPDATE user_rewards SET redeemed_at = COALESCE(redeemed_at, redeemedAt)`)
      }
      db.exec(`CREATE INDEX IF NOT EXISTS idx_user_rewards_wallet ON user_rewards(wallet_address)`)
    }
  } catch (e) {
    console.warn('user_rewards 表迁移跳过：', e?.message || e)
  }

  // 初始化默认奖励（共 20 个，不足则补齐）
  const DEFAULT_REWARDS = [
    { name: '清园兑换码·10元', description: '合作商户无门槛抵扣，演示用虚拟券码', pointsRequired: 50, type: 'code', stock: 100, pickupAddress: '凭兑换码至合作商家或线上客服核销' },
    { name: '清园兑换码·20元', description: '积分较高档奖励，适合展示大额兑换流程', pointsRequired: 100, type: 'code', stock: 50, pickupAddress: '凭兑换码至合作商家或线上客服核销' },
    { name: '电子证书·环保达人', description: '完成多笔审核通过上报后可申领，用于答辩展示链下凭证', pointsRequired: 200, type: 'certificate', stock: 999, pickupAddress: '在线查看电子证书' },
    { name: '电子证书·绿色先锋', description: '高积分成就类证书，突出累计环保贡献', pointsRequired: 500, type: 'certificate', stock: 999, pickupAddress: '在线查看电子证书' },
    { name: '清园兑换码·5元', description: '低门槛小额券，便于演示「快速兑换」', pointsRequired: 25, type: 'code', stock: 200, pickupAddress: '凭兑换码至合作商家或线上客服核销' },
    { name: '清园兑换码·30元', description: '限量高面值券，展示库存与兑换约束', pointsRequired: 150, type: 'code', stock: 30, pickupAddress: '凭兑换码至合作商家或线上客服核销' },
    { name: '清园主题帆布包', description: '校园文创·再生棉混纺，礼品柜实物领取', pointsRequired: 80, type: 'code', stock: 100, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '清园随行杯', description: '不锈钢双层保温杯，倡导自带杯减塑', pointsRequired: 120, type: 'code', stock: 80, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '桌面绿植盆栽', description: '小型多肉/绿萝，美化宿舍与自习空间', pointsRequired: 60, type: 'code', stock: 150, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '电子证书·低碳达人', description: '绿色出行与节能行为累计达标', pointsRequired: 300, type: 'certificate', stock: 999, pickupAddress: '在线查看电子证书' },
    { name: '电子证书·节约标兵', description: '节水节电类行为突出', pointsRequired: 250, type: 'certificate', stock: 999, pickupAddress: '在线查看电子证书' },
    { name: '再生纸文具套装', description: '笔记本+再生纸笔，贴合无纸化办公宣传', pointsRequired: 40, type: 'code', stock: 200, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '清园食堂代金券·5元', description: '东/西区食堂窗口抵扣现金', pointsRequired: 30, type: 'code', stock: 300, pickupAddress: '清园东区/西区食堂收银台出示取货码' },
    { name: '清园食堂代金券·10元', description: '适合演示「积分换餐」场景', pointsRequired: 55, type: 'code', stock: 150, pickupAddress: '清园东区/西区食堂收银台出示取货码' },
    { name: '环保书签套装', description: '竹纤维书签四枚装，轻量文创', pointsRequired: 15, type: 'code', stock: 500, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '电子证书·绿色志愿者', description: '参与志愿清扫或宣传活动记录', pointsRequired: 150, type: 'certificate', stock: 999, pickupAddress: '在线查看电子证书' },
    { name: '可水洗口罩', description: '可重复使用的布口罩，减少一次性消耗', pointsRequired: 20, type: 'code', stock: 400, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '可降解购物袋', description: '玉米淀粉材质，替代一次性塑料袋', pointsRequired: 10, type: 'code', stock: 600, pickupAddress: '清园学生事务中心一楼服务台' },
    { name: '电子证书·环保之星', description: '系统内积分排名前列可申请', pointsRequired: 400, type: 'certificate', stock: 999, pickupAddress: '在线查看电子证书' },
    { name: '清园文创徽章', description: '珐琅工艺校徽+绿叶元素，收藏向', pointsRequired: 35, type: 'code', stock: 180, pickupAddress: '清园学生事务中心一楼服务台' }
  ]
  const rewardCount = db.prepare('SELECT COUNT(*) as count FROM rewards').get()
  if (rewardCount.count < DEFAULT_REWARDS.length) {
    const insertReward = db.prepare(`
      INSERT INTO rewards (name, description, points_required, type, stock, pickup_address)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    const existsByName = db.prepare('SELECT id FROM rewards WHERE name = ?')
    for (const r of DEFAULT_REWARDS) {
      if (!existsByName.get(r.name)) {
        insertReward.run(r.name, r.description, r.pointsRequired, r.type, r.stock, r.pickupAddress || null)
      }
    }
  }

  // 旧版默认奖励名称 → 新版「清园」主题（已有库启动时自动对齐文案）
  try {
    const rewardRename = db.prepare(`
      UPDATE rewards SET name = ?, description = ?, pickup_address = COALESCE(?, pickup_address)
      WHERE name = ?
    `)
    const LEGACY_REWARD_LABELS = [
      ['兑换码-10元', '清园兑换码·10元', '合作商户无门槛抵扣，演示用虚拟券码', '凭兑换码至合作商家或线上客服核销'],
      ['兑换码-20元', '清园兑换码·20元', '积分较高档奖励，适合展示大额兑换流程', '凭兑换码至合作商家或线上客服核销'],
      ['电子证书-环保达人', '电子证书·环保达人', '完成多笔审核通过上报后可申领，用于答辩展示链下凭证', '在线查看电子证书'],
      ['电子证书-绿色先锋', '电子证书·绿色先锋', '高积分成就类证书，突出累计环保贡献', '在线查看电子证书'],
      ['兑换码-5元', '清园兑换码·5元', '低门槛小额券，便于演示「快速兑换」', '凭兑换码至合作商家或线上客服核销'],
      ['兑换码-30元', '清园兑换码·30元', '限量高面值券，展示库存与兑换约束', '凭兑换码至合作商家或线上客服核销'],
      ['环保帆布包', '清园主题帆布包', '校园文创·再生棉混纺，礼品柜实物领取', '清园学生事务中心一楼服务台'],
      ['环保水杯', '清园随行杯', '不锈钢双层保温杯，倡导自带杯减塑', '清园学生事务中心一楼服务台'],
      ['绿植盆栽', '桌面绿植盆栽', '小型多肉/绿萝，美化宿舍与自习空间', '清园学生事务中心一楼服务台'],
      ['电子证书-低碳达人', '电子证书·低碳达人', '绿色出行与节能行为累计达标', '在线查看电子证书'],
      ['电子证书-节约标兵', '电子证书·节约标兵', '节水节电类行为突出', '在线查看电子证书'],
      ['环保文具套装', '再生纸文具套装', '笔记本+再生纸笔，贴合无纸化办公宣传', '清园学生事务中心一楼服务台'],
      ['食堂代金券-5元', '清园食堂代金券·5元', '东/西区食堂窗口抵扣现金', '清园东区/西区食堂收银台出示取货码'],
      ['食堂代金券-10元', '清园食堂代金券·10元', '适合演示「积分换餐」场景', '清园东区/西区食堂收银台出示取货码'],
      ['环保书签套装', '环保书签套装', '竹纤维书签四枚装，轻量文创', '清园学生事务中心一楼服务台'],
      ['电子证书-绿色志愿者', '电子证书·绿色志愿者', '参与志愿清扫或宣传活动记录', '在线查看电子证书'],
      ['环保口罩', '可水洗口罩', '可重复使用的布口罩，减少一次性消耗', '清园学生事务中心一楼服务台'],
      ['环保袋', '可降解购物袋', '玉米淀粉材质，替代一次性塑料袋', '清园学生事务中心一楼服务台'],
      ['电子证书-环保之星', '电子证书·环保之星', '系统内积分排名前列可申请', '在线查看电子证书'],
      ['校园文创徽章', '清园文创徽章', '珐琅工艺校徽+绿叶元素，收藏向', '清园学生事务中心一楼服务台']
    ]
    for (const row of LEGACY_REWARD_LABELS) {
      rewardRename.run(row[1], row[2], row[3], row[0])
    }
  } catch (e) {
    console.warn('rewards 名称迁移跳过：', e?.message || e)
  }

  // 初始化行为规则（若为空）
  const ruleCount = db.prepare('SELECT COUNT(*) as count FROM behavior_rules').get()
  // 规则配置默认补齐到 22 条（只补缺失项，不覆盖已有配置）
  const DEFAULT_BEHAVIOR_RULES = [
    // ——干净校园（以卫生清洁为主）——
    { behaviorType: '校园卫生整治', points: 12, dailyLimit: 1, validDays: 365 },
    { behaviorType: '宿舍内务整理', points: 6, dailyLimit: 1, validDays: 365 },
    { behaviorType: '教室自觉清扫', points: 8, dailyLimit: 2, validDays: 365 },
    { behaviorType: '楼道与楼梯清洁', points: 8, dailyLimit: 1, validDays: 365 },
    { behaviorType: '校园“弯腰行动”', points: 4, dailyLimit: 3, validDays: 365 },
    { behaviorType: '垃圾分类投放', points: 5, dailyLimit: 3, validDays: 365 },
    { behaviorType: '垃圾分类宣传志愿服务', points: 8, dailyLimit: 1, validDays: 365 },
    { behaviorType: '共享单车规范摆放', points: 5, dailyLimit: 2, validDays: 365 },
    { behaviorType: '公共卫生间清洁维护', points: 10, dailyLimit: 1, validDays: 365 },
    { behaviorType: '食堂餐桌清理与文明就餐', points: 4, dailyLimit: 2, validDays: 365 },
    { behaviorType: '寝室走廊与门前“三包”', points: 6, dailyLimit: 1, validDays: 365 },
    { behaviorType: '黑板报与宣传栏整洁维护', points: 5, dailyLimit: 1, validDays: 365 },
    { behaviorType: '无烟楼层巡查与劝导', points: 6, dailyLimit: 1, validDays: 365 },
    { behaviorType: '爱护公物·擦拭与保养', points: 6, dailyLimit: 1, validDays: 365 },
    { behaviorType: '拒绝乱贴乱画专项行动', points: 10, dailyLimit: 1, validDays: 365 },
    { behaviorType: '绿化带杂物清理', points: 6, dailyLimit: 2, validDays: 365 },
    { behaviorType: '教学楼自习区整洁维护', points: 6, dailyLimit: 1, validDays: 365 },
    { behaviorType: '宿舍区垃圾桶定点维护', points: 6, dailyLimit: 1, validDays: 365 },
    { behaviorType: '干净校园主题宣传活动', points: 5, dailyLimit: 1, validDays: 365 },
    { behaviorType: '环保创意海报/标语设计', points: 10, dailyLimit: 1, validDays: 365 },
    { behaviorType: '绿色校园绿植养护', points: 5, dailyLimit: 1, validDays: 365 },
    { behaviorType: '其他干净校园志愿服务', points: 5, dailyLimit: 1, validDays: 365 }
  ]

  if ((ruleCount?.count ?? 0) < DEFAULT_BEHAVIOR_RULES.length) {
    const insertRule = db.prepare(`
      INSERT INTO behavior_rules (behavior_type, points, daily_limit, valid_days)
      VALUES (?, ?, ?, ?)
    `)
    const exists = db.prepare('SELECT id FROM behavior_rules WHERE behavior_type = ?')
    for (const r of DEFAULT_BEHAVIOR_RULES) {
      if (!exists.get(r.behaviorType)) {
        insertRule.run(r.behaviorType, r.points, r.dailyLimit, r.validDays ?? 365)
      }
    }
  }

  // 演示用：删除旧的行为分类（只保留当前 22 条“干净校园”规则）
  // 说明：initDatabase 默认只“补齐缺失项”，不会删除旧项；若你希望历史自定义规则保留，请删除此段。
  try {
    const keep = DEFAULT_BEHAVIOR_RULES.map(r => r.behaviorType)
    const placeholders = keep.map(() => '?').join(',')
    db.prepare(`DELETE FROM behavior_rules WHERE behavior_type NOT IN (${placeholders})`).run(...keep)
  } catch (e) {
    console.warn('behavior_rules 清理旧分类跳过：', e?.message || e)
  }

  // 学号白名单：每次初始化都补齐（INSERT OR IGNORE，不会重复插入/覆盖已有数据）
  try {
    const insertWhite = db.prepare(`
      INSERT OR IGNORE INTO student_whitelist (student_id, name, college, initial_pwd)
      VALUES (?, ?, ?, ?)
    `)
    const DEFAULT_STUDENT_PWD = '123456'
    const DEFAULT_ADMIN_PWD = 'admin123'
    const DEFAULT_WHITELIST = [
      // 管理员白名单（用于演示后台）
      { studentId: 'admin', name: '系统管理员', college: null, initialPwd: DEFAULT_ADMIN_PWD },
      // 22 个演示学生（干净校园主题）
      { studentId: '2026310101', name: '陈思远', college: '计算机科学与技术学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310201', name: '林雨桐', college: '环境科学与工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310301', name: '王梓涵', college: '能源与动力工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310401', name: '赵宇航', college: '机械工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310501', name: '钱佳怡', college: '电气工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310601', name: '孙博文', college: '材料科学与工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310701', name: '周子墨', college: '化学工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310801', name: '吴若曦', college: '建筑与城市规划学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310901', name: '郑浩然', college: '经济管理学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311001', name: '王诗涵', college: '公共管理学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311101', name: '李俊熙', college: '法学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311201', name: '陈语彤', college: '人文学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311301', name: '刘景行', college: '理学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311401', name: '杨思琪', college: '外国语学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311501', name: '黄明轩', college: '艺术设计与传媒学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026311601', name: '林可欣', college: '体育学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310102', name: '何志远', college: '计算机科学与技术学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310202', name: '徐静雯', college: '环境科学与工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310302', name: '马骏驰', college: '能源与动力工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310402', name: '朱欣怡', college: '机械工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310502', name: '胡文博', college: '电气工程学院', initialPwd: DEFAULT_STUDENT_PWD },
      { studentId: '2026310602', name: '郭晓雯', college: '材料科学与工程学院', initialPwd: DEFAULT_STUDENT_PWD }
    ]
    for (const s of DEFAULT_WHITELIST) {
      insertWhite.run(s.studentId, s.name || null, s.college || null, s.initialPwd || null)
    }
  } catch (e) {
    console.warn('student_whitelist 补齐跳过：', e?.message || e)
  }

  // 确保存在 admin 用户（若尚无，将 admin 或 2026310101 设为 admin）
  const adminCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role IN ('admin','auditor')").get()
  if (adminCount.count === 0) {
    const u = db.prepare('SELECT id FROM users WHERE student_id = ?').get('admin')
      || db.prepare('SELECT id FROM users WHERE student_id = ?').get('2026310101')
    if (u) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(u.id)
      console.log('已将首个管理员账号设为 admin')
    }
  }

  console.log('数据库初始化完成')
}

export function getDB() {
  return db
}

/** 兼容 user_points 列：更新积分时同步到 user_points（若存在） */
export function syncPointsColumn(dbInst, studentId, escrowPoints) {
  try {
    const cols = dbInst.prepare(`PRAGMA table_info(users)`).all().map(c => c.name)
    if (cols.includes('user_points')) {
      dbInst.prepare('UPDATE users SET user_points = ? WHERE student_id = ?').run(escrowPoints, studentId)
    }
  } catch (e) {
    console.warn('sync user_points:', e?.message)
  }
}

export function closeDB() {
  try {
    db.close()
  } catch (e) {
    // ignore close errors (e.g. already closed)
  }
}







