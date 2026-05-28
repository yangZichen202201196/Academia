'use client'

import { useState, useEffect, useMemo } from 'react'
import { RotateCcw, Gift, Award, CheckCircle2, Check } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'
import { ethers } from 'ethers'
import { useAuth } from '../contexts/AuthContext'
import { useWeb3 } from '../contexts/Web3Context'
import { useUi } from '../contexts/UiContext'
import { GREEN_TOKEN_ABI } from '../abis/contractAbi'
import {
  getPendingReports,
  adminGetAuditStats,
  checkAuditorWallet,
  getContractStatus,
  adminApproveReportWithChain,
  adminApproveBatchWithChain,
  adminApproveReport,
  adminApproveBatch,
  adminRejectReport,
  adminGetRewards,
  adminCreateReward,
  adminUpdateReward,
  adminGetRedemptions,
  adminGetRules,
  adminUpdateRules,
  adminGetUsers,
  adminSetUserStatus,
  adminAddAdmin,
  adminRemoveAdmin,
  adminGetOperationLogs,
  getRewardsChainConfig,
  type Report
} from '../utils/api'

const REJECT_REASONS = ['图片不清晰', '与环保行为无关', '重复提交', '信息不完整', '其他']

// 避免请求 via.placeholder.com 导致 ERR_NAME_NOT_RESOLVED，用内联占位图替代
const PLACEHOLDER_IMAGE_DATA_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f0f0f0' width='400' height='300'/%3E%3Ctext fill='%23999' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='14'%3E%E5%9B%BE%E7%89%87%3C/text%3E%3C/svg%3E"
const safeReportImageUrl = (url: string | undefined) => {
  if (!url) return ''
  if (url.includes('via.placeholder') || url.includes('placeholder.com')) return PLACEHOLDER_IMAGE_DATA_URL
  return url
}

/** 从日志 details 取链上交易哈希；JSON 中可能同时含 wallet 与 txHash，不能对整段做首个 0x 匹配 */
const HEX_TX_LIKE = /^0x[0-9a-fA-F]{8,}$/
function extractTxHashFromLogDetails(details: string | undefined | null): string {
  if (!details || typeof details !== 'string') return ''
  const t = details.trim()
  if (t.startsWith('{')) {
    try {
      const obj = JSON.parse(t) as Record<string, unknown>
      if (typeof obj.txHash === 'string' && HEX_TX_LIKE.test(obj.txHash)) {
        return obj.txHash
      }
      const items = obj.items
      if (Array.isArray(items)) {
        for (const it of items) {
          if (
            it &&
            typeof it === 'object' &&
            typeof (it as { txHash?: string }).txHash === 'string' &&
            HEX_TX_LIKE.test((it as { txHash: string }).txHash)
          ) {
            return (it as { txHash: string }).txHash
          }
        }
      }
    } catch {
      // 非 JSON 时走下方兜底
    }
  }
  const m = details.match(/0x[0-9a-fA-F]{8,}/)
  return m ? m[0] : ''
}

type AdminSection = 'audit' | 'rewards' | 'rules' | 'users' | 'onchain'

const SIDEBAR_ITEMS: { key: AdminSection; label: string; path: string; adminOnly?: boolean }[] = [
  { key: 'audit', label: '审核中心', path: '/admin' },
  { key: 'rewards', label: '奖品管理', path: '/admin/rewards', adminOnly: true },
  { key: 'rules', label: '规则配置', path: '/admin/rules', adminOnly: true },
  { key: 'users', label: '用户管理', path: '/admin/users' },
  { key: 'onchain', label: '链上管理', path: '/admin/onchain', adminOnly: true }
]

