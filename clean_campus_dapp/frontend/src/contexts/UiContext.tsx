'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode
} from 'react'
import { CheckCircle2, AlertCircle, Info, X, Check } from 'lucide-react'
import { getRewardsChainConfig } from '../utils/api'

export type ToastType = 'success' | 'error' | 'info'

export type ToastPayload = {
  type: ToastType
  title: string
  description?: string
  txHash?: string
}

export type ConfirmOptions = {
  title?: string
  /** 主说明，支持换行 */
  message: string
  subtitle?: string
  confirmText?: string
  cancelText?: string
  /** 危险操作（确认按钮为红色） */
  danger?: boolean
}

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void }

type UiContextValue = {
  showToast: (payload: ToastPayload) => void
  dismissToast: () => void
  showConfirm: (opts: ConfirmOptions) => Promise<boolean>
}

const UiContext = createContext<UiContextValue | undefined>(undefined)

export function useUi() {
  const ctx = useContext(UiContext)
  if (!ctx) {
    throw new Error('useUi must be used within UiProvider')
  }
  return ctx
}

/** 可选：在极少数未包裹 Provider 的边界下不抛错（仅开发兜底） */
export function useUiOptional(): UiContextValue | null {
  return useContext(UiContext) ?? null
}

function ToastHost({
  toast,
  onClose,
  blockExplorerUrl
}: {
  toast: ToastPayload
  onClose: () => void
  blockExplorerUrl: string
}) {
  const Icon =
    toast.type === 'success'
      ? CheckCircle2
      : toast.type === 'error'
        ? AlertCircle
        : Info

  return (
    <div className="app-toast-host" role="status" aria-live="polite">
      <div className={`app-toast app-toast--${toast.type}`}>
        <div className="app-toast-accent" aria-hidden />
        <div className="app-toast-icon-wrap">
          <Icon size={22} strokeWidth={2} className="app-toast-icon" />
        </div>
        <div className="app-toast-body">
          <div className="app-toast-title">{toast.title}</div>
          {toast.description && (
            <div className="app-toast-desc">{toast.description}</div>
          )}
          {toast.txHash && (
            <div className="app-toast-hash">
              {blockExplorerUrl ? (
                <a
                  href={`${blockExplorerUrl}/tx/${toast.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="app-toast-hash-link"
                >
                  交易哈希 {toast.txHash.slice(0, 10)}…{toast.txHash.slice(-8)}
                </a>
              ) : (
                <span className="app-toast-hash-txt" title={toast.txHash}>
                  {toast.txHash.slice(0, 18)}…
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="app-toast-close"
          onClick={onClose}
          aria-label="关闭"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function ConfirmHost({
  state,
  onResolve
}: {
  state: ConfirmState
  onResolve: (v: boolean) => void
}) {
  const {
    title = '请确认',
    message,
    subtitle = '校园环保积分系统',
    confirmText = '确定',
    cancelText = '取消',
    danger
  } = state

  return (
    <div
      className="app-confirm-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-confirm-title"
      onClick={() => onResolve(false)}
    >
      <div className="app-confirm-card" onClick={e => e.stopPropagation()}>
        <div className="app-confirm-head">
          <div
            className={`app-confirm-head-icon${danger ? ' app-confirm-head-icon--danger' : ''}`}
            aria-hidden
          >
            {danger ? (
              <AlertCircle size={22} strokeWidth={2} />
            ) : (
              <CheckCircle2 size={22} strokeWidth={2} />
            )}
          </div>
          <div>
            <div id="app-confirm-title" className="app-confirm-title">
              {title}
            </div>
            <div className="app-confirm-sub">{subtitle}</div>
          </div>
        </div>
        <div className="app-confirm-message">{message}</div>
        <div className="app-confirm-actions">
          <button
            type="button"
            className="btn app-confirm-cancel"
            onClick={() => onResolve(false)}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`btn app-confirm-submit ${danger ? 'app-confirm-submit--danger' : ''}`}
            onClick={() => onResolve(true)}
          >
            {!danger && <Check size={18} strokeWidth={2.5} aria-hidden />}
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}

export function UiProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null)
  const [blockExplorerUrl, setBlockExplorerUrl] = useState('')
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)

  useEffect(() => {
    getRewardsChainConfig()
      .then((c) => {
        const url = (
          c.blockExplorerUrl ||
          (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_BLOCK_EXPLORER_URL) ||
          ''
        ).trim()
        if (url) setBlockExplorerUrl(url.replace(/\/+$/, ''))
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 5200)
    return () => window.clearTimeout(t)
  }, [toast])

  const showToast = useCallback((payload: ToastPayload) => {
    setToast(payload)
  }, [])

  const dismissToast = useCallback(() => setToast(null), [])

  const showConfirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...opts, resolve })
    })
  }, [])

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmState((c) => {
      if (c) {
        c.resolve(value)
        return null
      }
      return null
    })
  }, [])

  const value: UiContextValue = {
    showToast,
    dismissToast,
    showConfirm
  }

  return (
    <UiContext.Provider value={value}>
      {children}
      {toast && (
        <ToastHost
          toast={toast}
          onClose={dismissToast}
          blockExplorerUrl={blockExplorerUrl}
        />
      )}
      {confirmState && (
        <ConfirmHost state={confirmState} onResolve={resolveConfirm} />
      )}
    </UiContext.Provider>
  )
}
