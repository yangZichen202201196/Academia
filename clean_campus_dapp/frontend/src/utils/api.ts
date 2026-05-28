import axios from 'axios'

/** 开发时用；手机通过局域网 IP 打开时，API 用同一 IP + 端口 3001，否则请求会发到手机本机 */
function getApiBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return `${window.location.protocol}//${window.location.hostname}:3001/api`
  }
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api'
}

export interface ReportData {
  behaviorType: string
  imageUrl: string
  description?: string
  name?: string
  walletAddress?: string
  studentId?: string
  aiConfidence?: number
  aiBehaviorType?: string
  aiSuggestedPoints?: number
}

export interface Report {
  id: number
  walletAddress: string | null
  studentId?: string | null
  behaviorType: string
  imageUrl: string
  description?: string
  status: 'pending' | 'approved' | 'rejected'
  points?: number
  aiConfidence?: number | null
  aiBehaviorType?: string | null
  aiSuggestedPoints?: number | null
  rejectReason?: string | null
  reviewedAt?: string | null
  reviewedBy?: string | null
  txHash?: string | null
  createdAt: string
  name?: string
}

export interface LeaderboardUser {
  walletAddress: string | null
  totalPoints: number   // 累计积分（排名依据）
  currentPoints?: number  // 现有积分（钱包余额）
  name?: string
}

export interface Reward {
  id: number
  name: string
  description: string
  pointsRequired: number
  type: 'code' | 'certificate'
  stock: number
  imageUrl?: string
  pickupAddress?: string | null
}

export interface UserReward {
  id: number
  rewardId: number
  walletAddress: string
  redeemedAt: string
  txHash?: string
  redemptionCode?: string
  reward: Reward
}

// 上传图片到IPFS
export const uploadImage = async (file: File): Promise<string> => {
  const formData = new FormData()
  formData.append('file', file)
  
  const response = await axios.post(`${getApiBaseUrl()}/upload`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  })
  console.log(response.data.ipfsHash)
  return response.data.ipfsHash
}

// 提交环保行为报告
export const submitReport = async (data: ReportData): Promise<Report> => {
  const response = await axios.post(`${getApiBaseUrl()}/reports`, data)
  return response.data
}

/** 获取行为类型与积分（与规则配置一致，供行为上报表单使用） */
export const getReportBehaviorTypes = async (): Promise<{ behaviorType: string; points: number }[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/reports/behavior-types`)
  return response.data
}

// 获取用户的报告列表（按钱包地址）
export const getUserReports = async (walletAddress: string): Promise<Report[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/reports/user/${walletAddress}`)
  return response.data
}

// 获取当前学生的报告列表（按学号）
export const getMyStudentReports = async (): Promise<Report[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/reports/student/me`)
  return response.data
}

// 校园动态：最近报告（全部用户，供首页展示）
export const getRecentReports = async (limit = 10): Promise<Report[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/reports/recent?limit=${limit}`)
  return response.data
}

// 获取排行榜
export const getLeaderboard = async (): Promise<LeaderboardUser[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/leaderboard`)
  return response.data
}

// 获取当前用户排名（支持学号登录或传 walletAddress）；排名按累计积分
export const getMyRank = async (walletAddress?: string): Promise<{
  myRank: number | null
  totalUsers: number
  percentSurpassed: number
  myPoints: number       // 现有积分（钱包 GCT 余额）
  myTotalPoints: number  // 累计积分（历史获得总量，排名用）
}> => {
  const url = walletAddress
    ? `${getApiBaseUrl()}/leaderboard/my-rank?walletAddress=${encodeURIComponent(walletAddress)}`
    : `${getApiBaseUrl()}/leaderboard/my-rank`
  const response = await axios.get(url)
  return response.data
}

// 获取奖励列表
export const getRewards = async (): Promise<Reward[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/rewards`)
  return response.data
}

/** 可选：获取链 ID、合约地址、区块链浏览器、链名称（用于前端连接钱包与链上查看） */
export const getRewardsChainConfig = async (): Promise<{
  ok: boolean
  chainId?: number
  contractAddress?: string
  blockExplorerUrl?: string
  chainName?: string
  error?: string
}> => {
  const response = await axios.get(`${getApiBaseUrl()}/rewards/chain-config`)
  return response.data
}

/** 开发环境：获取手机端访问地址（后端返回本机局域网 IP） */
export const getDevInfo = async (): Promise<{ mobileUrl: string | null; lanIp: string | null; frontendPort?: number } | null> => {
  try {
    const base = (getApiBaseUrl() || '').replace(/\/api\/?$/, '') || 'http://localhost:3001'
    const response = await axios.get(`${base}/api/dev-info`, { timeout: 3000 })
    return response.data
  } catch {
    return null
  }
}

// 兑换奖励
export const redeemReward = async (rewardId: number, walletAddress: string): Promise<UserReward> => {
  const response = await axios.post(`${getApiBaseUrl()}/rewards/redeem`, {
    rewardId,
    walletAddress
  })
  return response.data
}

