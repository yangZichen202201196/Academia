'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Gift, Award, Ticket, Copy, ExternalLink, CheckCircle2, Check } from 'lucide-react'
import { useWeb3 } from '../contexts/Web3Context'
import { useUi } from '../contexts/UiContext'
import { getRewards, getUserRewards, redeemRewardOnchain, getRewardsChainConfig, getMyRank, Reward, UserReward } from '../utils/api'

export default function Rewards() {
  const { account, signer, balance, balanceError, refreshBalance } = useWeb3()
  const { showToast } = useUi()
  const [rewards, setRewards] = useState<Reward[]>([])
  const [userRewards, setUserRewards] = useState<UserReward[]>([])
  const [loading, setLoading] = useState(true)
  const [redeeming, setRedeeming] = useState<number | null>(null)
  const [explorerUrl, setExplorerUrl] = useState('')
  const [totalEarned, setTotalEarned] = useState<number | null>(null)
  /** 待确认的兑换（表格式弹窗，与审核中心风格一致） */
  const [redeemReward, setRedeemReward] = useState<Reward | null>(null)

  useEffect(() => {
    loadData()
  }, [account])

  // 现有积分、累计积分以智能合约为准，不在此处主动刷新；仅在连接钱包或兑换成功后更新
  useEffect(() => {
    getRewardsChainConfig()
      .then((c) => {
        const url = (c.blockExplorerUrl || (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BLOCK_EXPLORER_URL) || '').trim()
        if (url) setExplorerUrl(url.replace(/\/+$/, ''))
      })
      .catch(() => {})
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      // 先拉奖品列表和我的兑换（快），尽快结束 loading，再后台拉累计积分（链上较慢）
      const [rewardsData, userRewardsData] = await Promise.all([
        getRewards(),
        account ? getUserRewards(account) : Promise.resolve([])
      ])
      setRewards(rewardsData)
      setUserRewards(userRewardsData)
      setLoading(false)
      if (account) {
        getMyRank(account)
          .then((r) => (r && typeof r.myTotalPoints === 'number' ? setTotalEarned(r.myTotalPoints) : setTotalEarned(null)))
          .catch(() => setTotalEarned(null))
      } else {
        setTotalEarned(null)
      }
    } catch (error) {
      console.error('加载数据失败:', error)
      setLoading(false)
    }
  }

  // 兑换成功后，按“立即 + 延迟重试”自动同步余额与列表，避免链上确认稍慢导致余额未及时刷新
  const syncAfterRedeemSuccess = async () => {
    await refreshBalance()
    await loadData()

    // 链上确认/索引偶发延迟，做两次补偿刷新
    await new Promise(r => setTimeout(r, 1500))
    await refreshBalance()
    await loadData()

    await new Promise(r => setTimeout(r, 3000))
    await refreshBalance()
    await loadData()
  }

  const numericBalance = Number.parseFloat(balance || '0') || 0
  const totalSpent = userRewards.reduce(
    (sum, r) => sum + (r.reward?.pointsRequired ?? 0),
    0
  )
  // 当前余额：前端读合约 balanceOf（链上）。
  // 支出总计：后端库 user_rewards 按钱包汇总（与链上 burn 应对应）。
  // 累计获得：优先链上 userTotalPoints（getMyRank → getTotalPoints）；与「余额+支出」取较大值，
  // 避免链上为 0 时 ?? 无法回退（0 不是 null）导致与库内兑换记录矛盾。
  const impliedEarnedMin = numericBalance + totalSpent
  const totalIncome = Math.max(totalEarned ?? 0, impliedEarnedMin)

  /** 打开兑换确认弹窗（表格展示待签名内容） */
  const handleRedeem = (reward: Reward) => {
    if (!account || !signer) {
      showToast({ type: 'info', title: '请先连接钱包', description: '连接钱包并授权后方可签名兑换。' })
      return
    }
    if (reward.id == null || Number(reward.id) === 0) {
      showToast({ type: 'error', title: '无法兑换', description: '无效的奖品 ID。' })
      return
    }
    if (numericBalance < reward.pointsRequired) {
      showToast({ type: 'info', title: '积分不足', description: '当前链上余额不足以兑换该奖品。' })
      return
    }
    setRedeemReward(reward)
  }

  /** 用户确认后发起钱包签名并兑换 */
  const executeRedeem = async () => {
    if (!redeemReward || !account || !signer) return
    const reward = redeemReward
    setRedeeming(reward.id)
    try {
      const signedAt = Date.now()
      const message =
        `Redeem reward onchain\n` +
        `wallet:${account.toLowerCase()}\n` +
        `rewardId:${reward.id}\n` +
        `signedAt:${signedAt}`
      const signature = await signer.signMessage(message)

      const data = await redeemRewardOnchain(reward.id, account, signature, signedAt)
      if (!data.success) {
        showToast({ type: 'error', title: '兑换失败', description: data.error || '请稍后重试' })
        return
      }
      const isCert = data.reward?.type === 'certificate'
      const codeLabel = isCert ? '凭证码' : '取货码'
      const code = data.redemptionCode || ''
      const desc =
        `积分已扣减。${codeLabel}：${code || '—'}（取货或核验时请出示）` +
        (isCert
          ? '\n\n可到下方「我的兑换」中点击「查看证书」。'
          : '\n\n请凭取货码到指定地点领取实物。')
      showToast({
        type: 'success',
        title: '兑换成功',
        description: desc,
        txHash: data.txHash || undefined
      })
      // 兑换成功后自动刷新余额与兑换列表（含延迟补偿重试）
      await syncAfterRedeemSuccess()
    } catch (error: any) {
      const msg = error?.message || error?.reason || ''
      if (error.response?.data?.error) {
        showToast({ type: 'error', title: '兑换失败', description: error.response.data.error })
        return
      }
      if (/insufficient balance/i.test(msg)) {
        refreshBalance()
        showToast({
          type: 'info',
          title: '积分不足',
          description:
            '当前链上余额不足以支付该奖品。请刷新页面查看最新积分，或通过环保行为上报并经审核获得积分后再试。'
        })
        return
      }
      showToast({
        type: 'error',
        title: '兑换失败',
        description: error?.shortMessage || error?.reason || msg || '未知错误'
      })
    } finally {
      setRedeeming(null)
      setRedeemReward(null)
    }
  }

  if (!account) {
    return (
      <div className="rewards-page">
        <div className="container">
          <div className="card">
            <h2>
              <Gift size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              奖励兑换
            </h2>
            <p>连接钱包后可兑换奖励，积分使用 GCT 代币。</p>
            <div className="rewards-preview" style={{ marginTop: '24px', opacity: 0.8 }}>
              <p>奖励列表预览（连接后即可兑换）</p>
              {loading ? <p>加载中...</p> : (
                <div className="rewards-grid" style={{ marginTop: '12px' }}>
                  {rewards.slice(0, 3).map(r => (
                    <div key={r.id} className="reward-card" style={{ pointerEvents: 'none' }}>
                      <div className="reward-icon">
                        {r.type === 'certificate' ? <Award size={32} strokeWidth={1.5} /> : <Gift size={32} strokeWidth={1.5} />}
                      </div>
                      <h3>{r.name}</h3>
                      <p>{r.pointsRequired} GCT</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rewards-page">
      <div className="container">
        <div className="card">
          <div className="rewards-card-header">
            <h2>
              <Gift size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
              奖励兑换
            </h2>
          </div>

          <div className="balance-info">
            <div className="balance-item">
              <div className="balance-label">累计获得</div>
              <div className="balance-amount positive">+{totalIncome.toFixed(0)} GCT</div>
            </div>
            <div className="balance-item balance-item-center">
              <div className="balance-label">当前余额</div>
              <div className="balance-amount">
                <span className="balance-fox">
                  <Gift size={16} />
                </span>
                <strong>{numericBalance.toFixed(2)} GCT</strong>
              </div>
              <div className="balance-meta">链上余额（自动刷新）</div>
            </div>
            <div className="balance-item">
              <div className="balance-label">支出总计</div>
              <div className="balance-amount negative">-{totalSpent.toFixed(0)} GCT</div>
            </div>
          </div>

          {balanceError && (
            <div className="balance-error">
              {balanceError}
              <button type="button" className="btn btn-soft" style={{ marginLeft: 8 }} onClick={() => refreshBalance()}>
                重试
              </button>
            </div>
          )}

          {loading ? (
            <p>加载中...</p>
          ) : (
            <div className="rewards-grid">
              {rewards.map(reward => {
                const canRedeem =
                  !balanceError &&
                  numericBalance >= reward.pointsRequired &&
                  reward.stock > 0
                return (
                  <div key={reward.id} className="reward-card">
                    <div className="reward-icon">
                      {reward.type === 'certificate' ? <Award size={32} strokeWidth={1.5} /> : <Gift size={32} strokeWidth={1.5} />}
                    </div>
                    <h3>{reward.name}</h3>
                    <p className="reward-description">{reward.description}</p>
                    <div className="reward-footer">
                      <div className="reward-points">{reward.pointsRequired} GCT</div>
                      <div className="reward-stock">库存: {reward.stock}</div>
                    </div>
                    <div className="reward-actions">
                      <button
                        className={`btn ${canRedeem ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => handleRedeem(reward)}
                        disabled={!canRedeem || redeeming === reward.id}
                        title={!canRedeem && numericBalance < reward.pointsRequired ? '积分不足' : undefined}
                        style={!canRedeem ? { opacity: 0.75, cursor: 'not-allowed' } : undefined}
                      >
                        {redeeming === reward.id ? '兑换中...' : '兑换'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {userRewards.length > 0 && (
            <div className="my-redemptions">
              <h3 className="my-redemptions-title">
                <Ticket size={20} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                我的兑换
              </h3>
              <p className="my-redemptions-desc">取货码用于实物领取，凭证码可用于查看电子证书。</p>
              <div className="my-redemptions-table-wrap">
                <table className="my-redemptions-table">
                  <thead>
                    <tr>
                      <th>奖品</th>
                      <th>取货码/凭证码</th>
                      <th>领取地址/说明</th>
                      <th>交易哈希</th>
                      <th>兑换时间</th>
                      <th>操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userRewards.map(ur => (
                      <tr key={ur.id}>
                        <td>{ur.reward?.name ?? '—'}</td>
                        <td>
                          <code className="redemption-code">{ur.redemptionCode || '—'}</code>
                          {ur.redemptionCode && (
                            <button
                              type="button"
                              className="btn-copy-inline"
                              onClick={() => {
                                navigator.clipboard?.writeText(ur.redemptionCode || '')
                                showToast({ type: 'success', title: '已复制', description: '取货码/凭证码已复制到剪贴板。' })
                              }}
                              title="复制"
                            >
                              <Copy size={14} />
                            </button>
                          )}
                        </td>
                        <td className="pickup-address-cell">
                          {ur.reward?.type === 'certificate'
                            ? (ur.reward?.pickupAddress?.trim() || '在线查看电子证书，本页点击「查看证书」即可查看')
                            : (ur.reward?.pickupAddress?.trim() || '凭取货码到指定地点领取')}
                        </td>
                        <td>
                          {ur.txHash ? (
                            explorerUrl ? (
                              <a
                                href={`${explorerUrl}/tx/${ur.txHash}`}
                                target="_blank"
                                rel="noreferrer"
                                className="tx-hash hash-link"
                                title="链上查看"
                              >
                                {ur.txHash.slice(0, 10)}…{ur.txHash.slice(-8)}
                              </a>
                            ) : (
                              <code className="tx-hash">{ur.txHash.slice(0, 10)}…{ur.txHash.slice(-8)}</code>
                            )
                          ) : (
                            <span>—</span>
                          )}
                        </td>
                        <td>{ur.redeemedAt ? new Date(ur.redeemedAt).toLocaleString('zh-CN') : '—'}</td>
                        <td>
                          {ur.reward?.type === 'certificate' && ur.redemptionCode ? (
                            <Link href={`/rewards/certificate?code=${encodeURIComponent(ur.redemptionCode)}`} className="btn-link-cert">
                              <ExternalLink size={14} /> 查看证书
                            </Link>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

      </div>

      {redeemReward && account && (
        <div
          className="audit-confirm-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="redeem-confirm-title"
          onClick={() => {
            if (redeeming !== null) return
            setRedeemReward(null)
          }}
        >
          <div className="audit-confirm-card redeem-confirm-card" onClick={e => e.stopPropagation()}>
            <div className="audit-confirm-head">
              <div className="audit-confirm-head-icon" aria-hidden>
                <CheckCircle2 size={22} strokeWidth={2} />
              </div>
              <div>
                <div id="redeem-confirm-title" className="audit-confirm-title">确认兑换</div>
                <div className="audit-confirm-sub">校园环保积分系统</div>
              </div>
            </div>

            <p className="audit-confirm-question">确认使用积分兑换以下奖品？</p>
            <p className="audit-confirm-summary">
              将消耗{' '}
              <span className="audit-confirm-highlight">{redeemReward.pointsRequired} GCT</span>
              {' '}兑换{' '}
              <span className="audit-confirm-highlight">「{redeemReward.name}」</span>
            </p>

            <div className="audit-confirm-detail">
              <div className="audit-confirm-row">
                <span className="audit-confirm-label">签名钱包</span>
                <span
                  className="audit-confirm-value"
                  title={account}
                >
                  {account.slice(0, 6)}…{account.slice(-4)}
                </span>
              </div>
              <div className="audit-confirm-row">
                <span className="audit-confirm-label">奖品名称</span>
                <span className="audit-confirm-value">{redeemReward.name}</span>
              </div>
              <div className="audit-confirm-row">
                <span className="audit-confirm-label">奖品编号</span>
                <span className="audit-confirm-value">{redeemReward.id}</span>
              </div>
              <div className="audit-confirm-row">
                <span className="audit-confirm-label">消耗积分</span>
                <span className="audit-confirm-value">{redeemReward.pointsRequired} GCT</span>
              </div>
              <div className="audit-confirm-row audit-confirm-row--last redeem-sign-msg-row">
                <span className="audit-confirm-label">待签名消息</span>
                <pre className="redeem-sign-msg-preview">{`Redeem reward onchain
wallet:${account.toLowerCase()}
rewardId:${redeemReward.id}
signedAt:（点击「去签名」时自动生成）`}</pre>
              </div>
            </div>
            <p className="redeem-sign-hint">请在钱包中核对上述文本后签名；签名通过后系统将完成链上扣减并发货。</p>

            <div className="audit-confirm-actions">
              <button
                type="button"
                className="btn audit-confirm-cancel"
                onClick={() => setRedeemReward(null)}
                disabled={redeeming !== null}
              >
                取消
              </button>
              <button
                type="button"
                className="btn audit-confirm-submit"
                onClick={() => void executeRedeem()}
                disabled={redeeming === redeemReward.id}
              >
                <Check size={18} strokeWidth={2.5} aria-hidden />
                {redeeming === redeemReward.id ? '处理中...' : '去签名'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

