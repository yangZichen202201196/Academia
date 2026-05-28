'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { loginStudent } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useUi } from '../contexts/UiContext'

export default function StudentLogin() {
  const { student, login } = useAuth()
  const { showToast } = useUi()
  const router = useRouter()

  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (student) {
      router.push('/')
    }
  }, [student, router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId || !password) {
      showToast({ type: 'info', title: '请填写完整', description: '请输入学号和密码。' })
      return
    }

    setLoading(true)
    try {
      const data = await loginStudent({ studentId, password })
      login(data.token, {
        studentId: data.studentId,
        name: data.name,
        college: data.college,
        walletAddress: data.walletAddress ?? null,
        escrowPoints: data.escrowPoints,
        role: data.role || 'student'
      })
      router.push('/')
    } catch (err: any) {
      console.error('登录失败:', err)
      const msg = err.response?.data?.error || err.message || '登录失败'
      showToast({ type: 'error', title: '登录失败', description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🌱 校园环保积分系统</h1>
        <p className="subtitle">学号登录</p>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label>学号</label>
            <input
              className="input"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              placeholder="请输入学号"
            />
          </div>

          <div className="form-group">
            <label>密码</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="hint">
          没有账号？ <Link href="/student/register">前往注册</Link>
        </p>
        <p className="hint">
          也可以 <Link href="/login">使用钱包登录</Link>
        </p>
      </div>
    </div>
  )
}