/** 兑换奖励：用户已在链上完成 redeemForReward，后端凭 txHash 记库（推荐，无需 approve） */
export const redeemRewardWithTx = async (
  rewardId: number,
  walletAddress: string,
  txHash: string
): Promise<{ success: boolean; txHash: string; reward?: unknown; error?: string }> => {
  const response = await axios.post(`${getApiBaseUrl()}/rewards/redeem-with-tx`, {
    rewardId,
    walletAddress,
    txHash
  })
  return response.data
}

/** 兑换奖励（后端托管管理员私钥，直接在链上调用 adminRedeem 扣减并销毁用户积分） */
export const redeemRewardOnchain = async (
  rewardId: number,
  walletAddress: string,
  signature: string,
  signedAt: number
): Promise<{
  success: boolean
  txHash?: string
  redemptionCode?: string
  reward?: { id: number; name: string; description: string; pointsRequired: number; type: string }
  error?: string
}> => {
  const response = await axios.post(`${getApiBaseUrl()}/rewards/redeem-onchain`, {
    rewardId,
    walletAddress,
    signature,
    signedAt
  })
  return response.data
}

// 获取用户的兑换记录
export const getUserRewards = async (walletAddress: string): Promise<UserReward[]> => {
  const response = await axios.get(`${getApiBaseUrl()}/rewards/user/${walletAddress}`)
  return response.data
}

// 凭取货码/凭证码查询兑换记录（用于电子证书查看、取货核销）
export const getRedemptionByCode = async (code: string) => {
  const response = await axios.get(`${getApiBaseUrl()}/rewards/redemption-by-code/${encodeURIComponent(code.trim())}`)
  return response.data as {
    id: number
    rewardId: number
    rewardName: string
    description: string
    pointsRequired: number
    type: string
    redeemedAt: string
    txHash?: string
    redemptionCode?: string
  }
}

// 学号注册
export const registerStudent = async (params: {
  studentId: string
  initialPassword: string
  password: string
  name?: string
  college?: string
}) => {
  const response = await axios.post(`${getApiBaseUrl()}/auth/register`, params)
  return response.data as {
    token: string
    studentId: string
    name?: string
    college?: string
    escrowPoints: number
    hasWalletBound: boolean
  }
}

// 获取当前用户信息（刷新 role 等）
export const getAuthMe = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/auth/me`)
  return response.data as {
    studentId: string
    name?: string
    college?: string
    walletAddress?: string | null
    escrowPoints: number
    hasWalletBound?: boolean
    role?: 'student' | 'admin' | 'auditor'
  }
}

// 学号登录
export const loginStudent = async (params: {
  studentId: string
  password: string
}) => {
  const response = await axios.post(`${getApiBaseUrl()}/auth/login`, params)
  return response.data as {
    token: string
    studentId: string
    name?: string
    college?: string
    walletAddress?: string | null
    escrowPoints: number
    hasWalletBound?: boolean
    role?: 'student' | 'admin' | 'auditor'
  }
}

// 钱包登录：若钱包已绑定学号，则直接获得学号登录态
export const loginWithWallet = async (walletAddress: string) => {
  const response = await axios.post(`${getApiBaseUrl()}/auth/login-wallet`, { walletAddress })
  return response.data as {
    token: string
    studentId: string
    name?: string
    college?: string
    walletAddress?: string | null
    escrowPoints: number
    hasWalletBound?: boolean
    role?: 'student' | 'admin' | 'auditor'
  }
}

// 绑定钱包
export const bindWallet = async (params: {
  walletAddress: string
  signature: string
}) => {
  const response = await axios.post(`${getApiBaseUrl()}/wallet/bind`, params)
  return response.data as {
    studentId: string
    walletAddress: string
    escrowPoints: number
    canClaim: boolean
  }
}

// 获取当前学生钱包与链下积分信息
export const getWalletMe = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/wallet/me`)
  return response.data as {
    studentId: string
    walletAddress: string | null
    escrowPoints: number
    canClaim: boolean
  }
}

// 解绑当前学号绑定的钱包
export const unbindWallet = async () => {
  const response = await axios.post(`${getApiBaseUrl()}/wallet/unbind`)
  return response.data as {
    studentId: string
    walletAddress: string | null
    message?: string
  }
}

// 认领链下积分到链上
export const claimEscrowPoints = async (params?: {
  amount?: number
  signature: string
  signedAt: number
}) => {
  const payload = params
    ? {
        ...(params.amount !== undefined ? { amount: params.amount } : {}),
        signature: params.signature,
        signedAt: params.signedAt
      }
    : {}
  const response = await axios.post(`${getApiBaseUrl()}/wallet/claim-escrow`, payload)
  return response.data as {
    success: boolean
    txHash?: string
    claimedPoints: number
    newEscrowPoints: number
  }
}

// ========== 管理员 API ==========

export const getPendingReports = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/reports/pending`)
  return response.data as Report[]
}

export const adminGetAuditStats = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/admin/audit-stats`)
  return response.data as { pendingToday: number; approvedCount: number; rejectedCount: number }
}

