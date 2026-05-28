import type { Metadata, Viewport } from 'next'
import Providers from './providers'

// 全局样式（Next.js 仅允许在根布局引入全局 CSS）
import '../index.css'
import '../App.css'
import '../components/Layout.css'
import '../pages/Login.css'
import '../pages/Home.css'
import '../pages/Profile.css'
import '../pages/Report.css'
import '../pages/Rewards.css'
import '../pages/Leaderboard.css'
import '../pages/Admin.css'
import '../pages/UiNotifications.css'

export const metadata: Metadata = {
  title: '校园环保积分系统',
  description: '基于区块链的校园环保积分系统'
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}

