'use client'

import { useState, useEffect } from 'react'
import { Trophy, Medal } from 'lucide-react'
import { useWeb3 } from '../contexts/Web3Context'
import { getLeaderboard, LeaderboardUser } from '../utils/api'

export default function Leaderboard() {
  const { account } = useWeb3()
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLeaderboard()
  }, [])

  const loadLeaderboard = async () => {
    try {
      setLoading(true)
      const data = await getLeaderboard()
      // 兼容历史数据：过滤掉空钱包地址，避免渲染时白屏
      setUsers(data.filter(u => !!u.walletAddress))
    } catch (error) {
      console.error('加载排行榜失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatAddress = (address: string | null) => {
    if (!address) return '—'
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  return (
    <div className="leaderboard-page">
      <div className="container">
        <div className="card">
          <div className="leaderboard-header">
            <h2>
              <Trophy size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              积分排行榜
            </h2>
            <p className="leaderboard-subtitle">按累计积分排名（历史获得总量）</p>
            <button onClick={loadLeaderboard} className="btn btn-secondary">
              刷新
            </button>
          </div>

          {loading ? (
            <p>加载中...</p>
          ) : users.length === 0 ? (
            <p>暂无排行榜数据</p>
          ) : (
            <div className="leaderboard-list">
              {users.map((user, index) => (
                <div
                  key={user.walletAddress || `idx-${index}`}
                  className={`leaderboard-item ${
                    (account || '').toLowerCase() === (user.walletAddress || '').toLowerCase()
                      ? 'current-user'
                      : ''
                  }`}
                >
                  <div className="rank">
                    {index === 0 && <Medal size={18} style={{ color: '#fbbf24' }} />}
                    {index === 1 && <Medal size={18} style={{ color: '#9ca3af' }} />}
                    {index === 2 && <Medal size={18} style={{ color: '#f97316' }} />}
                    {index > 2 && `#${index + 1}`}
                  </div>
                  <div className="user-info">
                    <div className="user-name">
                      {user.name || formatAddress(user.walletAddress)}
                    </div>
                    <div className="user-address">{formatAddress(user.walletAddress)}</div>
                  </div>
                  <div className="points">
                    <span title="累计积分">{user.totalPoints.toFixed(2)} GCT</span>
                    {user.currentPoints != null && (
                      <span className="points-current">现有 {user.currentPoints.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

