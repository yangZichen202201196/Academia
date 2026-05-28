'use client'

import { ReactNode } from 'react'
import { Web3Provider } from '../contexts/Web3Context'
import { AuthProvider } from '../contexts/AuthContext'
import { UiProvider } from '../contexts/UiContext'

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <UiProvider>
        <Web3Provider>{children}</Web3Provider>
      </UiProvider>
    </AuthProvider>
  )
}

