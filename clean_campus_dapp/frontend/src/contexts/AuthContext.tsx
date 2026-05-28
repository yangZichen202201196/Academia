import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import axios from 'axios'
import { getAuthMe } from '../utils/api'

export interface StudentInfo {
  studentId: string
  name?: string
  college?: string
  walletAddress?: string | null
  escrowPoints: number
  hasWalletBound?: boolean
  role?: 'student' | 'admin' | 'auditor'
}

interface AuthContextType {
  token: string | null
  student: StudentInfo | null
  login: (token: string, student: StudentInfo) => void
  logout: () => void
  updateStudent: (patch: Partial<StudentInfo>) => void
  /** 从后端/数据库拉取最新用户信息并更新前端，保证三端一致 */
  refreshStudent: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const STORAGE_KEY = 'studentAuth'

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null)
  const [student, setStudent] = useState<StudentInfo | null>(null)

  // 恢复登录态后，始终从后端同步最新用户信息（含积分地址绑定），避免与后端不一致
  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as { token: string; student: StudentInfo }
        setToken(parsed.token)
        axios.defaults.headers.common['Authorization'] = `Bearer ${parsed.token}`
        getAuthMe()
          .then(me => {
            const updated: StudentInfo = {
              ...parsed.student,
              studentId: me.studentId,
              name: me.name ?? parsed.student?.name,
              college: me.college ?? parsed.student?.college,
              walletAddress: me.walletAddress ?? parsed.student?.walletAddress ?? null,
              escrowPoints: me.escrowPoints ?? parsed.student?.escrowPoints ?? 0,
              hasWalletBound: me.hasWalletBound ?? !!me.walletAddress,
              role: me.role ?? parsed.student?.role
            }
            if (me.hasWalletBound !== undefined) updated.hasWalletBound = me.hasWalletBound
            setStudent(updated)
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: parsed.token, student: updated }))
          })
          .catch((e: any) => {
            // 401/403 都代表 token 已失效或权限不足：清理本地登录态，避免后续接口一直失败
            if (e.response?.status === 403 || e.response?.status === 401) {
              setToken(null)
              setStudent(null)
              delete axios.defaults.headers.common['Authorization']
              localStorage.removeItem(STORAGE_KEY)
            }
          })
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
  }, [])

  const persist = (nextToken: string | null, nextStudent: StudentInfo | null) => {
    if (nextToken && nextStudent) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ token: nextToken, student: nextStudent })
      )
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const login = (newToken: string, newStudent: StudentInfo) => {
    setToken(newToken)
    setStudent(newStudent)
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
    persist(newToken, newStudent)
  }

  const logout = () => {
    setToken(null)
    setStudent(null)
    delete axios.defaults.headers.common['Authorization']
    persist(null, null)
  }

  const updateStudent = (patch: Partial<StudentInfo>) => {
    setStudent(prev => {
      if (!prev) return prev
      const updated: StudentInfo = { ...prev, ...patch }
      if (token) {
        persist(token, updated)
      }
      return updated
    })
  }

  const refreshStudent = async () => {
    if (!token) return
    try {
      const me = await getAuthMe()
      setStudent(prev => {
      if (!prev) return prev
      const updated: StudentInfo = {
        ...prev,
        studentId: me.studentId,
        name: me.name ?? prev.name,
        college: me.college ?? prev.college,
        walletAddress: me.walletAddress ?? null,
        escrowPoints: me.escrowPoints ?? prev.escrowPoints,
        hasWalletBound: me.hasWalletBound ?? !!me.walletAddress,
        role: me.role ?? prev.role
      }
      persist(token, updated)
      return updated
    })
    } catch (e: any) {
      if (e.response?.status === 403 || e.response?.status === 401) {
        logout()
      }
      throw e
    }
  }

  return (
    <AuthContext.Provider value={{ token, student, login, logout, updateStudent, refreshStudent }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return ctx
}

