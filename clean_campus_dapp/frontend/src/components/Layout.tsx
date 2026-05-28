'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'
import { Leaf, Home, ClipboardList, Trophy, Gift, User, Settings } from 'lucide-react'
import { useWeb3 } from '../contexts/Web3Context'
import { useAuth } from '../contexts/AuthContext'
import { useUi } from '../contexts/UiContext'
import { bindWallet, loginWithWallet, getMyRank, getUserRewards } from '../utils/api'

export default function Layout({ children }: { children: React.ReactNode }) {
  const { account, connectWallet, disconnectWallet, balance, balanceError, refreshBalance, signer } = useWeb3()
  const { student, logout, updateStudent, login, refreshStudent } = useAuth()
  const { showToast, showConfirm } = useUi()
  const router = useRouter()
  const pathname = usePathname() || ''
  const [walletMenuOpen, setWalletMenuOpen] = useState(false)
  const walletMenuCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isMobile, setIsMobile] = useState(false)
  const [currentHash, setCurrentHash] = useState<string>('')
  const [sidebarLevel, setSidebarLevel] = useState<number>(1)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const update = () => setCurrentHash(window.location.hash || '')
    update()
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  useEffect(() => {
    return () => {
      if (walletMenuCloseTimer.current) clearTimeout(walletMenuCloseTimer.current)
    }
  }, [])

  // 侧边栏等级：与首页一致——链上累计与「余额+库内兑换支出」取较大值
  useEffect(() => {
    const wallet = account || student?.walletAddress
    if (!wallet) {
      setSidebarLevel(1)
      return
    }
    const bal = parseFloat(balance || '0') || 0
    getMyRank(wallet)
      .then(async (r) => {
        const chain = r?.myTotalPoints ?? 0
        let redeem = 0
        if (account) {
          try {
            const urs = await getUserRewards(account)
            redeem = urs.reduce((s, u) => s + (u.reward?.pointsRequired ?? 0), 0)
          } catch {
            redeem = 0
          }
        }
        const total = Math.max(chain, bal + redeem)
        const level = Math.max(1, Math.floor(total / 100) + 1)
        setSidebarLevel(level)
      })
      .catch(() => setSidebarLevel(1))
  }, [student, account, balance])

  const handleWalletDisconnect = () => {
    disconnectWallet()
  }

  const handleWalletConnect = async () => {
    const wallet = await connectWallet()
    if (!wallet) return

    // 若当前已有学号登录，则执行“学号-钱包绑定”逻辑
    if (student) {
      if (!signer) return
      // 仅在未绑定或绑定的钱包与当前钱包不一致时提示绑定
      if (!student.walletAddress || student.walletAddress.toLowerCase() !== wallet.toLowerCase()) {
        const ok = await showConfirm({
          title: '绑定积分钱包',
          message:
            `是否将当前钱包地址 ${wallet.slice(0, 6)}...${wallet.slice(-4)} 绑定到学号 ${student.studentId} 作为积分钱包？\n\n` +
            '绑定后同一钱包不能再绑定到其他学号。',
          confirmText: '确认绑定',
          cancelText: '取消'
        })
        if (!ok) return

        try {
          const message = `Bind wallet for studentId:${student.studentId}`
          const signature = await signer.signMessage(message)
          await bindWallet({ walletAddress: wallet, signature })
          await refreshStudent()
          showToast({ type: 'success', title: '绑定成功', description: '钱包已与当前学号绑定。' })
        } catch (e: any) {
          console.error('绑定钱包失败:', e)
          showToast({
            type: 'error',
            title: '绑定失败',
            description: e.response?.data?.error || e.message || '请稍后重试'
          })
        }
      }
      return
    }

    // 若尚未学号登录，则尝试根据钱包自动登录（前提：该钱包已在 users 表中绑定学号）
    try {
      const data = await loginWithWallet(wallet)
      login(data.token, {
        studentId: data.studentId,
        name: data.name,
        college: data.college,
        walletAddress: data.walletAddress ?? null,
        escrowPoints: data.escrowPoints,
        hasWalletBound: !!data.walletAddress,
        role: data.role || 'student'
      })
      showToast({
        type: 'success',
        title: '登录成功',
        description: `已根据钱包自动登录学号 ${data.studentId}`
      })
    } catch (e: any) {
      const msg = e?.response?.data?.error
      if (msg) {
        console.info('钱包自动登录未成功:', msg)
      }
    }
  }

  const handleStudentLogout = () => {
    logout()
    router.push('/student/login')
  }

  const navItems = [
    { to: '/home', label: '首页概览', short: '首页', Icon: Home },
    { to: '/report', label: '行为上报', short: '上报', Icon: ClipboardList },
    { to: '/leaderboard', label: '积分排行榜', short: '排行', Icon: Trophy },
    { to: '/rewards', label: '奖励兑换', short: '兑换', Icon: Gift },
    { to: '/profile', label: '个人中心', short: '我的', Icon: User }
  ] as const

  const isActive = (to: string, hash?: string) => {
    const match = pathname === to || (to === '/home' && (pathname === '/' || pathname === '/home'))
    if (hash && currentHash === hash) return true
    if (hash) return false
    return match
  }

  return (
    <div className="layout">
      {/* 桌面端：左侧边栏 */}
      <aside className="layout-sidebar">
        <div className="sidebar-inner">
          <Link href="/home" className="sidebar-logo">
            <Leaf className="sidebar-logo-icon" />
            校园环保积分
          </Link>
          <nav className="sidebar-nav">
            {navItems.map(({ to, label, Icon }) => (
              <Link
                key={to}
                href={to}
                className={`sidebar-link ${isActive(to) ? 'active' : ''}`}
              >
                <Icon className="sidebar-link-icon" size={18} />
                {label}
              </Link>
            ))}
            {(student?.role === 'admin' || student?.role === 'auditor') && (
              <>
                <Link
                  href="/admin"
                  className={`sidebar-link ${pathname === '/admin' || pathname === '/admin/audit' ? 'active' : ''}`}
                >
                  <Settings className="sidebar-link-icon" size={18} />
                  审核中心
                </Link>
                {student?.role === 'admin' && (
                  <>
                    <Link
                      href="/admin/rewards"
                      className={`sidebar-link ${pathname === '/admin/rewards' ? 'active' : ''}`}
                    >
                      <Gift className="sidebar-link-icon" size={18} />
                      奖品管理
                    </Link>
                    <Link
                      href="/admin/rules"
                      className={`sidebar-link ${pathname === '/admin/rules' ? 'active' : ''}`}
                    >
                      <ClipboardList className="sidebar-link-icon" size={18} />
                      规则配置
                    </Link>
                  </>
                )}
                <Link
                  href="/admin/users"
                  className={`sidebar-link ${pathname === '/admin/users' ? 'active' : ''}`}
                >
                  <User className="sidebar-link-icon" size={18} />
                  用户管理
                </Link>
              </>
            )}
          </nav>
          <div className="sidebar-user">
            <div className="sidebar-avatar">
              {(student?.name || student?.studentId || '用')?.slice(0, 1)}
            </div>
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{student?.name || '同学'}</span>
              <span className="sidebar-user-level">环保达人 Lv.{sidebarLevel}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* 移动端：顶部栏（含钱包按钮） */}
      <header className="layout-topbar">
        <Link href="/home" className="topbar-title">校园环保积分</Link>
        <div className="topbar-actions">
          {(student?.role === 'admin' || student?.role === 'auditor') && (
            <Link href="/admin" className="topbar-admin-link">管理</Link>
          )}
          <button
            type="button"
            className="topbar-wallet-btn"
            onClick={account ? handleWalletDisconnect : handleWalletConnect}
          >
            {account ? `${account.slice(0, 4)}...${account.slice(-3)}` : '连接钱包'}
          </button>
          {student ? (
            <div className="topbar-avatar">
              {(student?.name || student?.studentId || '用')?.slice(0, 1)}
            </div>
          ) : (
            <button type="button" className="btn btn-sm btn-primary" onClick={() => router.push('/student/login')}>
              学号登录
            </button>
          )}
        </div>
      </header>

      {/* 主内容区 */}
      <div className="layout-main">
        {/* 桌面端：主区顶部操作（钱包/通知） */}
        <div className="layout-header-actions">
          {(student?.role === 'admin' || student?.role === 'auditor') && (
            <Link href="/admin" className="header-admin-link">管理后台</Link>
          )}
          <div className="student-summary">
            {student ? (
              <>
                <span className="student-name">{student.name || '同学'}</span>
                <button type="button" onClick={handleStudentLogout} className="btn btn-ghost">退出</button>
              </>
            ) : (
              <button type="button" onClick={() => router.push('/student/login')} className="btn btn-secondary">
                学号登录
              </button>
            )}
          </div>
          <div className="wallet-summary">
            {account ? (
              <>
                <div
                  className="wallet-dropdown"
                  onMouseEnter={() => {
                    if (walletMenuCloseTimer.current) {
                      clearTimeout(walletMenuCloseTimer.current)
                      walletMenuCloseTimer.current = null
                    }
                    setWalletMenuOpen(true)
                  }}
                  onMouseLeave={() => {
                    walletMenuCloseTimer.current = setTimeout(() => setWalletMenuOpen(false), 200)
                  }}
                >
                  <button
                    type="button"
                    className="btn btn-soft"
                    onClick={() => setWalletMenuOpen(o => !o)}
                  >
                    {student && !student.walletAddress
                      ? '钱包已连接（未绑定积分地址）▾'
                      : student?.walletAddress && account && student.walletAddress.toLowerCase() !== account.toLowerCase()
                      ? '钱包已连接（非积分地址）▾'
                      : '钱包已连接 ▾'}
                  </button>
                  {walletMenuOpen && (
                    <div className="wallet-menu">
                      <div className="wallet-menu-row">
                        <span className="wallet-menu-label">地址</span>
                        <span className="wallet-address">{account.slice(0, 6)}...{account.slice(-4)}</span>
                      </div>
                      <div className="wallet-menu-row">
                        <span className="wallet-menu-label">积分余额</span>
                        <span className="wallet-menu-value">{parseFloat(balance || '0').toFixed(2)} GCT</span>
                      </div>
                      {balanceError && (
                        <div className="wallet-menu-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
                          <span className="wallet-menu-label" style={{ color: '#b91c1c' }}>读取失败</span>
                          <span style={{ fontSize: 11, color: '#64748b' }}>请将钱包切换至与后端一致网络（Sepolia 或本地链）并重试</span>
                          <button type="button" className="btn btn-soft" style={{ marginTop: 4 }} onClick={() => refreshBalance()}>重试</button>
                        </div>
                      )}
                      <button type="button" className="btn btn-soft wallet-menu-action" onClick={handleWalletDisconnect}>
                        断开连接
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <button type="button" onClick={handleWalletConnect} className="btn btn-primary">连接钱包</button>
            )}
          </div>
        </div>

        <main className="main-content">
          {children}
        </main>
      </div>

      {/* 移动端：底部固定导航 */}
      <nav className="layout-bottom-nav">
        {navItems.map(({ to, short, Icon }) => (
          <Link
            key={to}
            href={to}
            className={`bottom-nav-item ${isActive(to) ? 'active' : ''}`}
          >
            <span className="bottom-nav-icon">
              <Icon size={18} />
            </span>
            <span className="bottom-nav-label">{short}</span>
          </Link>
        ))}
        {(student?.role === 'admin' || student?.role === 'auditor') && (
          <Link
            href="/admin"
            className={`bottom-nav-item ${pathname.startsWith('/admin') ? 'active' : ''}`}
          >
            <span className="bottom-nav-icon">
              <Settings size={18} />
            </span>
            <span className="bottom-nav-label">管理</span>
          </Link>
        )}
      </nav>
    </div>
  )
}
