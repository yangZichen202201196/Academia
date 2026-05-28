'use client'

import { useState, useEffect, useRef } from 'react'
import { ethers } from 'ethers'
import { Wallet, Camera, ChevronDown } from 'lucide-react'
import { useWeb3 } from '../contexts/Web3Context'
import { useAuth } from '../contexts/AuthContext'
import { useUi } from '../contexts/UiContext'
import {
  submitReport,
  uploadImage,
  bindWallet,
  getReportBehaviorTypes,
} from '../utils/api'

/** 模拟 AI 预审（实际可替换为 TensorFlow.js 图像识别） */
async function mockAiPredict(
  _imageFile: File,
  behaviorType: string,
  types: { value: string; points: number }[]
): Promise<{ confidence: number; behaviorType: string; suggestedPoints: number }> {
  await new Promise(r => setTimeout(r, 100))
  const type = types.find(t => t.value === behaviorType) || types[0]
  const confidence = 0.4 + Math.random() * 0.5
  return {
    confidence,
    behaviorType: type?.value ?? behaviorType,
    suggestedPoints: type?.points ?? 5
  }
}

const FALLBACK_BEHAVIOR_TYPES = [
  { value: '垃圾分类投放', label: '垃圾分类投放', points: 10 },
  { value: '步行上学', label: '步行上学', points: 5 },
  { value: '其他环保行为', label: '其他环保行为', points: 5 }
]

