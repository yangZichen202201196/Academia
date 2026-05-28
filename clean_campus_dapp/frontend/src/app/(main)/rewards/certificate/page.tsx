'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Award, ArrowLeft, Calendar, Tag, Link2, Download, Share2, ExternalLink, Lightbulb, CheckCircle2 } from 'lucide-react'
import { getRedemptionByCode, getRewardsChainConfig } from '../../../../utils/api'
import { useUi } from '../../../../contexts/UiContext'

const FALLBACK_EXPLORER = typeof process !== 'undefined' ? (process.env.NEXT_PUBLIC_BLOCK_EXPLORER_URL || '') : ''

export default function CertificatePage() {
  const { showToast } = useUi()
  const searchParams = useSearchParams()
  const code = searchParams.get('code') || ''
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [explorerUrl, setExplorerUrl] = useState<string>('')

  useEffect(() => {
    if (!code.trim()) {
      setError('请提供凭证码（从「我的兑换」点击「查看证书」进入）')
      setLoading(false)
      return
    }
    getRedemptionByCode(code)
      .then(setData)
      .catch((e: any) => setError(e.response?.data?.error || e.message || '查询失败'))
      .finally(() => setLoading(false))
  }, [code])

  useEffect(() => {
    getRewardsChainConfig()
      .then((c) => {
        const url = (c.blockExplorerUrl || FALLBACK_EXPLORER || '').trim()
        if (url) setExplorerUrl(url.replace(/\/+$/, ''))
      })
      .catch(() => {
        if (FALLBACK_EXPLORER) setExplorerUrl(FALLBACK_EXPLORER.replace(/\/+$/, ''))
      })
  }, [])

  const handleDownload = () => {
    window.print()
  }

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : ''
    const text = `校园环保积分 · ${data?.rewardName || '电子凭证'}，凭证码：${data?.redemptionCode || ''}`
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: '校园环保积分 - 电子凭证',
          text,
          url
        })
        showToast({ type: 'success', title: '分享成功', description: '已通过系统分享面板发送。' })
      } catch (e: any) {
        if (e.name !== 'AbortError') copyAndAlert(url)
      }
    } else {
      copyAndAlert(url)
    }
  }

  const copyAndAlert = (url: string) => {
    if (typeof navigator?.clipboard?.writeText === 'function') {
      navigator.clipboard.writeText(url)
      showToast({ type: 'success', title: '已复制', description: '页面链接已复制到剪贴板。' })
    }
  }

  const handleViewOnChain = () => {
    if (!data?.txHash) return
    if (!explorerUrl) {
      showToast({
        type: 'info',
        title: '未配置浏览器',
        description:
          '请在后端 .env 中配置 BLOCK_EXPLORER_URL，或在前端配置 NEXT_PUBLIC_BLOCK_EXPLORER_URL。'
      })
      return
    }
    window.open(`${explorerUrl}/tx/${data.txHash}`, '_blank')
  }

  if (loading) {
    return (
      <div className="certificate-page">
        <div className="container">
          <p className="certificate-loading">加载中...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="certificate-page">
        <div className="container">
          <div className="certificate-error card">
            <p>{error || '未找到兑换记录'}</p>
            <Link href="/rewards" className="btn btn-primary">
              <ArrowLeft size={16} /> 返回奖励兑换
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const dateStr = data.redeemedAt ? new Date(data.redeemedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''

  return (
    <div className="certificate-page">
      <div className="container">
        <Link href="/rewards" className="certificate-back">
          <ArrowLeft size={18} /> 返回奖励兑换
        </Link>

        <div className="certificate-card card" id="certificate-print-area">
          <div className="certificate-inner">
            <div className="certificate-header">
              <div className="certificate-header-icons">
                <Award size={36} className="certificate-icon" />
                <span className="certificate-leaf" aria-hidden>🌿</span>
              </div>
              <h1 className="certificate-title">校园环保积分</h1>
              <p className="certificate-subtitle">电子凭证</p>
            </div>
            <div className="certificate-body">
              <h2 className="certificate-reward-name">{data.rewardName}</h2>
              {data.description && <p className="certificate-desc">{data.description}</p>}
              <p className="certificate-date">
                <Calendar size={16} className="certificate-date-icon" />
                兑换时间：{dateStr}
              </p>
              <div className="certificate-divider" />
              <div className="certificate-codes">
                <div className="certificate-code-row">
                  <span className="certificate-code-label">
                    <Tag size={14} /> 凭证码
                  </span>
                  <code className="certificate-code-value certificate-code-main">{data.redemptionCode}</code>
                </div>
                {data.txHash && (
                  <div className="certificate-code-row">
                    <span className="certificate-code-label">
                      <Link2 size={14} /> 链上交易哈希 <span className="certificate-code-sublabel">区块链唯一标识</span>
                    </span>
                    <code className="certificate-code-value certificate-tx certificate-tx-box">{data.txHash}</code>
                  </div>
                )}
              </div>
              {data.txHash && (
                <div className="certificate-badges">
                  <span className="certificate-badge"><CheckCircle2 size={14} /> 区块链已存证</span>
                  <span className="certificate-badge"><CheckCircle2 size={14} /> 不可篡改</span>
                  <span className="certificate-badge"><CheckCircle2 size={14} /> 可验证</span>
                </div>
              )}
              <p className="certificate-tip">本凭证可在区块链上核验，请妥善保存凭证码与交易哈希。</p>
              <div className="certificate-actions no-print">
                <button type="button" className="btn btn-primary certificate-btn-download" onClick={handleDownload}>
                  <Download size={18} /> 下载证书
                </button>
                <button type="button" className="btn btn-outline-cert" onClick={handleShare}>
                  <Share2 size={18} /> 分享
                </button>
                {data.txHash && explorerUrl && (
                  <button type="button" className="btn btn-outline-cert" onClick={handleViewOnChain} title="在区块链浏览器中查看该笔交易">
                    <ExternalLink size={18} /> 链上查看
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="certificate-tips no-print">
          <div className="certificate-tips-inner">
            <Lightbulb size={20} className="certificate-tips-icon" />
            <div>
              <div className="certificate-tips-title">使用提示</div>
              <p className="certificate-tips-text">凭证码用于线下兑换实体奖品，链上哈希可用于验证证书真伪。建议截图保存或下载证书存档。</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
