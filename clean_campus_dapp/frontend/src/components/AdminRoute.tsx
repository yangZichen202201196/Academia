'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '../contexts/AuthContext'

/** 审核员或管理员可访问 */
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { student } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  const canAccess = !!student && (student.role === 'admin' || student.role === 'auditor')

  useEffect(() => {
    if (!student) {
      // 保持行为：未登录跳转到学号登录页
      router.replace('/student/login')
      return
    }
    if (!canAccess) {
      router.replace('/home')
    }
  }, [student, canAccess, router, pathname])

  if (!student) return null
  if (!canAccess) return null
  return <>{children}</>
}