export default function Report() {
  const { account, signer } = useWeb3()
  const { student, refreshStudent } = useAuth()
  const { showToast, showConfirm } = useUi()
  const [selectedType, setSelectedType] = useState('')
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [reportName, setReportName] = useState('')
  const [loading, setLoading] = useState(false)
  const [behaviorTypes, setBehaviorTypes] = useState<{ value: string; label: string; points: number }[]>(FALLBACK_BEHAVIOR_TYPES)
  const [behaviorDropdownOpen, setBehaviorDropdownOpen] = useState(false)
  const behaviorDropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (behaviorDropdownRef.current && !behaviorDropdownRef.current.contains(e.target as Node)) {
        setBehaviorDropdownOpen(false)
      }
    }
    if (behaviorDropdownOpen) {
      document.addEventListener('mousedown', onOutside)
      return () => document.removeEventListener('mousedown', onOutside)
    }
  }, [behaviorDropdownOpen])

  useEffect(() => {
    getReportBehaviorTypes()
      .then((list) => {
        if (Array.isArray(list) && list.length > 0) {
          setBehaviorTypes(list.map((r) => ({
            value: r.behaviorType,
            label: r.behaviorType,
            points: r.points
          })))
        }
      })
      .catch(() => {})
  }, [])

  // 已登录用户自动填入姓名
  useEffect(() => {
    if (student?.name) setReportName(student.name)
  }, [student?.name])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedType || !imageFile) {
      showToast({ type: 'info', title: '请完善信息', description: '请选择行为类型并上传图片。' })
      return
    }

    if (!account) {
      showToast({ type: 'info', title: '请先连接钱包', description: '连接钱包后再提交环保行为上报。' })
      return
    }

    // 提交前先同步一次最新学号信息（避免绑定/解绑后本地 state 还没更新，导致后端判定“不一致”）
    try {
      await refreshStudent()
    } catch {
      // ignore: 若 token 失效，下面会被 student 判空拦住
    }

    // 必须先有学号登录，防止“仅钱包”匿名上报导致学号缺失
    if (!student?.studentId) {
      showToast({ type: 'info', title: '请先学号登录', description: '请使用学号登录后再进行环保行为上报。' })
      return
    }

    // 检查当前学号与积分钱包的一一对应关系
    if (student.walletAddress) {
      // 已绑定积分地址时，要求当前连接的钱包与绑定地址一致
      if (student.walletAddress.toLowerCase() !== account.toLowerCase()) {
        showToast({
          type: 'error',
          title: '钱包不一致',
          description: '当前连接的钱包与该学号绑定的积分钱包不一致，请切换钱包或在首页重新绑定后再上报。'
        })
        return
      }
    } else if (signer) {
      // 积分地址为空时，询问是否将当前钱包绑定为积分地址，提供“暂不绑定”选项
      const ok = await showConfirm({
        title: '绑定积分钱包',
        message:
          `学号 ${student.studentId} 尚未绑定积分钱包。\n\n` +
          `是否将当前钱包地址 ${account.slice(0, 6)}...${account.slice(-4)} 绑定为该学号的积分地址？\n\n` +
          '确认后将完成绑定并继续上报；取消则仅本次使用该钱包上报，不修改绑定。',
        confirmText: '绑定并继续',
        cancelText: '暂不绑定，继续上报'
      })
      if (ok) {
        try {
          const message = `Bind wallet for studentId:${student.studentId}`
          // 直接获取当前钱包最新 signer，避免首次连接时 context signer 尚未更新导致验签失败
          if (!window.ethereum) {
            showToast({ type: 'error', title: '未检测到钱包', description: '请先安装并启用 MetaMask。' })
            return
          }
          const liveProvider = new ethers.BrowserProvider(window.ethereum)
          const liveSigner = await liveProvider.getSigner()
          const signature = await liveSigner.signMessage(message)
          await bindWallet({ walletAddress: account, signature })
          await refreshStudent()
          showToast({ type: 'success', title: '绑定成功', description: '已将当前钱包设为该学号的积分地址。' })
        } catch (bindErr: any) {
          console.error('绑定积分钱包失败:', bindErr)
          showToast({
            type: 'error',
            title: '绑定失败',
            description: bindErr?.response?.data?.error || bindErr?.message || '请稍后重试'
          })
          return
        }
      }
    }

    setLoading(true)
    try {
      const [imageUrl, aiResult] = await Promise.all([
        uploadImage(imageFile),
        mockAiPredict(imageFile, selectedType, behaviorTypes)
      ])

      const res = await submitReport({
        behaviorType: selectedType,
        imageUrl,
        description,
        name: reportName || undefined,
        studentId: student?.studentId,
        walletAddress: account || undefined,
        aiConfidence: aiResult.confidence,
        aiBehaviorType: aiResult.behaviorType,
        aiSuggestedPoints: aiResult.suggestedPoints
      })

      if (res.status === 'rejected') {
        showToast({
          type: 'info',
          title: 'AI 初审未通过',
          description: '置信度较低，请重新上传更清晰的环保行为照片。'
        })
      } else {
        showToast({ type: 'success', title: '提交成功', description: '报告已提交，请等待管理员审核。' })
      }

      setSelectedType('')
      setDescription('')
      setImageFile(null)
      setImagePreview('')
      setReportName('')
    } catch (error: any) {
      console.error('提交失败:', error)
      showToast({
        type: 'error',
        title: '提交失败',
        description: error.response?.data?.error || error.response?.data?.message || error.message || '请稍后重试'
      })
    } finally {
      setLoading(false)
    }
  }

  // 行为上报必须连接钱包；学号可选用于关联
  const canReport = !!account
  const walletMismatch =
    !!account &&
    !!student?.walletAddress &&
    student.walletAddress.toLowerCase() !== account.toLowerCase()

  return (
    <div className="report-page">
      <div className="container">
        <div className="card">
          <h2>环保行为上报</h2>
          {canReport ? (
            <>
              <p className="report-user-info">
                <Wallet size={18} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                已连接钱包: {account?.slice(0, 6)}...{account?.slice(-4)}
              </p>
              {walletMismatch && (
                <p className="report-warning" style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>
                  当前钱包与学号绑定地址不一致，请确认后再上报。
                </p>
              )}
              {!walletMismatch && student?.walletAddress && account?.toLowerCase() === student.walletAddress.toLowerCase() && (
                <p className="report-wallet-ok" style={{ fontSize: 13, color: '#059669', marginTop: 4 }}>
                  钱包地址已与学号绑定，可正常上报。
                </p>
              )}
            </>
          ) : (
            <div className="report-login-prompt">
              <p>请先连接钱包，再进行行为上报。</p>
            </div>
          )}
          <form onSubmit={handleSubmit} style={canReport ? {} : { display: 'none' }}>
            <div className="form-group">
              <label className="label">姓名（可选）</label>
              <input
                type="text"
                className="input"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="输入您的姓名"
              />
            </div>

            <div className={`form-group form-group-select ${behaviorDropdownOpen ? 'form-group-select-open' : ''}`} ref={behaviorDropdownRef}>
              <label className="label">行为类型 *</label>
              <div
                className="report-select-trigger input"
                onClick={() => setBehaviorDropdownOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') e.preventDefault()
                  if (e.key === 'Escape') setBehaviorDropdownOpen(false)
                }}
                role="combobox"
                aria-expanded={behaviorDropdownOpen}
                aria-haspopup="listbox"
                aria-label="行为类型"
                tabIndex={0}
              >
                <span className={selectedType ? '' : 'report-select-placeholder'}>
                  {selectedType
                    ? `${behaviorTypes.find((t) => t.value === selectedType)?.label ?? selectedType} (可获得${behaviorTypes.find((t) => t.value === selectedType)?.points ?? 0} 积分)`
                    : '请选择行为类型'}
                </span>
                <ChevronDown size={18} className="report-select-chevron" aria-hidden />
              </div>
              <input type="hidden" name="behaviorType" value={selectedType} required={true} />
              {behaviorDropdownOpen && (
                <ul
                  className="report-select-dropdown"
                  role="listbox"
                  aria-label="行为类型选项"
                >
                  {behaviorTypes.map((type) => (
                    <li
                      key={type.value}
                      role="option"
                      aria-selected={selectedType === type.value}
                      className={`report-select-option ${selectedType === type.value ? 'selected' : ''}`}
                      onClick={() => {
                        setSelectedType(type.value)
                        setBehaviorDropdownOpen(false)
                      }}
                    >
                      {type.label} (可获得{type.points} 积分)
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="form-group">
              <label className="label">描述（可选）</label>
              <textarea
                className="input"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述您的环保行为..."
              />
            </div>

            <div className="form-group">
              <label className="label">上传照片 *</label>
              <div className="file-upload">
                <label className="file-upload-trigger">
                  <span className="file-upload-icon">
                    <Camera size={20} />
                  </span>
                  <span className="file-upload-text">
                    {imageFile ? imageFile.name : '点击选择图片，或拖拽到此处'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    required
                  />
                </label>
              </div>
              {imagePreview && (
                <div className="image-preview">
                  <img src={imagePreview} alt="预览" />
                </div>
              )}
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
            >
              {loading ? '提交中...' : '提交报告'}
            </button>
          </form>
          {!canReport && (
            <p className="report-hint">连接钱包后即可上报环保行为并获取积分。</p>
          )}
        </div>
      </div>
    </div>
  )
}