export default function Admin() {
  const { student } = useAuth()
  const { account } = useWeb3()
  const pathname = usePathname()
  const router = useRouter()
  const [isMobile, setIsMobile] = useState(false)

  const section: AdminSection =
    pathname === '/admin/rewards' ? 'rewards'
    : pathname === '/admin/rules' ? 'rules'
    : pathname === '/admin/users' ? 'users'
    : pathname === '/admin/onchain' ? 'onchain'
    : 'audit'

  useEffect(() => {
    const update = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 768)
      }
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  useEffect(() => {
    if (isMobile && pathname === '/admin/onchain') {
      router.replace('/admin')
    }
  }, [isMobile, pathname, router])

  const items = SIDEBAR_ITEMS
    .filter(i => !i.adminOnly || student?.role === 'admin')
    .filter(i => !(isMobile && i.key === 'onchain'))

  const walletMismatch =
    !!account &&
    !!student?.walletAddress &&
    student.walletAddress.toLowerCase() !== account.toLowerCase()

  return (
    <div className="admin-layout">
      {walletMismatch && (
        <div
          className="admin-wallet-warning"
          style={{
            background: '#fef2f2',
            color: '#b91c1c',
            padding: '8px 12px',
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 12
          }}
        >
          当前连接的钱包地址与该管理员账号绑定的积分钱包不一致。
          如需在链上查看或调试积分，请先在浏览器中切换到绑定的钱包地址，以避免误解和误操作。
        </div>
      )}
      {/* 移动端：无外部侧栏时用顶部 Tab 切换 */}
      <nav className="admin-mobile-tabs">
        {items.map(({ key, label, path }) => (
          <button
            key={key}
            type="button"
            className={`admin-mobile-tab ${section === key ? 'active' : ''}`}
            onClick={() => router.push(path)}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="admin-content">
        {section === 'audit' && <AuditCenter />}
        {section === 'rewards' && student?.role === 'admin' && <RewardsManage />}
        {section === 'rules' && student?.role === 'admin' && <RulesConfig />}
        {section === 'users' && <UsersManage />}
        {section === 'onchain' && student?.role === 'admin' && !isMobile && <OnchainManage />}
      </div>
    </div>
  )
}

function AuditCenter() {
  const { account, contract } = useWeb3()
  const { showToast } = useUi()
  const [reports, setReports] = useState<Report[]>([])
  const [stats, setStats] = useState({ pendingToday: 0, approvedCount: 0, rejectedCount: 0 })
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState<number | null>(null)
  const [batchSelected, setBatchSelected] = useState<Set<number>>(new Set())
  const [rejectModal, setRejectModal] = useState<{ reportId: number; reason: string } | null>(null)
  const [search, setSearch] = useState('')
  const [behaviorFilter, setBehaviorFilter] = useState('')
  const [mobileIndex, setMobileIndex] = useState(0)
  const [isAuditorWallet, setIsAuditorWallet] = useState<boolean | null>(null)
  const [contractStatus, setContractStatus] = useState<{ ok: boolean; error?: string } | null>(null)
  const [rules, setRules] = useState<{ behaviorType: string; points: number }[]>([])
  const [approveDialog, setApproveDialog] = useState<{ report: Report; points: number } | null>(null)
  const [batchDialog, setBatchDialog] = useState<{ reports: Report[] } | null>(null)

  useEffect(() => {
    if (!account) {
      setIsAuditorWallet(null)
      return
    }
    checkAuditorWallet(account).then(r => setIsAuditorWallet(r.isAdmin)).catch(() => setIsAuditorWallet(false))
  }, [account])

  useEffect(() => {
    getContractStatus()
      .then(s => setContractStatus({ ok: s.ok, error: s.error }))
      .catch(() => setContractStatus({ ok: false, error: '无法获取合约状态' }))
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      const [data, s, rulesData] = await Promise.all([getPendingReports(), adminGetAuditStats(), adminGetRules()])
      setReports(data)
      setStats(s)
      setRules(rulesData || [])
      setBatchSelected(new Set())
    } catch (e: any) {
      if (e.response?.status === 401 || e.response?.status === 403) {
        showToast({ type: 'error', title: '无权限访问', description: '请使用审核员或管理员账号登录。' })
      } else {
        showToast({ type: 'error', title: '加载失败', description: e.response?.data?.error || e.message })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filteredReports = reports.filter(r => {
    const matchSearch = !search || `${r.name || ''} ${r.studentId || ''} ${r.walletAddress || ''}`.includes(search)
    const matchBehavior = !behaviorFilter || r.behaviorType === behaviorFilter
    return matchSearch && matchBehavior
  })

  const behaviorTypes = Array.from(new Set(reports.map(r => r.behaviorType)))

  const handleApprove = (report: Report, pointsInput: number) => {
    const points = Math.max(1, Number(pointsInput) || 10)
    if (!report.walletAddress) {
      showToast({ type: 'error', title: '无法审核', description: '报告缺少钱包地址，请先让用户完成钱包绑定。' })
      return
    }
    if (contractStatus?.ok === false) {
      showToast({ type: 'error', title: '链上合约未就绪', description: '请按 contracts/DEPLOY.md 启动 Hardhat 并部署后再试。' })
      return
    }
    setApproveDialog({ report, points })
  }

  const confirmApprovePass = async () => {
    if (!approveDialog) return
    const { report, points } = approveDialog
    setApproveDialog(null)
    setProcessing(report.id)
    try {
      const data = await adminApproveReportWithChain(report.id, points)
      const displayName = report.name || report.studentId || '学生'
      showToast({
        type: 'success',
        title: '审核通过',
        description: `已向 ${displayName} 发放 ${points} 积分`,
        txHash: data.txHash
      })
      await load()
    } catch (e: any) {
      const detail = e.response?.data?.error || e.message || '审核失败'
      showToast({ type: 'error', title: '审核失败', description: detail })
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (reportId: number, reason?: string) => {
    setProcessing(reportId)
    try {
      await adminRejectReport(reportId, reason)
      setRejectModal(null)
      showToast({ type: 'success', title: '已驳回', description: '该环保行为报告已拒绝。' })
      await load()
    } catch (e: any) {
      showToast({ type: 'error', title: '操作失败', description: e.response?.data?.error || e.message })
    } finally {
      setProcessing(null)
    }
  }

  const toggleBatch = (id: number) => {
    setBatchSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleBatchApprove = () => {
    if (batchSelected.size === 0) {
      showToast({ type: 'error', title: '未选择报告', description: '请先勾选要通过的报告。' })
      return
    }
    const reportsToApprove = reports.filter(r => batchSelected.has(r.id) && r.walletAddress)
    if (reportsToApprove.length === 0) {
      showToast({ type: 'error', title: '无法批量通过', description: '所选报告缺少钱包地址。' })
      return
    }
    if (contractStatus?.ok === false) {
      showToast({ type: 'error', title: '链上合约未就绪', description: '请按 contracts/DEPLOY.md 启动 Hardhat 并部署后再试。' })
      return
    }
    setBatchDialog({ reports: reportsToApprove })
  }

  const confirmBatchPass = async () => {
    if (!batchDialog) return
    const reportsToApprove = batchDialog.reports
    setBatchDialog(null)
    setProcessing(-1)
    try {
      const rulePoints = (bt: string) => rules.find(rule => rule.behaviorType === bt)?.points ?? 10
      const items = reportsToApprove.map(r => ({
        reportId: r.id,
        points: Math.max(1, rulePoints(r.behaviorType))
      }))
      await adminApproveBatchWithChain(items)
      showToast({
        type: 'success',
        title: '批量审核通过',
        description: `已成功处理 ${items.length} 条报告并发放积分。`
      })
      await load()
    } catch (e: any) {
      const detail = e.response?.data?.error || e.message || '批量审核失败'
      showToast({ type: 'error', title: '批量审核失败', description: detail })
    } finally {
      setProcessing(null)
    }
  }

  const currentReport = filteredReports[mobileIndex]

  if (loading) return <p className="admin-loading">加载中...</p>

  return (
    <div className="admin-audit">
      <header className="admin-section-header">
        <h1>审核中心</h1>
        <span className="admin-section-sub">校园环保积分</span>
      </header>

      {contractStatus?.ok === false && (
        <div className="audit-wallet-warn" style={{ padding: '12px 16px', background: '#fef2f2', color: '#b91c1c', borderRadius: 8, marginBottom: 16 }}>
          链上合约未就绪：{contractStatus.error}。请按 contracts/DEPLOY.md 启动 npx hardhat node 并执行部署后刷新本页。
        </div>
      )}

      {/* 统计卡片 */}
      <div className="audit-stats">
        <div className="audit-stat-card pending">
          <span className="audit-stat-label">今日待审</span>
          <span className="audit-stat-value">{stats.pendingToday}</span>
        </div>
        <div className="audit-stat-card approved">
          <span className="audit-stat-label">已通过</span>
          <span className="audit-stat-value">{stats.approvedCount}</span>
        </div>
        <div className="audit-stat-card rejected">
          <span className="audit-stat-label">已驳回</span>
          <span className="audit-stat-value">{stats.rejectedCount}</span>
        </div>
      </div>

      {/* 搜索与筛选 */}
      <div className="audit-filters">
        <input
          type="text"
          className="audit-search"
          placeholder="搜索学生姓名/学号"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="audit-filter-type"
          value={behaviorFilter}
          onChange={e => setBehaviorFilter(e.target.value)}
        >
          <option value="">行为类型</option>
          {behaviorTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleBatchApprove}
          disabled={batchSelected.size === 0 || processing === -1 || contractStatus?.ok === false}
        >
          {processing === -1 ? '处理中...' : `批量通过 (${batchSelected.size})`}
        </button>
      </div>

      {/* 桌面端：列表 */}
      <div className="audit-list audit-list-desktop">
        {filteredReports.length === 0 ? (
          <p className="admin-empty">暂无待审核报告</p>
        ) : (
          filteredReports.map(report => (
            <AuditCard
              key={report.id}
              report={report}
              rules={rules}
              batchSelected={batchSelected}
              toggleBatch={toggleBatch}
              processing={processing}
              onApprove={handleApprove}
              onReject={() => setRejectModal({ reportId: report.id, reason: '' })}
              approveDisabled={contractStatus?.ok === false}
            />
          ))
        )}
      </div>

      {/* 移动端：单条审核 + 下一条 */}
      <div className="audit-list audit-list-mobile">
        {filteredReports.length === 0 ? (
          <p className="admin-empty">暂无待审核报告</p>
        ) : currentReport ? (
          <>
            <div className="audit-mobile-header">
              <span>审核中心</span>
              <span className="audit-mobile-pending">待审 {filteredReports.length}</span>
            </div>
            <AuditCard
              report={currentReport}
              rules={rules}
              batchSelected={new Set()}
              toggleBatch={() => {}}
              processing={processing}
              onApprove={handleApprove}
              onReject={() => setRejectModal({ reportId: currentReport.id, reason: '' })}
              approveDisabled={contractStatus?.ok === false}
              compact
            />
            <div className="audit-mobile-nav">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setMobileIndex(i => (i + 1) % filteredReports.length)}
              >
                下一条 →
              </button>
            </div>
          </>
        ) : null}
      </div>

      {rejectModal && (
        <div className="modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h4>拒绝原因</h4>
            <select
              value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
            >
              <option value="">请选择或输入</option>
              {REJECT_REASONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="或输入自定义原因"
              value={rejectModal.reason}
              onChange={e => setRejectModal({ ...rejectModal, reason: e.target.value })}
            />
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setRejectModal(null)}>取消</button>
              <button type="button" className="btn btn-primary" onClick={() => handleReject(rejectModal.reportId, rejectModal.reason || undefined)}>
                确认拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {approveDialog && (
        <div
          className="audit-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-confirm-title"
          onClick={() => setApproveDialog(null)}
        >
          <div className="audit-confirm-card" onClick={e => e.stopPropagation()}>
            <div className="audit-confirm-head">
              <div className="audit-confirm-head-icon" aria-hidden>
                <CheckCircle2 size={22} strokeWidth={2} />
              </div>
              <div>
                <div id="audit-confirm-title" className="audit-confirm-title">审核确认</div>
                <div className="audit-confirm-sub">校园环保积分系统</div>
              </div>
            </div>

            <p className="audit-confirm-question">确认通过该环保行为？</p>
            <p className="audit-confirm-summary">
              将向{' '}
              <span className="audit-confirm-highlight">{approveDialog.report.name || '同学'}</span>{' '}
              发放{' '}
              <span className="audit-confirm-highlight">{approveDialog.points} 积分</span>
            </p>

            <div className="audit-confirm-detail">
              <div className="audit-confirm-row">
                <span className="audit-confirm-label">学生姓名</span>
                <span className="audit-confirm-value">
                  {approveDialog.report.name || '—'}
                  {approveDialog.report.studentId ? ` (${approveDialog.report.studentId})` : ''}
                </span>
              </div>
              <div className="audit-confirm-row">
                <span className="audit-confirm-label">行为类型</span>
                <span className="audit-confirm-value">{approveDialog.report.behaviorType}</span>
              </div>
              <div className="audit-confirm-row audit-confirm-row--last">
                <span className="audit-confirm-label">AI 识别置信度</span>
                <span className="audit-confirm-value audit-confirm-ai">
                  {approveDialog.report.aiConfidence != null
                    ? `${(approveDialog.report.aiConfidence * 100).toFixed(0)}%`
                    : '—'}
                  {approveDialog.report.aiConfidence != null && approveDialog.report.aiConfidence >= 0.7 && (
                    <Check size={14} className="audit-confirm-ai-check" aria-hidden />
                  )}
                </span>
              </div>
            </div>

            <div className="audit-confirm-actions">
              <button type="button" className="btn audit-confirm-cancel" onClick={() => setApproveDialog(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn audit-confirm-submit"
                onClick={confirmApprovePass}
                disabled={processing === approveDialog.report.id}
              >
                <Check size={18} strokeWidth={2.5} aria-hidden />
                {processing === approveDialog.report.id ? '处理中...' : '确认通过'}
              </button>
            </div>
          </div>
        </div>
      )}

      {batchDialog && (
        <div
          className="audit-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-confirm-title"
          onClick={() => setBatchDialog(null)}
        >
          <div className="audit-confirm-card" onClick={e => e.stopPropagation()}>
            <div className="audit-confirm-head">
              <div className="audit-confirm-head-icon" aria-hidden>
                <CheckCircle2 size={22} strokeWidth={2} />
              </div>
              <div>
                <div id="batch-confirm-title" className="audit-confirm-title">批量审核确认</div>
                <div className="audit-confirm-sub">校园环保积分系统</div>
              </div>
            </div>

            <p className="audit-confirm-question">确认批量通过选中的报告？</p>
            <p className="audit-confirm-summary">
              将处理 <span className="audit-confirm-highlight">{batchDialog.reports.length}</span> 条，积分按规则配置发放
            </p>

            <p className="audit-batch-preview">
              {batchDialog.reports.slice(0, 4).map(r => (
                <span key={r.id} className="audit-batch-chip">
                  {r.name || r.studentId || `#${r.id}`}
                </span>
              ))}
              {batchDialog.reports.length > 4 && (
                <span className="audit-batch-more">等 {batchDialog.reports.length} 条</span>
              )}
            </p>

            <div className="audit-confirm-actions">
              <button type="button" className="btn audit-confirm-cancel" onClick={() => setBatchDialog(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn audit-confirm-submit"
                onClick={confirmBatchPass}
                disabled={processing === -1}
              >
                <Check size={18} strokeWidth={2.5} aria-hidden />
                {processing === -1 ? '处理中...' : '确认批量通过'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AuditCard({
  report,
  rules,
  batchSelected,
  toggleBatch,
  processing,
  onApprove,
  onReject,
  approveDisabled,
  compact
}: {
  report: Report
  rules: { behaviorType: string; points: number }[]
  batchSelected: Set<number>
  toggleBatch: (id: number) => void
  processing: number | null
  onApprove: (r: Report, points: number) => void
  onReject: () => void
  approveDisabled?: boolean
  compact?: boolean
}) {
  // 与规则配置一致：优先使用该行为类型在规则中的积分
  const points = rules.find(r => r.behaviorType === report.behaviorType)?.points ?? report.aiSuggestedPoints ?? 10
  const needReview = report.aiConfidence != null && report.aiConfidence < 0.7

  return (
    <div className={`report-card ${compact ? 'report-card-compact' : ''}`}>
      <div className="report-card-left">
        {report.imageUrl ? (
          <img
            src={safeReportImageUrl(report.imageUrl)}
            alt="报告"
            className="report-card-img"
            onError={(e) => {
              e.currentTarget.onerror = null
              e.currentTarget.src = PLACEHOLDER_IMAGE_DATA_URL
            }}
          />
        ) : (
          <div className="report-card-img-placeholder">[图片]</div>
        )}
      </div>
      <div className="report-card-body">
        <div className="report-card-header">
          {!compact && (
            <label className="batch-check">
              <input
                type="checkbox"
                checked={batchSelected.has(report.id)}
                onChange={() => toggleBatch(report.id)}
                disabled={!report.walletAddress}
              />
            </label>
          )}
          <div>
            <h3>{report.name || report.studentId || '用户'} ({report.studentId || report.walletAddress?.slice(0, 10)})</h3>
            <p className="report-meta">{report.behaviorType} · {new Date(report.createdAt).toLocaleString('zh-CN')}</p>
          </div>
          <span className="status status-pending">待审核</span>
        </div>
          {report.aiConfidence != null && (
            <div className={`ai-info ${needReview ? 'ai-info-warn' : ''}`}>
              <span className="ai-label">AI识别:</span>
              <span className="ai-confidence">置信度 {(report.aiConfidence * 100).toFixed(0)}%</span>
              {needReview && <span className="ai-need-review">(需人工复核)</span>}
              {!needReview && <span className="ai-ok">✔</span>}
            </div>
          )}
          {report.description && <p className="report-description">"{report.description}"</p>}
          <div className="report-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onApprove(report, points)}
              disabled={processing === report.id || approveDisabled}
            >
              {processing === report.id ? '处理中...' : `通过 +${points}分`}
            </button>
            <button type="button" className="btn btn-reject" onClick={onReject} disabled={processing === report.id}>
              驳回
            </button>
          </div>
      </div>
    </div>
  )
}

function RewardsManage() {
  const { showToast } = useUi()
  const [rewards, setRewards] = useState<any[]>([])
  const [redemptions, setRedemptions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<any>(null)
  const [form, setForm] = useState({ name: '', description: '', pointsRequired: 10, type: 'code', stock: 0, pickupAddress: '' })

  const load = async () => {
    try {
      setLoading(true)
      const [r, red] = await Promise.all([adminGetRewards(), adminGetRedemptions()])
      setRewards(r)
      setRedemptions(red)
    } catch (e: any) {
      showToast({ type: 'error', title: '加载失败', description: e.response?.data?.error || e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async () => {
    if (!form.name || !form.description) {
      showToast({ type: 'info', title: '请完善信息', description: '请填写奖品名称和描述。' })
      return
    }
    try {
      await adminCreateReward({
        ...form,
        pointsRequired: Number(form.pointsRequired) || 0,
        stock: Number(form.stock) || 0
      })
      setShowForm(false)
      setForm({ name: '', description: '', pointsRequired: 10, type: 'code', stock: 0, pickupAddress: '' })
      await load()
    } catch (e: any) {
      showToast({ type: 'error', title: '新增失败', description: e.response?.data?.error || e.message })
    }
  }

  const handleUpdate = async (id: number, data: any) => {
    try {
      await adminUpdateReward(id, data)
      setEditing(null)
      await load()
    } catch (e: any) {
      showToast({ type: 'error', title: '更新失败', description: e.response?.data?.error || e.message })
    }
  }

  const toggleShelf = async (r: any) => {
    await handleUpdate(r.id, { status: r.status === 'on_shelf' ? 'off_shelf' : 'on_shelf' })
  }

  const lowStock = rewards.filter(r => r.stock > 0 && r.stock <= 5)

  if (loading) return <p className="admin-loading">加载中...</p>

  return (
    <div className="admin-rewards">
      <header className="admin-section-header">
        <h1>奖品管理</h1>
        <span className="admin-section-sub">校园环保积分</span>
        <button type="button" className="btn btn-primary btn-add-reward" onClick={() => setShowForm(true)}>
          + 新增奖品
        </button>
      </header>

      {showForm && (
        <div className="reward-form card">
          <h4>新增奖品</h4>
          <div className="form-group">
            <label>名称</label>
            <input placeholder="名称" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>描述</label>
            <input placeholder="描述" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>所需积分</label>
            <input type="number" placeholder="所需积分" value={form.pointsRequired} onChange={e => setForm({ ...form, pointsRequired: Number(e.target.value) })} />
          </div>
          <div className="form-group">
            <label>类型</label>
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              <option value="code">兑换码</option>
              <option value="certificate">证书</option>
            </select>
          </div>
          <div className="form-group">
            <label>库存</label>
            <input type="number" placeholder="库存" value={form.stock} onChange={e => setForm({ ...form, stock: Number(e.target.value) })} />
          </div>
          <div className="form-group">
            <label>领取地址/说明</label>
            <input placeholder="如：东区食堂1号窗口、学生事务中心3楼、在线查看等" value={form.pickupAddress} onChange={e => setForm({ ...form, pickupAddress: e.target.value })} />
          </div>
          <div>
            <button type="button" className="btn btn-primary" onClick={handleCreate}>保存</button>
            <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>取消</button>
          </div>
        </div>
      )}

      <div className="rewards-grid">
        {rewards.map(r => (
          <div key={r.id} className={`reward-card ${r.stock > 0 && r.stock <= 5 ? 'reward-card-warn' : ''}`}>
            <div className="reward-card-icon">
              {r.type === 'certificate' ? <Award size={48} strokeWidth={1.5} /> : <Gift size={48} strokeWidth={1.5} />}
            </div>
            <div className="reward-card-name">{r.name}</div>
            <div className="reward-card-points">{r.pointsRequired}积分</div>
            <div className="reward-card-stock">库存: {r.stock === 0 && r.type === 'certificate' ? '无限' : r.stock}</div>
            <div className="reward-card-actions">
              <button type="button" className="btn btn-sm" onClick={() => setEditing(r)}>编辑</button>
              <button type="button" className="btn btn-sm" onClick={() => toggleShelf(r)}>
                {r.status === 'off_shelf' ? '上架' : '下架'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {lowStock.length > 0 && (
        <div className="rewards-stock-warn">
          ▲ 库存预警: {lowStock.map(r => `${r.name}仅剩${r.stock}件`).join(', ')}，请及时补充
        </div>
      )}

      <h4 className="admin-subtitle">兑换记录</h4>
      <table className="admin-table">
        <thead>
          <tr>
            <th>奖品</th>
            <th>积分</th>
            <th>钱包</th>
            <th>时间</th>
          </tr>
        </thead>
        <tbody>
          {redemptions.slice(0, 50).map(ur => (
            <tr key={ur.id}>
              <td>{ur.rewardName}</td>
              <td>{ur.pointsRequired}</td>
              <td>{ur.walletAddress?.slice(0, 10)}...</td>
              <td>{ur.redeemedAt}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <div className="modal-overlay" onClick={() => setEditing(null)}>
          <div className="modal reward-edit-modal" onClick={e => e.stopPropagation()}>
            <h4>编辑奖品</h4>
            <div className="form-group">
              <label>名称</label>
              <input
                value={editing.name ?? ''}
                onChange={e => setEditing({ ...editing, name: e.target.value })}
                placeholder="名称"
              />
            </div>
            <div className="form-group">
              <label>描述</label>
              <input
                value={editing.description ?? ''}
                onChange={e => setEditing({ ...editing, description: e.target.value })}
                placeholder="描述"
              />
            </div>
            <div className="form-group">
              <label>所需积分</label>
              <input
                type="number"
                value={editing.pointsRequired ?? ''}
                onChange={e => setEditing({ ...editing, pointsRequired: Number(e.target.value) })}
                placeholder="积分"
              />
            </div>
            <div className="form-group">
              <label>库存</label>
              <input
                type="number"
                value={editing.stock ?? ''}
                onChange={e => setEditing({ ...editing, stock: Number(e.target.value) })}
                placeholder="库存"
              />
            </div>
            <div className="form-group">
              <label>领取地址/说明</label>
              <input
                value={editing.pickupAddress ?? ''}
                onChange={e => setEditing({ ...editing, pickupAddress: e.target.value })}
                placeholder="如：东区食堂1号窗口、学生事务中心3楼、在线查看等"
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" onClick={() => handleUpdate(editing.id, editing)}>保存</button>
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RulesConfig() {
  const { showToast, showConfirm } = useUi()
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<number | null>(null)

  const load = async () => {
    try {
      setLoading(true)
      const data = await adminGetRules()
      setRules(data)
    } catch (e: any) {
      showToast({ type: 'error', title: '加载失败', description: e.response?.data?.error || e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleSaveRow = async (r: any) => {
    setSavingId(r.id)
    try {
      await adminUpdateRules([{
        behaviorType: r.behaviorType,
        points: r.points,
        dailyLimit: r.dailyLimit,
        validDays: r.validDays ?? 365
      }])
      showToast({ type: 'success', title: '保存成功', description: '规则已更新。' })
    } catch (e: any) {
      showToast({ type: 'error', title: '保存失败', description: e.response?.data?.error || e.message })
    } finally {
      setSavingId(null)
    }
  }

  const handleRestoreDefault = async () => {
    const ok = await showConfirm({
      title: '恢复默认规则',
      message: '确认将环保行为积分规则恢复为系统默认值？当前已保存的自定义配置将被覆盖。',
      confirmText: '确认恢复',
      cancelText: '取消',
      danger: true
    })
    if (!ok) return
    const defaults = [
      { behaviorType: '垃圾分类投放', points: 10, dailyLimit: 5, validDays: 365 },
      { behaviorType: '随手清洁', points: 5, dailyLimit: 3, validDays: 365 },
      { behaviorType: '步行上学', points: 5, dailyLimit: 3, validDays: 365 },
      { behaviorType: '骑行上学', points: 5, dailyLimit: 3, validDays: 365 },
      { behaviorType: '公交出行', points: 3, dailyLimit: 3, validDays: 365 },
      { behaviorType: '节约用水', points: 3, dailyLimit: 5, validDays: 365 },
      { behaviorType: '节约用电', points: 3, dailyLimit: 5, validDays: 365 },
      { behaviorType: '关灯断电', points: 2, dailyLimit: 5, validDays: 365 },
      { behaviorType: '空调节能', points: 3, dailyLimit: 3, validDays: 365 },
      { behaviorType: '旧物回收', points: 15, dailyLimit: 10, validDays: 365 },
      { behaviorType: '纸张双面打印', points: 2, dailyLimit: 5, validDays: 365 },
      { behaviorType: '自带水杯', points: 2, dailyLimit: 3, validDays: 365 },
      { behaviorType: '光盘行动', points: 3, dailyLimit: 3, validDays: 365 },
      { behaviorType: '电子票据', points: 2, dailyLimit: 5, validDays: 365 },
      { behaviorType: '绿色购物袋', points: 2, dailyLimit: 5, validDays: 365 },
      { behaviorType: '植树护绿', points: 8, dailyLimit: 2, validDays: 365 },
      { behaviorType: '垃圾减量', points: 3, dailyLimit: 3, validDays: 365 },
      { behaviorType: '垃圾分类宣传', points: 6, dailyLimit: 2, validDays: 365 },
      { behaviorType: '环保志愿服务', points: 10, dailyLimit: 2, validDays: 365 },
      { behaviorType: '其他环保行为', points: 5, dailyLimit: 3, validDays: 365 }
    ]
    setLoading(true)
    adminUpdateRules(defaults)
      .then(() => load())
      .then(() => showToast({ type: 'success', title: '已恢复默认规则', description: '环保行为积分标准已重置为预设值。' }))
      .catch((e: any) =>
        showToast({
          type: 'error',
          title: '恢复失败',
          description: e?.response?.data?.error || e?.message || '未知错误'
        })
      )
      .finally(() => setLoading(false))
  }

  if (loading) return <p className="admin-loading">加载中...</p>

  return (
    <div className="admin-rules">
      <header className="admin-section-header">
        <h1>规则配置</h1>
        <span className="admin-section-sub">校园环保积分</span>
        <button type="button" className="btn btn-secondary" onClick={handleRestoreDefault}>恢复默认</button>
      </header>

      <h4 className="rules-table-title">环保行为积分标准</h4>
      <table className="admin-table rules-table">
        <thead>
          <tr>
            <th>行为类型</th>
            <th>积分值</th>
            <th>每日上限</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r, i) => (
            <tr key={r.id}>
              <td>{r.behaviorType}</td>
              <td>
                <input
                  type="number"
                  value={r.points}
                  onChange={e => {
                    const next = [...rules]
                    next[i] = { ...next[i], points: Number(e.target.value) }
                    setRules(next)
                  }}
                />
              </td>
              <td>
                <input
                  type="number"
                  value={r.dailyLimit}
                  onChange={e => {
                    const next = [...rules]
                    next[i] = { ...next[i], dailyLimit: Number(e.target.value) }
                    setRules(next)
                  }}
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSaveRow(rules[i])}
                  disabled={savingId === r.id}
                >
                  {savingId === r.id ? '保存中...' : '保存'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rules-footer">修改后点击“保存”即时生效，已产生的积分不受影响</p>
      <p className="rules-footer rules-sync">链上合约状态: 已同步 ✔ 最近更新: {new Date().toLocaleString('zh-CN')}</p>
    </div>
  )
}

function UsersManage() {
  const { student } = useAuth()
  const { showToast, showConfirm } = useUi()
  const [users, setUsers] = useState<any[]>([])
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'admin' | 'auditor'>('all')
  const [showAddAdminModal, setShowAddAdminModal] = useState(false)
  const [addAdminStudentId, setAddAdminStudentId] = useState('')
  const [addAdminProcessing, setAddAdminProcessing] = useState(false)
  const [removeAdminProcessing, setRemoveAdminProcessing] = useState<string | null>(null)
  const [blockExplorerUrl, setBlockExplorerUrl] = useState('')

  useEffect(() => {
    getRewardsChainConfig()
      .then((c) => {
        const url = (c.blockExplorerUrl || (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BLOCK_EXPLORER_URL) || '').trim()
        if (url) setBlockExplorerUrl(url.replace(/\/+$/, ''))
      })
      .catch(() => {})
  }, [])

  const load = async () => {
    try {
      setLoading(true)
      const [u, l] = await Promise.all([adminGetUsers(), adminGetOperationLogs(100)])
      setUsers(u)
      setLogs(l)
    } catch (e: any) {
      showToast({ type: 'error', title: '加载失败', description: e.response?.data?.error || e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const isToday = (dateStr: string) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    if (Number.isNaN(d.getTime())) return false
    const now = new Date()
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    )
  }

  const totalUsers = users.length
  const activeUsers = users.filter(u => u.status === 'active').length
  const newToday = users.filter(u => isToday(u.createdAt)).length
  const totalPoints = users.reduce((sum, u) => sum + (u.escrowPoints || 0), 0)

  const filteredUsers = useMemo(() => {
    let list = [...users]
    if (roleFilter !== 'all') {
      list = list.filter(u => u.role === roleFilter)
    }
    if (search.trim()) {
      const kw = search.trim().toLowerCase()
      list = list.filter(u =>
        `${u.studentId || ''} ${u.name || ''}`.toLowerCase().includes(kw)
      )
    }
    return list
  }, [users, roleFilter, search])

  const roleLabel = (role: string) => {
    if (role === 'admin') return '管理员'
    if (role === 'auditor') return '审核员'
    return '学生'
  }

  const handleStatus = async (sid: string, status: 'active' | 'banned') => {
    if (!sid || String(sid).trim() === '') {
      showToast({ type: 'error', title: '无法操作', description: '用户学号无效。' })
      return
    }
    const ok = await showConfirm({
      title: status === 'banned' ? '禁用用户' : '启用用户',
      message: `确认${status === 'banned' ? '禁用' : '启用'}该用户？`,
      confirmText: '确认',
      cancelText: '取消',
      danger: status === 'banned'
    })
    if (!ok) return
    try {
      await adminSetUserStatus(sid.trim(), status)
      await load()
      showToast({
        type: 'success',
        title: status === 'banned' ? '已禁用' : '已启用',
        description: status === 'banned' ? '该用户已被禁用。' : '该用户已恢复为正常状态。'
      })
    } catch (e: any) {
      showToast({ type: 'error', title: '操作失败', description: e.response?.data?.error || e.message })
    }
  }

  const canBeAdminUsers = useMemo(() => {
    return users.filter(
      u => (u.role === 'student' || !u.role) && u.walletAddress && String(u.walletAddress).trim() !== ''
    )
  }, [users])

  const handleAddAdmin = async () => {
    const sid = String(addAdminStudentId || '').trim()
    if (!sid) {
      showToast({ type: 'info', title: '请选择用户', description: '请在下拉框中选择要设为管理员的用户。' })
      return
    }
    setAddAdminProcessing(true)
    try {
      const res = await adminAddAdmin(sid)
      await load()
      setShowAddAdminModal(false)
      setAddAdminStudentId('')
      showToast({
        type: 'success',
        title: '操作成功',
        description: res.message || (res.txHash ? '已上链并设为管理员' : '已设为管理员'),
        txHash: res.txHash
      })
    } catch (e: any) {
      showToast({ type: 'error', title: '操作失败', description: e.response?.data?.error || e.message })
    } finally {
      setAddAdminProcessing(false)
    }
  }

  const handleRemoveAdmin = async (sid: string) => {
    const ok = await showConfirm({
      title: '移除管理员',
      message: '确认移除该用户的管理员/审核员权限？将同时上链移除链上管理员身份。',
      confirmText: '确认移除',
      cancelText: '取消',
      danger: true
    })
    if (!ok) return
    setRemoveAdminProcessing(sid)
    try {
      const res = await adminRemoveAdmin(sid)
      await load()
      showToast({
        type: 'success',
        title: '操作成功',
        description: res.message || (res.txHash ? '已上链并移除管理员' : '已移除管理员'),
        txHash: res.txHash
      })
    } catch (e: any) {
      showToast({ type: 'error', title: '操作失败', description: e.response?.data?.error || e.message })
    } finally {
      setRemoveAdminProcessing(null)
    }
  }

  if (loading) return <p className="admin-loading">加载中...</p>

  return (
    <div className="admin-users">
      <header className="admin-section-header">
        <h1>用户管理</h1>
        <span className="admin-section-sub">校园环保积分</span>
      </header>

      <div className="users-stats">
        <div className="user-stat-card">
          <div className="user-stat-label">总用户数</div>
          <div className="user-stat-value">{totalUsers}</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-label">活跃用户</div>
          <div className="user-stat-value">{activeUsers}</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-label">今日新增</div>
          <div className="user-stat-value">{newToday}</div>
        </div>
        <div className="user-stat-card">
          <div className="user-stat-label">总积分发放</div>
          <div className="user-stat-value">{totalPoints}</div>
          <div className="user-stat-unit">GCT</div>
        </div>
      </div>

      <div className="users-header-row">
        <div>
          <h4 className="admin-subtitle">用户列表</h4>
          <p className="users-subtitle">管理系统用户及权限</p>
        </div>
        <div className="users-toolbar">
          <div className="user-role-tabs">
            <button
              type="button"
              className={roleFilter === 'all' ? 'active' : ''}
              onClick={() => setRoleFilter('all')}
            >
              全部
            </button>
            <button
              type="button"
              className={roleFilter === 'student' ? 'active' : ''}
              onClick={() => setRoleFilter('student')}
            >
              学生
            </button>
            <button
              type="button"
              className={roleFilter === 'admin' ? 'active' : ''}
              onClick={() => setRoleFilter('admin')}
            >
              管理员
            </button>
            <button
              type="button"
              className={roleFilter === 'auditor' ? 'active' : ''}
              onClick={() => setRoleFilter('auditor')}
            >
              审核员
            </button>
          </div>
          <input
            className="users-search"
            placeholder="搜索学号/姓名..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {student?.role === 'admin' && (
            <button
              type="button"
              className="btn btn-primary users-add-btn"
              onClick={() => setShowAddAdminModal(true)}
              disabled={canBeAdminUsers.length === 0}
            >
              + 新增管理员
            </button>
          )}
        </div>
      </div>

      {showAddAdminModal && (
        <div className="admin-modal-overlay" onClick={() => !addAdminProcessing && setShowAddAdminModal(false)}>
          <div className="admin-modal card" onClick={e => e.stopPropagation()}>
            <h4 className="admin-modal-title">新增管理员（上链）</h4>
            <p className="admin-modal-desc">仅已绑定钱包的用户可设为管理员，操作将写入链上合约（RPC 8545）。</p>
            <div className="admin-modal-body">
              <label>选择用户（学号 · 姓名）</label>
              <select
                className="admin-modal-select"
                value={addAdminStudentId}
                onChange={e => setAddAdminStudentId(e.target.value)}
                disabled={addAdminProcessing}
              >
                <option value="">请选择...</option>
                {canBeAdminUsers.map(u => (
                  <option key={u.id} value={u.studentId}>
                    {u.studentId} · {u.name || '未命名'}
                  </option>
                ))}
              </select>
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="btn" onClick={() => !addAdminProcessing && setShowAddAdminModal(false)} disabled={addAdminProcessing}>
                取消
              </button>
              <button type="button" className="btn btn-primary" onClick={handleAddAdmin} disabled={addAdminProcessing || !addAdminStudentId}>
                {addAdminProcessing ? '上链中...' : '确认并上链'}
              </button>
            </div>
          </div>
        </div>
      )}

      <table className="admin-table users-table">
        <thead>
          <tr>
            <th>用户信息</th>
            <th>学院</th>
            <th>积分</th>
            <th>角色</th>
            <th>状态</th>
            {student?.role === 'admin' && <th>操作</th>}
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(u => (
            <tr key={u.id}>
              <td>
                <div className="user-main">
                  <div className="user-avatar">
                    {(u.name || u.studentId || '用')?.slice(0, 1)}
                  </div>
                  <div className="user-main-text">
                    <div className="user-name">{u.name || '未命名'}</div>
                    <div className="user-id">{u.studentId}</div>
                  </div>
                </div>
              </td>
              <td>{u.college || '-'}</td>
              <td>{u.escrowPoints} GCT</td>
              <td>
                <span className={`user-role-pill role-${u.role || 'student'}`}>
                  {roleLabel(u.role)}
                </span>
              </td>
              <td>
                <span className={`user-status-pill status-${u.status}`}>
                  {u.status === 'active' ? '正常' : '禁用'}
                </span>
              </td>
              {student?.role === 'admin' && (
                <td>
                  <div className="users-op-btns">
                    {(u.role === 'admin' || u.role === 'auditor') && (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleRemoveAdmin(u.studentId)}
                        disabled={removeAdminProcessing === u.studentId}
                      >
                        {removeAdminProcessing === u.studentId ? '处理中...' : '移除管理员'}
                      </button>
                    )}
                    {u.status === 'banned' ? (
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => handleStatus(u.studentId, 'active')}
                      >
                        启用
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() => handleStatus(u.studentId, 'banned')}
                      >
                        禁用
                      </button>
                    )}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="admin-logs-card card">
        <div className="admin-logs-header-row">
          <div className="admin-logs-title">
            <div className="admin-logs-icon">
              <RotateCcw size={18} />
            </div>
            <div>
              <div className="admin-logs-title-main">操作日志</div>
              <div className="admin-logs-title-sub">查看管理员操作记录</div>
            </div>
          </div>
          <span className="users-logs-badge">最近 20 条</span>
        </div>
        <table className="admin-table admin-logs-table">
          <thead>
            <tr>
              <th>操作人</th>
              <th>动作</th>
              <th>目标</th>
              <th>详情</th>
              <th>时间</th>
            </tr>
          </thead>
          <tbody>
            {logs.slice(0, 20).map(l => {
              const hash = extractTxHashFromLogDetails(l.details)

              const actionLabel =
                l.action === 'approve_report'
                  ? '审核通过'
                  : l.action === 'reject_report'
                  ? '审核驳回'
                  : l.action === 'add_admin'
                  ? '新增管理员'
                  : l.action === 'remove_admin'
                  ? '移除管理员'
                  : l.action

              return (
                <tr key={l.id}>
                  <td>
                    <div className="logs-operator">
                      <div className="logs-operator-avatar">
                        {(l.studentId || '管')?.slice(0, 1)}
                      </div>
                      <span className="logs-operator-name">{l.studentId}</span>
                    </div>
                  </td>
                  <td>
                    <span className="logs-action-pill">{actionLabel}</span>
                  </td>
                  <td>
                    {l.targetType} #{l.targetId}
                  </td>
                  <td>
                    <div className="logs-detail">
                      {hash &&
                        (blockExplorerUrl ? (
                          <a
                            href={`${blockExplorerUrl}/tx/${hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="logs-detail-hash hash-link"
                          >
                            {hash}
                          </a>
                        ) : (
                          <span className="logs-detail-hash">{hash}</span>
                        ))}
                    </div>
                  </td>
                  <td>{new Date(l.createdAt).toLocaleString('zh-CN')}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <div className="admin-logs-more">查看全部日志</div>
      </section>
    </div>
  )
}

function OnchainManage() {
  const { showToast } = useUi()
  const [form, setForm] = useState({ to: '', amount: '', reason: '' })
  const [sending, setSending] = useState(false)

  const handleAward = async () => {
    if (!form.to || !form.amount) {
      showToast({ type: 'info', title: '请完善信息', description: '请填写接收地址和积分数量。' })
      return
    }
    try {
      setSending(true)
      const amt = Number(form.amount)
      const data = await adminManualAward({ to: form.to, amount: amt, reason: form.reason })
      showToast({
        type: 'success',
        title: '发放成功',
        description: '链上积分已发放。',
        txHash: data.txHash
      })
      setForm({ to: '', amount: '', reason: '' })
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || '链上发放失败'
      showToast({ type: 'error', title: '链上发放失败', description: msg })
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="admin-onchain">
      <header className="admin-section-header">
        <h1>链上管理</h1>
        <span className="admin-section-sub">通过后台管理员钱包在链上直接发放 GCT</span>
      </header>

      <div className="card">
        <h3>手动发放积分（awardPoints，经 RPC 8545）</h3>
        <div className="form-row">
          <label>接收地址</label>
          <input
            className="input"
            value={form.to}
            onChange={e => setForm({ ...form, to: e.target.value })}
            placeholder="0x 开头的钱包地址"
          />
        </div>
        <div className="form-row">
          <label>积分数量（GCT）</label>
          <input
            className="input"
            type="number"
            min={0}
            value={form.amount}
            onChange={e => setForm({ ...form, amount: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label>发放原因（可选）</label>
          <input
            className="input"
            value={form.reason}
            onChange={e => setForm({ ...form, reason: e.target.value })}
            placeholder="例如：线下活动奖励"
          />
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={handleAward}
          disabled={sending}
        >
          {sending ? '链上发放中...' : '调用 awardPoints 发放积分（后台 RPC）'}
        </button>
        <p style={{ marginTop: 8, fontSize: 12, color: '#64748b' }}>
          说明：本操作通过后端托管的管理员私钥，经 RPC 8545 直接在链上调用 awardPoints，前端无需连接或操作 MetaMask。
        </p>
      </div>
    </div>
  )
}