/** 检查某地址是否为合约管理员（审核发放必须使用该钱包） */
export const checkAuditorWallet = async (address: string) => {
  const response = await axios.get(
    `${getApiBaseUrl()}/admin/check-auditor-wallet?address=${encodeURIComponent(address)}`
  )
  return response.data as { isAdmin: boolean }
}

/** 链上合约是否就绪（用于审核页提示） */
export const getContractStatus = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/admin/contract-status`)
  return response.data as { ok: boolean; totalSupply?: string; error?: string }
}

/** 审核通过并由后端代发链上积分（不经过 MetaMask，避免 RPC/signal aborted） */
export const adminApproveReportWithChain = async (reportId: number, points: number) => {
  const response = await axios.post(
    `${getApiBaseUrl()}/admin/reports/${reportId}/approve-with-chain`,
    { points }
  )
  return response.data as { success: boolean; txHash: string; message: string }
}

/** 批量审核通过并由后端代发链上积分 */
export const adminApproveBatchWithChain = async (
  items: { reportId: number; points: number }[]
) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/reports/approve-batch-with-chain`, {
    items
  })
  return response.data as { success: boolean; message: string; count: number; items?: { reportId: number; points: number; txHash: string }[] }
}

/** 手动链上发放积分（测试）：后台托管管理员私钥直接调用 awardPoints */
export const adminManualAward = async (params: { to: string; amount: number; reason?: string }) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/manual-award`, params)
  return response.data as { success: boolean; txHash: string }
}

export const adminApproveReport = async (
  reportId: number,
  points: number,
  walletAddress: string,
  auditorWalletAddress: string,
  txHash: string
) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/approve`, {
    reportId,
    points,
    walletAddress,
    auditorWalletAddress,
    txHash
  })
  return response.data as { success: boolean; message: string; txHash?: string; chainSuccess?: boolean }
}

export const adminApproveBatch = async (
  items: { reportId: number; points: number; walletAddress: string; txHash: string }[],
  auditorWalletAddress: string
) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/approve-batch`, {
    items,
    auditorWalletAddress
  })
  return response.data as { success: boolean; message: string; count: number }
}

export const adminRejectReport = async (reportId: number, reason?: string) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/reject`, { reportId, reason })
  return response.data as { success: boolean; message: string }
}

export const adminGetRewards = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/admin/rewards`)
  return response.data as (Reward & { status?: string })[]
}

export const adminCreateReward = async (data: {
  name: string
  description: string
  pointsRequired: number
  type: string
  stock?: number
  imageUrl?: string
  pickupAddress?: string
}) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/rewards`, data)
  return response.data as { id: number; success: boolean }
}

export const adminUpdateReward = async (
  id: number,
  data: Partial<{ name: string; description: string; pointsRequired: number; type: string; stock: number; status: string; imageUrl: string; pickupAddress: string }>
) => {
  const response = await axios.put(`${getApiBaseUrl()}/admin/rewards/${id}`, data)
  return response.data as { success: boolean }
}

export const adminGetRedemptions = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/admin/rewards/redemptions`)
  return response.data as { id: number; rewardId: number; rewardName: string; pointsRequired: number; walletAddress: string; redeemedAt: string }[]
}

export const adminGetRules = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/admin/rules`)
  return response.data as { id: number; behaviorType: string; points: number; dailyLimit: number; validDays: number }[]
}

export const adminUpdateRules = async (
  rules: { behaviorType: string; points?: number; dailyLimit?: number; validDays?: number }[]
) => {
  const response = await axios.put(`${getApiBaseUrl()}/admin/rules`, { rules })
  return response.data as { success: boolean }
}

export const adminGetUsers = async () => {
  const response = await axios.get(`${getApiBaseUrl()}/admin/users`)
  return response.data as { id: number; studentId: string; name: string; college: string; escrowPoints: number; role: string; status: string; createdAt: string; walletAddress?: string | null }[]
}

export const adminSetUserStatus = async (studentId: string, status: 'active' | 'banned') => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/users/${studentId}/status`, { status })
  return response.data as { success: boolean }
}

/** 新增管理员（上链 + 后台角色） */
export const adminAddAdmin = async (studentId: string) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/users/add-admin`, { studentId })
  return response.data as { success: boolean; txHash?: string; message?: string }
}

/** 移除管理员（上链 + 后台角色） */
export const adminRemoveAdmin = async (studentId: string) => {
  const response = await axios.post(`${getApiBaseUrl()}/admin/users/remove-admin`, { studentId })
  return response.data as { success: boolean; txHash?: string; message?: string }
}

export const adminGetOperationLogs = async (limit?: number) => {
  const url = limit ? `${getApiBaseUrl()}/admin/operation-logs?limit=${limit}` : `${getApiBaseUrl()}/admin/operation-logs`
  const response = await axios.get(url)
  return response.data as { id: number; studentId: string; action: string; targetType: string; targetId: number; details: string; createdAt: string }[]
}








