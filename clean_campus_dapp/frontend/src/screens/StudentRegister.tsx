'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { registerStudent } from '../utils/api'
import { useAuth } from '../contexts/AuthContext'
import { useUi } from '../contexts/UiContext'

export default function StudentRegister() {
  const { login } = useAuth()
  const { showToast } = useUi()
  const router = useRouter()

  const [studentId, setStudentId] = useState('')
  const [initialPassword, setInitialPassword] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [name, setName] = useState('')
  const [college, setCollege] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentId || !initialPassword || !password) {
      showToast({ type: 'info', title: '请填写完整', description: '请填写学号、初始密码和新密码。' })
      return
    }
    if (password !== confirmPassword) {
      showToast({ type: 'error', title: '密码不一致', description: '两次输入的新密码不一致。' })
      return
    }

    setLoading(true)
    try {
      const data = await registerStudent({
        studentId,
        initialPassword,
        password,
        name: name || undefined,
        college: college || undefined
      })

      login(data.token, {
        studentId: data.studentId,
        name: data.name,
        college: data.college,
        walletAddress: null,
        escrowPoints: data.escrowPoints
      })

      router.push('/')
    } catch (err: any) {
      console.error('注册失败:', err)
      const msg = err.response?.data?.error || err.message || '注册失败'
      showToast({ type: 'error', title: '注册失败', description: msg })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🌱 校园环保积分系统</h1>
        <p className="subtitle">学号注册</p>

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
            <label>初始密码</label>
            <input
              type="password"
              className="input"
              value={initialPassword}
              onChange={e => setInitialPassword(e.target.value)}
              placeholder="学校/管理员下发的初始密码"
            />
          </div>

          <div className="form-group">
            <label>新密码</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="设置登录密码"
            />
          </div>

          <div className="form-group">
            <label>确认新密码</label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="再次输入登录密码"
            />
          </div>

          <div className="form-group">
            <label>姓名（可选）</label>
            <input
              className="input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如果不填，将使用学校记录"
            />
          </div>

          <div className="form-group">
            <label>学院（可选）</label>
            <input
              className="input"
              value={college}
              onChange={e => setCollege(e.target.value)}
              placeholder="例如：计算机学院"
            />
          </div>

          <button type="submit" className="btn btn-primary btn-large" disabled={loading}>
            {loading ? '注册中...' : '注册并进入系统'}
          </button>
        </form>

        <p className="hint">
          已有账号？ <Link href="/student/login">前往登录</Link>
        </p>
      </div>
    </div>
  )
}

