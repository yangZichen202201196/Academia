import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import multer from 'multer'
import os from 'os'
import { initDatabase, closeDB } from './db/database.js'
import { uploadToIPFS } from './services/ipfs.js'
import reportRoutes from './routes/reports.js'
import leaderboardRoutes from './routes/leaderboard.js'
import rewardRoutes from './routes/rewards.js'
import adminRoutes from './routes/admin.js'
import authRoutes from './routes/auth.js'
import walletRoutes from './routes/wallet.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3001

// 中间件
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// 文件上传配置
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
})

// 初始化数据库
initDatabase()

function shutdown(signal) {
  try {
    closeDB()
  } finally {
    if (signal) process.exit(0)
  }
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

// 路由
app.use('/api/reports', reportRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/rewards', rewardRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/wallet', walletRoutes)

// 图片上传到IPFS
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有上传文件' })
    }

    const ipfsHash = await uploadToIPFS(req.file.buffer, req.file.originalname)
    const imageUrl = String(ipfsHash).startsWith('data:') ? ipfsHash : `https://gateway.pinata.cloud/ipfs/${ipfsHash}`
    res.json({ ipfsHash: imageUrl })
  } catch (error) {
    console.error('上传失败:', error)
    res.status(500).json({ error: '上传失败: ' + error.message })
  }
})

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: '可以连接到服务器' })
})

// 开发环境：返回本机局域网 IP，供手机端访问前端用（优先真实网卡，排除虚拟网卡）
const FRONTEND_PORT = process.env.FRONTEND_PORT || 5173
const VIRTUAL_NAMES = /VirtualBox|VMware|vEthernet|WSL|Docker|Loopback|vethernet|vmware/i
const VIRTUAL_PREFIXES = ['192.168.56.', '192.168.65.', '10.0.2.'] // VirtualBox、WSL2、部分虚拟机
function getLocalNetworkIP() {
  try {
    const interfaces = os.networkInterfaces()
    let fallback = null
    for (const name of Object.keys(interfaces)) {
      if (VIRTUAL_NAMES.test(name)) continue
      for (const iface of interfaces[name] || []) {
        if (iface.family !== 'IPv4' || iface.internal) continue
        const addr = iface.address
        if (!fallback) fallback = addr
        const isVirtual = VIRTUAL_PREFIXES.some((p) => addr.startsWith(p))
        if (!isVirtual) return addr
      }
    }
    return fallback
  } catch (_) {}
  return null
}
app.get('/api/dev-info', (req, res) => {
  const lanIp = getLocalNetworkIP()
  const mobileUrl = lanIp ? `http://${lanIp}:${FRONTEND_PORT}` : null
  res.json({ mobileUrl, lanIp: lanIp || null, frontendPort: FRONTEND_PORT })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器运行在 http://localhost:${PORT}`)
  const lanIp = getLocalNetworkIP()
  if (lanIp) console.log(`手机端访问: http://${lanIp}:${FRONTEND_PORT}`)
})








