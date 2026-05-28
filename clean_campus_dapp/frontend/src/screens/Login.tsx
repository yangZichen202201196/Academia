'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useWeb3 } from '../contexts/Web3Context'

export default function Login() {
  const { account, connectWallet } = useWeb3()
  const router = useRouter()
  const [hasEthereum, setHasEthereum] = useState<boolean | null>(null)

  useEffect(() => {
    if (account) {
      router.push('/')
    }
  }, [account, router])

  useEffect(() => {
    // 避免 SSR/预渲染阶段访问 window
    setHasEthereum(typeof window !== 'undefined' && !!window.ethereum)
  }, [])

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🌱 校园环保积分系统</h1>
        <p className="subtitle">使用 MetaMask 钱包登录</p>
        
        {hasEthereum === false ? (
          <div className="no-wallet">
            <p>请先安装 MetaMask 钱包</p>
            <a 
              href="https://metamask.io/download/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              下载 MetaMask
            </a>
          </div>
        ) : (
          <div className="login-content">
            <button onClick={connectWallet} className="btn btn-primary btn-large">
              连接 MetaMask 钱包
            </button>
            <p className="hint">
              点击按钮后，MetaMask 会弹出连接请求
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

