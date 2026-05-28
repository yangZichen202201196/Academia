'use client'

import { useEffect, useMemo, useState } from 'react'
import { Award, Recycle, Footprints, ShieldCheck, Search, Filter } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useWeb3 } from '../contexts/Web3Context'
import {
  getMyStudentReports,
  getUserRewards,
  getMyRank,
  getRewardsChainConfig,
  type Report,
  type UserReward
} from '../utils/api'

const ACHIEVEMENTS = [
  { id: 'pioneer', title: '环保先锋', desc: '连续7天打卡', icon: Award, color: '#f59e0b' },
  { id: 'sort', title: '分类达人', desc: '垃圾分类20次', icon: Recycle, color: '#10b981' },
  { id: 'lowcarbon', title: '低碳出行', desc: '步行上学30次', icon: Footprints, color: '#3b82f6' }
]

interface PointEvent {
  id: string
  type: 'earn' | 'spend'
  title: string
  detail: string
  delta: number
  time: string
  operator?: string | null
  txHash?: string | null
}

export default function Profile() {
  const { student } = useAuth()
  const { account, balance } = useWeb3()
  const [reports, setReports] = useState<Report[]>([])
  const [rewards, setRewards] = useState<UserReward[]>([])
  const [rankInfo, setRankInfo] = useState<{
    myRank: number | null
    totalUsers: number
    percentSurpassed: number
    myPoints: number
    myTotalPoints: number
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')
  const [explorerBase, setExplorerBase] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!student) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        // 先拉报告和兑换记录（快），尽快结束 loading，再后台拉排名/积分（链上较慢）
        const [reportData, rewardData] = await Promise.all([
          getMyStudentReports(),
          account ? getUserRewards(account) : Promise.resolve([])
        ])
        setReports(reportData)
        setRewards(rewardData)
        setLoading(false)
        getMyRank(account || student.walletAddress || undefined)
          .then(setRankInfo)
          .catch(() => setRankInfo(null))
      } catch (e) {
        setLoading(false)
      }
    }
    load()
  }, [student, account])

  useEffect(() => {
    getRewardsChainConfig()
      .then((c) => {
        const url = (c.blockExplorerUrl || (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BLOCK_EXPLORER_URL) || '').trim()
        if (url) setExplorerBase(url.replace(/\/+$/, ''))
      })
      .catch(() => {
        const fallback = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BLOCK_EXPLORER_URL) || ''
        if (fallback) setExplorerBase(fallback.replace(/\/+$/, ''))
      })
  }, [])

  const pointEvents: PointEvent[] = useMemo(() => {
    const earn: PointEvent[] = reports
      .filter(r => r.status === 'approved' && (r.points ?? 0) > 0)
      .map(r => ({
        id: `report-${r.id}`,
        type: 'earn',
        title: r.behaviorType,
        detail: r.description || '',
        delta: r.points ?? 0,
        time: r.reviewedAt || r.createdAt,
        operator: r.reviewedBy,
        txHash: r.txHash || null
      }))

    const spend: PointEvent[] =
      rewards?.map(ur => ({
        id: `reward-${ur.id}`,
        type: 'spend',
        title: ur.reward.name,
        detail: ur.reward.description,
        delta: -ur.reward.pointsRequired,
        time: ur.redeemedAt,
        operator: null,
        txHash: ur.txHash || null
      })) ?? []

    const merged = [...earn, ...spend].sort((a, b) => (a.time > b.time ? -1 : 1))
    if (!keyword.trim()) return merged
    const kw = keyword.trim().toLowerCase()
    return merged.filter(ev => {
      const base = `${ev.title} ${ev.detail}`.toLowerCase()
      return base.includes(kw)
    })
  }, [reports, rewards, keyword])

  if (!student) {
    return (
      <div className="profile-page">
        <div className="container">
          <div className="card">
            <h2>个人中心</h2>
            <p>请先使用学号登录后，再查看个人信息与积分明细。</p>
          </div>
        </div>
      </div>
    )
  }

  const currentPoints = parseFloat(balance || '0')
  const totalSpentFromRewards = rewards.reduce((s, ur) => s + (ur.reward?.pointsRequired ?? 0), 0)
  const totalPointsEver = Math.max(rankInfo?.myTotalPoints ?? 0, currentPoints + totalSpentFromRewards)

  return (
    <div className="profile-page">
      <div className="container">
        {/* 顶部信息 + 积分总览 */}
        <section className="card profile-header-card">
          <div className="profile-header-top">
            <div className="profile-header-main">
              <div className="profile-avatar">
                {(student.name || student.studentId || '同')?.slice(0, 1)}
              </div>
              <div className="profile-info">
                <div className="profile-name-row">
                  <span className="profile-name">{student.name || '同学'}</span>
                  <span className="profile-role-tag">
                    <ShieldCheck size={14} style={{ marginRight: 4 }} />
                    {student.studentId === 'admin' ? '管理员' : '学生'}
                  </span>
                </div>
                <div className="profile-meta">
                  <span>学号：{student.studentId}</span>
                  {student.college && <span>学院：{student.college}</span>}
                </div>
                <div className="profile-wallet">
                  <span>积分钱包：</span>
                  {student.walletAddress ? (
                    <span className="profile-wallet-address">
                      {student.walletAddress.slice(0, 6)}...{student.walletAddress.slice(-4)}
                    </span>
                  ) : (
                    <span className="profile-wallet-empty">未绑定</span>
                  )}
                </div>
              </div>
            </div>

            <div className="profile-header-stats">
              <div className="profile-stat-card">
                <div className="stat-label">当前积分</div>
                <div className="stat-value">{currentPoints.toLocaleString()} GCT</div>
              </div>
              <div className="profile-stat-card">
                <div className="stat-label">累计获得</div>
                <div className="stat-value">{totalPointsEver.toLocaleString()} GCT</div>
              </div>
              {rankInfo?.myRank != null && (
                <div className="profile-stat-card">
                  <div className="stat-label">累计排名</div>
                  <div className="stat-value">
                    第 {rankInfo.myRank} 名
                    <span className="stat-sub">超过 {rankInfo.percentSurpassed}% 同学</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* 积分明细 */}
        <section className="card profile-events-card">
          <div className="profile-events-header-row">
            <div>
              <h3>积分明细</h3>
              <p className="profile-events-sub">
                最近 {pointEvents.length} 条记录
              </p>
            </div>
            <div className="profile-events-tools">
              <div className="events-search">
                <Search size={14} className="events-search-icon" />
                <input
                  className="events-search-input"
                  placeholder="搜索记录..."
                  value={keyword}
                  onChange={e => setKeyword(e.target.value)}
                />
              </div>
              <button type="button" className="btn btn-soft events-filter-btn" aria-label="筛选">
                <Filter size={14} />
                <span className="events-filter-text">筛选</span>
              </button>
            </div>
          </div>

          {loading ? (
            <p>加载中...</p>
          ) : pointEvents.length === 0 ? (
            <p>暂无积分记录。</p>
          ) : (
              <div className="profile-events-table">
                <div className="profile-events-header">
                  <span>类型</span>
                  <span>来源/说明</span>
                  <span>哈希值</span>
                  <span>变动</span>
                  <span>时间</span>
                  <span>操作人</span>
                </div>
                {pointEvents.map(ev => (
                  <div key={ev.id} className="profile-events-row">
                    <span className={ev.type === 'earn' ? 'tag-earn' : 'tag-spend'}>
                      {ev.type === 'earn' ? '获得' : '支出'}
                    </span>
                    <span className="event-title">
                      {ev.title}
                      {ev.detail && <span className="event-detail"> · {ev.detail}</span>}
                    </span>
                    <span className="event-hash">
                      {ev.txHash ? (
                        explorerBase ? (
                          <a
                            href={`${explorerBase}/tx/${ev.txHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hash-link"
                            title="链上查看"
                          >
                            {ev.txHash.length > 20 ? `${ev.txHash.slice(0, 10)}…${ev.txHash.slice(-8)}` : ev.txHash}
                          </a>
                        ) : (
                          <code style={{ fontSize: 11 }}>{ev.txHash.length > 20 ? `${ev.txHash.slice(0, 10)}…${ev.txHash.slice(-8)}` : ev.txHash}</code>
                        )
                      ) : (
                        '-'
                      )}
                    </span>
                    <span className={ev.type === 'earn' ? 'delta-earn' : 'delta-spend'}>
                      {ev.delta > 0 ? `+${ev.delta}` : ev.delta} GCT
                    </span>
                    <span>{new Date(ev.time).toLocaleString('zh-CN')}</span>
                    <span>{ev.operator || (ev.type === 'earn' ? '审核员' : '系统')}</span>
                  </div>
                ))}
              </div>
          )}
        </section>

        {/* 我的报告 & 兑换记录入口（概览） */}
        <section className="card profile-subsections">
          <div className="profile-subsection">
            <h3>我的报告</h3>
            {reports.length === 0 ? (
              <p>暂无环保行为上报记录。</p>
            ) : (
              <ul className="profile-list">
                {reports.slice(0, 5).map(r => (
                  <li key={r.id}>
                    <span>{r.behaviorType}</span>
                    <span className="muted">
                      {new Date(r.createdAt).toLocaleString('zh-CN')} ·{' '}
                      {r.status === 'approved'
                        ? `已通过${r.points != null ? ` +${r.points}分` : ''}`
                        : r.status === 'pending'
                        ? '待审核'
                        : '未通过'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="profile-subsection">
            <h3>我的兑换记录</h3>
            {account && rewards.length > 0 ? (
              <ul className="profile-list">
                {rewards.slice(0, 5).map(ur => (
                  <li key={ur.id}>
                    <span>{ur.reward.name}</span>
                    <span className="muted">
                      {ur.reward.pointsRequired} GCT ·{' '}
                      {new Date(ur.redeemedAt).toLocaleString('zh-CN')}
                      {ur.txHash && (
                        <> · 链上哈希: {explorerBase ? (
                          <a href={`${explorerBase}/tx/${ur.txHash}`} target="_blank" rel="noreferrer" className="hash-link">{ur.txHash.slice(0, 10)}…{ur.txHash.slice(-8)}</a>
                        ) : (
                          <code style={{ fontSize: 11 }}>{ur.txHash.slice(0, 10)}…{ur.txHash.slice(-8)}</code>
                        )}</>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>暂无兑换记录。</p>
            )}
          </div>
        </section>

        {/* 成就（保留原内容） */}
        <section className="card home-achievements">
          <h3 className="section-title">我的成就</h3>
          <div className="achievement-grid">
            {ACHIEVEMENTS.map(a => {
              const Icon = a.icon
              return (
                <div key={a.id} className="achievement-badge" style={{ ['--accent' as string]: a.color }}>
                  <span className="achievement-icon">
                    <Icon size={24} />
                  </span>
                  <span className="achievement-title">{a.title}</span>
                  <span className="achievement-desc">{a.desc}</span>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

