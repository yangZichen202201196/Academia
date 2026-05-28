'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { Camera, BarChart3, Gift, User, Leaf, ChevronRight, Copy, CheckCircle2, Flame } from 'lucide-react'
import { useWeb3 } from '../contexts/Web3Context'
import { useAuth } from '../contexts/AuthContext'
import { useUi } from '../contexts/UiContext'
import { bindWallet, unbindWallet, getMyRank, getMyStudentReports, getUserReports, getRecentReports, getUserRewards } from '../utils/api'
import type { Report } from '../utils/api'

// 等级阈值：每级所需累计积分
const LEVEL_BASE = 100
function getLevelInfo(points: number) {
  const level = Math.floor(points / LEVEL_BASE) + 1
  const currentLevelStart = (level - 1) * LEVEL_BASE
  const nextLevelStart = level * LEVEL_BASE
  const pointsToNext = Math.max(0, nextLevelStart - points)
  const progress = nextLevelStart > currentLevelStart
    ? (points - currentLevelStart) / (nextLevelStart - currentLevelStart)
    : 1
  return { level, pointsToNext, progress }
}

function formatTimeAgo(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffM = Math.floor(diffMs / 60000)
  const diffH = Math.floor(diffMs / 3600000)
  const diffD = Math.floor(diffMs / 86400000)
  if (diffM < 60) return `${diffM}分钟前`
  if (diffH < 24) return `${diffH}小时前`
  if (diffD === 1) return '昨天'
  if (diffD < 7) return `${diffD}天前`
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

const ACHIEVEMENTS = [
  { id: 'pioneer', title: '环保先锋', desc: '连续7天打卡', icon: '🌟', color: '#f59e0b' },
  { id: 'sort', title: '分类达人', desc: '垃圾分类20次', icon: '♻️', color: '#10b981' },
  { id: 'lowcarbon', title: '低碳出行', desc: '步行上学30次', icon: '🚶', color: '#3b82f6' }
]

export default function Home() {
  const { account, balance, connectWallet, signer, refreshBalance, balanceError } = useWeb3()
  const { student, updateStudent, refreshStudent } = useAuth()
  const { showToast, showConfirm } = useUi()
  const router = useRouter()
  const pathname = usePathname()
  const [binding, setBinding] = useState(false)
  const [copied, setCopied] = useState(false)
  const [rankInfo, setRankInfo] = useState<{
    myRank: number | null
    totalUsers: number
    percentSurpassed: number
    myPoints: number
    myTotalPoints: number
  } | null>(null)
  const [recentReports, setRecentReports] = useState<Report[]>([])
  const [campusRecent, setCampusRecent] = useState<Report[]>([])
  const [redeemSpendTotal, setRedeemSpendTotal] = useState(0)

  // 拉取排名与积分：account/student 变化时拉一次；balance 变化时也重拉，以便兑换/发积分后首页当前积分与累计积分及时更新
  useEffect(() => {
    const load = async () => {
      const wallet = account || student?.walletAddress
      getMyRank(wallet || undefined).then(setRankInfo).catch(() => setRankInfo(null))
      if (account) {
        getUserReports(account).then(list => setRecentReports(list.slice(0, 10)))
        getUserRewards(account)
          .then(urs => setRedeemSpendTotal(urs.reduce((s, r) => s + (r.reward?.pointsRequired ?? 0), 0)))
          .catch(() => setRedeemSpendTotal(0))
      } else if (student) {
        getMyStudentReports().then(list => setRecentReports(list.slice(0, 10)))
        setRedeemSpendTotal(0)
      } else {
        setRecentReports([])
        setRedeemSpendTotal(0)
      }
      getRecentReports(10).then(setCampusRecent).catch(() => setCampusRecent([]))
    }
    load()
  }, [student, account, balance])

  // 现有积分、累计积分以智能合约为准，不在此处主动刷新；仅在连接钱包或兑换/发分后由 Web3Context 或操作流程内更新
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#achievements') {
      document.getElementById('achievements')?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [pathname])

  if (!student) {
    return (
      <div className="home">
        <div className="container">
          <div className="card welcome-only">
            <h2>先使用学号登录</h2>
            <p className="welcome-desc">登录后即可查看积分、上报行为与兑换奖励。</p>
            <button className="btn btn-primary" onClick={() => router.push('/student/login')}>
              前往学号登录
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleUnbind = async () => {
    if (!student.walletAddress) {
      showToast({ type: 'info', title: '无需解绑', description: '当前学号尚未绑定积分钱包。' })
      return
    }
    const ok = await showConfirm({
      title: '解绑积分钱包',
      message:
        `确定要解绑当前积分钱包 ${student.walletAddress.slice(0, 6)}...${student.walletAddress.slice(-4)} 吗？\n\n` +
        '解绑后：\n' +
        '1）该钱包在排行榜、奖励兑换记录等中的展示将从本账号中消失；\n' +
        '2）该积分地址可以被其他学号重新绑定。\n\n' +
        '此操作不可撤销，请确认已完成必要的数据导出或截图。',
      confirmText: '确认解绑',
      cancelText: '取消',
      danger: true
    })
    if (!ok) return

    try {
      setBinding(true)
      await unbindWallet()
      await refreshStudent()
      showToast({ type: 'success', title: '已解绑', description: '当前积分钱包已与学号解除绑定。' })
    } catch (err: any) {
      console.error('解绑失败:', err)
      showToast({
        type: 'error',
        title: '解绑失败',
        description: err.response?.data?.error || err.message || '请稍后重试'
      })
    } finally {
      setBinding(false)
    }
  }

  const handleConnectOrBind = async () => {
    try {
      setBinding(true)
      const wallet = await connectWallet()
      if (!wallet) {
        showToast({ type: 'info', title: '未连接钱包', description: '请先在浏览器中授权连接钱包。' })
        return
      }
      if (student && (!student.walletAddress || student.walletAddress.toLowerCase() !== wallet.toLowerCase())) {
        const ok = await showConfirm({
          title: '绑定积分钱包',
          message:
            `是否将当前钱包地址 ${wallet.slice(0, 6)}...${wallet.slice(-4)} 作为本系统的积分钱包？\n\n` +
            '绑定后同一钱包不能绑定到其他学号。',
          confirmText: '确认绑定',
          cancelText: '取消'
        })
        if (!ok) return
        const message = `Bind wallet for studentId:${student.studentId}`
        // 不使用 context 里的 signer，直接读取当前钱包最新 signer，避免首次连接时签名地址滞后
        if (!window.ethereum) {
          showToast({ type: 'error', title: '未检测到钱包', description: '请先安装并启用 MetaMask。' })
          return
        }
        const liveProvider = new ethers.BrowserProvider(window.ethereum)
        const liveSigner = await liveProvider.getSigner()
        const signature = await liveSigner.signMessage(message)
        await bindWallet({ walletAddress: wallet, signature })
        await refreshStudent()
        showToast({ type: 'success', title: '绑定成功', description: '钱包已与当前学号绑定。' })
      }
    } catch (err: any) {
      console.error('连接/绑定失败:', err)
      showToast({
        type: 'error',
        title: '操作失败',
        description: err.response?.data?.error || err.message || '请稍后重试'
      })
    } finally {
      setBinding(false)
    }
  }

  const handleCopyWallet = async (addr: string) => {
    try {
      await navigator.clipboard.writeText(addr)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      showToast({ type: 'error', title: '复制失败', description: '请手动选择地址后复制。' })
    }
  }

  // 仅当连接的钱包与学号绑定的积分地址一致时展示真实积分；否则提示连接正确钱包
  const isCorrectWallet =
    !!account &&
    !!student.walletAddress &&
    account.toLowerCase() === student.walletAddress.toLowerCase()
  // 当前余额统一用 Web3Context 的 balance（链上实时），与奖励兑换页一致，避免两页数据不一致
  const currentPoints = isCorrectWallet ? parseFloat(balance || '0') : 0
  const totalPointsEver = isCorrectWallet
    ? Math.max(rankInfo?.myTotalPoints ?? 0, currentPoints + redeemSpendTotal)
    : 0
  const { level, pointsToNext, progress } = getLevelInfo(totalPointsEver)
  const needBindWallet = !!student && !student.walletAddress
  const needCorrectWallet = !!student?.walletAddress && (!account || !isCorrectWallet)

  // 连续打卡：只统计“审核通过且已获得积分”的日期数，与当前/累计积分口径一致，避免出现“打卡有天数但积分为 0”的不合理展示
  const approvedDatesWithPoints = new Set(
    recentReports
      .filter(r => r.status === 'approved' && (r.points ?? 0) > 0)
      .map(r => r.createdAt.slice(0, 10))
  )
  const streakDays = approvedDatesWithPoints.size >= 1 ? Math.min(approvedDatesWithPoints.size, 30) : 0

  return (
    <div className="home">
      <div className="home-header">
        <h1>首页概览</h1>
        <p className="home-subtitle">快速查看积分和任务。</p>
      </div>

      {/* 积分地址未绑定时：引导绑定 */}
      {needBindWallet && (
        <section className="home-points-card home-bind-prompt" style={{ background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#b45309' }}>尚未绑定积分钱包</h3>
          <p style={{ margin: '0 0 16px 0', color: '#92400e', fontSize: 14 }}>
            绑定后即可查看积分并上报、兑换。
          </p>
          <button type="button" className="btn btn-primary" onClick={handleConnectOrBind} disabled={binding}>
            {binding ? '处理中...' : account ? '将当前钱包绑定为积分地址' : '连接并绑定钱包'}
          </button>
        </section>
      )}

      {/* 已绑定但未连接或连接的不是积分钱包：提醒连接正确钱包 */}
      {needCorrectWallet && (
        <section className="home-points-card home-wallet-remind" style={{ background: '#fef2f2', border: '1px solid #f87171', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <h3 style={{ margin: '0 0 8px 0', color: '#b91c1c' }}>请连接正确的钱包</h3>
          <p style={{ margin: 0, color: '#991b1b', fontSize: 14, wordBreak: 'break-all' }}>
            积分地址：<strong>{student.walletAddress}</strong>
            {account ? ' 当前钱包不一致，请切换。' : ' 请在右上角连接该地址。'}
          </p>
        </section>
      )}

      {/* 统一积分卡：积分总览（仅连接正确钱包时展示真实数据） */}
      <section className="home-points-card">
        <div className="points-card-header">
          <div className="points-card-label">
            <Leaf className="points-card-leaf" size={16} />
            <span>当前积分余额</span>
          </div>
          <div className="points-card-level">Lv.{level}</div>
        </div>
        <div className="points-card-value">{currentPoints.toLocaleString()}</div>
        <div className="points-card-unit">GCT</div>
        <div className="points-card-redeem">
          {isCorrectWallet
            ? `累计获得 ${totalPointsEver.toLocaleString()} GCT`
            : needBindWallet
            ? '绑定积分钱包后即可查看积分。'
            : needCorrectWallet
            ? '请连接正确的积分钱包查看真实积分。'
            : '请在右上角连接钱包后查看积分。'}
        </div>
        {isCorrectWallet && !!balanceError && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#fee2e2' }}>
            链上读取异常：{balanceError}
          </div>
        )}
        {student.walletAddress && (
          <div className="points-card-bind-info">
            <span className="points-card-wallet" title={student.walletAddress}>
              <span className="points-card-wallet-label">积分钱包</span>
              <span className="points-card-wallet-value">{student.walletAddress}</span>
            </span>
            <button
              type="button"
              className="btn btn-ghost points-card-copy"
              onClick={() => handleCopyWallet(student.walletAddress!)}
              aria-label="复制积分钱包地址"
              title={copied ? '已复制' : '复制'}
            >
              <Copy size={14} />
              <span className="points-card-copy-text">{copied ? '已复制' : '复制'}</span>
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleUnbind}
              disabled={binding}
              style={{ marginLeft: 12 }}
            >
              解绑
            </button>
          </div>
        )}
        {isCorrectWallet && (
          <div className="points-card-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="points-card-meta">
              <span className="points-card-next">距离升级还需 {pointsToNext} 分</span>
              <span className="points-card-percent">{Math.round(progress * 100)}%</span>
            </div>
          </div>
        )}
      </section>

      {/* 仅当无链上错误时显示「连接正确」 */}
      {isCorrectWallet && student.walletAddress && !balanceError && (
        <div className="home-status-banner">
          <span className="home-status-icon">
            <CheckCircle2 size={18} />
          </span>
          <div className="home-status-text">
            <div className="home-status-title">积分地址已绑定且连接正确</div>
            <div className="home-status-sub">可正常使用所有功能</div>
          </div>
        </div>
      )}

      {/* 快捷操作 */}
      <section className="home-quick-cards">
        <Link href="/report" className="quick-card quick-card-primary">
          <span className="quick-card-icon">
            <Camera size={18} />
          </span>
          <span className="quick-card-title">上传环保行为</span>
          <span className="quick-card-desc">拍照即可获得积分</span>
        </Link>

        <div className="quick-card quick-card-streak">
          <span className="quick-card-icon streak">
            <Flame size={18} />
          </span>
          <span className="quick-card-streak-value">{streakDays}</span>
          <span className="quick-card-desc">连续打卡天数</span>
        </div>
      </section>

      {/* 功能入口：桌面 2x2，移动端 3 卡片 */}
      <section className="home-features">
        <Link href="/report" className="feature-tile">
          <span className="feature-tile-icon green">
            <Camera size={20} />
          </span>
          <span className="feature-tile-title">行为上报</span>
          <span className="feature-tile-desc">记录环保行为，获取积分</span>
          <span className="feature-tile-arrow">
            <ChevronRight size={16} />
          </span>
        </Link>
        <Link href="/leaderboard" className="feature-tile">
          <span className="feature-tile-icon blue">
            <BarChart3 size={20} />
          </span>
          <span className="feature-tile-title">积分排行榜</span>
          <span className="feature-tile-desc">查看本周环保达人</span>
          <span className="feature-tile-arrow">
            <ChevronRight size={16} />
          </span>
        </Link>
        <Link href="/rewards" className="feature-tile">
          <span className="feature-tile-icon orange">
            <Gift size={20} />
          </span>
          <span className="feature-tile-title">奖励兑换</span>
          <span className="feature-tile-desc">兑换精美礼品</span>
          <span className="feature-tile-arrow">
            <ChevronRight size={16} />
          </span>
        </Link>
        <Link href="/profile" className="feature-tile">
          <span className="feature-tile-icon purple">
            <User size={20} />
          </span>
          <span className="feature-tile-title">个人中心</span>
          <span className="feature-tile-desc">查看积分明细与成就</span>
          <span className="feature-tile-arrow">
            <ChevronRight size={16} />
          </span>
        </Link>
      </section>

      {/* 校园动态：展示全站最近报告 */}
      <section className="home-activity">
        <h3 className="section-title">校园动态</h3>
        <ul className="activity-list">
          {campusRecent.length === 0 ? (
            <li className="activity-item empty">暂无记录，去上传一条环保行为吧。</li>
          ) : (
            campusRecent.slice(0, 5).map(report => (
              <li key={report.id} className="activity-item">
                <span className="activity-dot" />
                <span className="activity-text">
                  {report.name ? `${report.name} · ` : ''}{report.behaviorType}
                  {report.status === 'approved' && report.points != null && ` +${report.points}分`}
                  {report.status === 'approved' && report.txHash && (
                    <code style={{ marginLeft: 6, fontSize: 10 }} title={report.txHash}>链上哈希</code>
                  )}
                  {report.status === 'pending' && ' 待审核'}
                  {report.status === 'rejected' && ' 未通过'}
                </span>
                <span className="activity-time">{formatTimeAgo(report.createdAt)}</span>
              </li>
            ))
          )}
        </ul>
        {campusRecent.length > 0 && (
          <Link href="/report" className="activity-more">查看全部动态 →</Link>
        )}
      </section>

      {/* 成就移动到个人中心展示 */}
    </div>
  )
}

