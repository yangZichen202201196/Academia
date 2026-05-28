import express from 'express'
import { getDB } from '../db/database.js'
import { ethers } from 'ethers'
import { getChainConfig } from '../config/chain.js'

const router = express.Router()
const db = getDB()

// 获取当前用户排名（学号登录：用绑定钱包的链上积分；或传 walletAddress 查询）
router.get('/my-rank', async (req, res) => {
  try {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null
    const { walletAddress: queryWallet } = req.query

    let walletAddress = queryWallet || null
    let studentId = null
    if (token) {
      try {
        const jwt = (await import('jsonwebtoken')).default
        const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret')
        studentId = payload.studentId
        const user = db.prepare('SELECT wallet_address FROM users WHERE student_id = ?').get(studentId)
        if (user?.wallet_address) walletAddress = walletAddress || user.wallet_address
      } catch (_) {}
    }

    const { rpcUrl, contractAddress } = getChainConfig()
    let myPoints = 0   // 现有积分（钱包余额）
    let myTotalPoints = 0  // 累计积分（合约 userTotalPoints）
    if (walletAddress && contractAddress && rpcUrl) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(contractAddress, [
          'function balanceOf(address) view returns (uint256)',
          'function getTotalPoints(address) view returns (uint256)'
        ], provider)
        const [bal, total] = await Promise.all([
          contract.balanceOf(walletAddress),
          contract.getTotalPoints(walletAddress)
        ])
        myPoints = parseFloat(ethers.formatEther(bal))
        myTotalPoints = parseFloat(ethers.formatEther(total))
      } catch (_) {}
    }

    // 排行榜按累计积分（getTotalPoints）排序；并行查链避免串行 RPC 过慢
    const users = db.prepare('SELECT DISTINCT wallet_address FROM users WHERE wallet_address IS NOT NULL').all()
    let pointsList = []
    if (contractAddress && rpcUrl && users.length > 0) {
      const provider = new ethers.JsonRpcProvider(rpcUrl)
      const contract = new ethers.Contract(contractAddress, [
        'function getTotalPoints(address) view returns (uint256)'
      ], provider)
      const results = await Promise.all(
        users.map(async (u) => {
          try {
            const total = await contract.getTotalPoints(u.wallet_address)
            return { wallet: u.wallet_address, points: parseFloat(ethers.formatEther(total)) }
          } catch (_) {
            return { wallet: u.wallet_address, points: 0 }
          }
        })
      )
      pointsList = results
    }
    pointsList.sort((a, b) => b.points - a.points)
    const totalUsers = pointsList.length
    const idx = walletAddress ? pointsList.findIndex(p => p.wallet?.toLowerCase() === walletAddress?.toLowerCase()) : -1
    const myRank = idx === -1 ? null : idx + 1
    const percentSurpassed = totalUsers > 0 && myRank != null
      ? Math.round(((totalUsers - myRank) / totalUsers) * 100)
      : 0

    res.json({
      myRank,
      totalUsers,
      percentSurpassed,
      myPoints,        // 现有积分（钱包 GCT 余额）
      myTotalPoints   // 累计积分（历史获得总量，用于排名）
    })
  } catch (e) {
    console.error('获取我的排名失败:', e)
    res.status(500).json({ error: '获取失败' })
  }
})

// 从数据库汇总积分（无合约或链上无数据时使用）
function getLeaderboardFromDb() {
  const rows = db.prepare(`
    SELECT u.wallet_address AS walletAddress, u.name,
           COALESCE(SUM(r.points), 0) AS totalPoints
    FROM users u
    LEFT JOIN reports r ON u.wallet_address = r.wallet_address AND r.status = 'approved'
    WHERE u.wallet_address IS NOT NULL
    GROUP BY u.wallet_address
    ORDER BY totalPoints DESC
    LIMIT 10
  `).all()
  return rows.map(u => ({
    walletAddress: u.walletAddress,
    name: u.name,
    totalPoints: Number(u.totalPoints),
    currentPoints: Number(u.totalPoints)
  }))
}

// 获取排行榜
router.get('/', async (req, res) => {
  try {
    const { rpcUrl, contractAddress } = getChainConfig()

    if (!contractAddress || !rpcUrl) {
      return res.json(getLeaderboardFromDb())
    }

    // 从区块链获取累计积分（getTotalPoints），排名按累计积分
    const provider = new ethers.JsonRpcProvider(rpcUrl)
    const contractABI = [
      'function balanceOf(address) view returns (uint256)',
      'function getTotalPoints(address) view returns (uint256)'
    ]
    const contract = new ethers.Contract(contractAddress, contractABI, provider)

    const users = db.prepare(`
      SELECT wallet_address as walletAddress, MAX(name) as name
      FROM users
      WHERE wallet_address IS NOT NULL
      GROUP BY wallet_address
    `).all()

    let leaderboard = []
    try {
      leaderboard = await Promise.all(
        users.map(async (user) => {
          try {
            const [total, balance] = await Promise.all([
              contract.getTotalPoints(user.walletAddress),
              contract.balanceOf(user.walletAddress)
            ])
            return {
              walletAddress: user.walletAddress,
              name: user.name,
              totalPoints: parseFloat(ethers.formatEther(total)),
              currentPoints: parseFloat(ethers.formatEther(balance))
            }
          } catch (error) {
            return {
              walletAddress: user.walletAddress,
              name: user.name,
              totalPoints: 0,
              currentPoints: 0
            }
          }
        })
      )
      leaderboard.sort((a, b) => b.totalPoints - a.totalPoints)
    } catch (err) {
      console.warn('链上排行榜获取失败，回退到数据库:', err?.message)
    }

    // 链上无有效数据时（全为 0 或报错）回退到数据库汇总
    const hasAnyPoints = leaderboard.some((u) => u.totalPoints > 0)
    if (!hasAnyPoints && users.length > 0) {
      const fromDb = getLeaderboardFromDb()
      if (fromDb.length > 0) return res.json(fromDb)
    }

    res.json(leaderboard.slice(0, 10))
  } catch (error) {
    console.error('获取排行榜失败:', error)
    res.status(500).json({ error: '获取失败' })
  }
})

export default router








