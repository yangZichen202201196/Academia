import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { ethers } from 'ethers'
import { GREEN_TOKEN_ABI } from '../abis/contractAbi'
import { getRewardsChainConfig } from '../utils/api'
import { useUi } from './UiContext'

interface Web3ContextType {
  provider: ethers.BrowserProvider | null
  signer: ethers.JsonRpcSigner | null
  account: string | null
  contract: ethers.Contract | null
  connectWallet: () => Promise<string | null>
  disconnectWallet: () => void
  balance: string
  balanceError: string | null
  refreshBalance: () => Promise<void>
  chainName: string | null
}

const Web3Context = createContext<Web3ContextType | undefined>(undefined)

export const useWeb3 = () => {
  const context = useContext(Web3Context)
  if (!context) {
    throw new Error('useWeb3 must be used within Web3Provider')
  }
  return context
}

const FALLBACK_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS as string | undefined

const BALANCE_ERROR_MSG = '合约未部署或地址/网络错误。请将钱包切换至与后端一致的网络（Sepolia 测试网或本地链）并确认合约已部署。'

export const Web3Provider = ({ children }: { children: ReactNode }) => {
  return <Web3ProviderInner>{children}</Web3ProviderInner>
}

function Web3ProviderInner({ children }: { children: ReactNode }) {
  const { showToast } = useUi()
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null)
  const [account, setAccount] = useState<string | null>(null)
  const [contract, setContract] = useState<ethers.Contract | null>(null)
  const [balance, setBalance] = useState<string>('0')
  const [balanceError, setBalanceError] = useState<string | null>(null)
  const [chainContractAddress, setChainContractAddress] = useState<string | null>(null)
  const [chainName, setChainName] = useState<string | null>(null)
  const [expectedChainId, setExpectedChainId] = useState<number | null>(null)

  useEffect(() => {
    getRewardsChainConfig()
      .then((c) => {
        if (c.ok && c.contractAddress) {
          setChainContractAddress(c.contractAddress)
          if (c.chainId != null) setExpectedChainId(Number(c.chainId))
          setChainName(c.chainName || (c.chainId === 11155111 ? 'Sepolia 测试网' : c.chainId === 31337 ? 'Hardhat 本地链' : null))
        }
      })
      .catch(() => {})
  }, [])

  const disconnectWallet = () => {
    setProvider(null)
    setSigner(null)
    setAccount(null)
    setContract(null)
    setBalance('0')
    setBalanceError(null)
  }

  const refreshBalance = async (contractInstance?: ethers.Contract, accountAddress?: string) => {
    const contractToUse = contractInstance || contract
    const addressToUse = accountAddress || account
    if (!contractToUse || !addressToUse) return

    setBalanceError(null)
    try {
      const bal = await contractToUse.balanceOf(addressToUse)
      setBalance(ethers.formatEther(bal))
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error('获取 GCT 余额失败:', error)
      // 常见原因：链重置后未重部署、合约地址错误或网络不一致，给出可操作提示
      const friendly =
        /revert|unrecognized|selector|execution reverted|missing revert/i.test(msg)
          ? BALANCE_ERROR_MSG
          : msg
      setBalanceError(friendly)
      // 不在此处 setBalance('0')，避免取数失败时把界面“直接清零”；保留上次成功读到的余额，用户可点重试再取真实值
    }
  }

  const connectWallet = async (): Promise<string | null> => {
    if (!window.ethereum) {
      showToast({ type: 'info', title: '未检测到钱包', description: '请安装 MetaMask 浏览器扩展后再连接。' })
      return null
    }

    try {
      const prov = new ethers.BrowserProvider(window.ethereum)
      const accounts = await prov.send('eth_requestAccounts', []) as string[]
      if (!accounts?.[0]) return null

      const currentNetwork = await prov.getNetwork()
      const currentChainId = Number(currentNetwork.chainId)
      const expected = expectedChainId ?? (chainContractAddress ? 11155111 : null)
      if (expected != null && currentChainId !== expected) {
        const chainNameHint = expected === 11155111 ? 'Sepolia 测试网' : expected === 31337 ? 'Hardhat 本地链' : `链 ID ${expected}`
        const hexChainId = '0x' + expected.toString(16)
        try {
          await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChainId }] })
        } catch (switchErr: unknown) {
          const msg = switchErr && typeof (switchErr as any).message === 'string' ? (switchErr as any).message : ''
          if (/Unrecognized chain|未识别的链/i.test(msg) && expected === 31337) {
            showToast({
              type: 'info',
              title: '请添加本地网络',
              description: `请在 MetaMask 中添加：RPC http://127.0.0.1:8545，链 ID 31337，然后再连接。`
            })
          } else {
            showToast({
              type: 'info',
              title: '网络不匹配',
              description: `请手动切换到「${chainNameHint}」（链 ID ${expected}）后重试。`
            })
          }
        }
        setBalanceError(`请将钱包切换到「${chainNameHint}」（链 ID ${expected}）后点击重试。`)
        setProvider(prov)
        setSigner(await prov.getSigner())
        setAccount(accounts[0])
        return accounts[0]
      }

      const sig = await prov.getSigner()
      setProvider(prov)
      setSigner(sig)
      setAccount(accounts[0])

      const contractAddress = chainContractAddress || FALLBACK_CONTRACT_ADDRESS
      if (contractAddress) {
        const abi = GREEN_TOKEN_ABI as ethers.InterfaceAbi
        const c = new ethers.Contract(contractAddress, abi, sig)
        const cReadOnly = new ethers.Contract(contractAddress, abi, prov)
        try {
          const sym = await cReadOnly.symbol()
          if (sym !== 'GCT') throw new Error('合约 symbol 不是 GCT')
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e)
          console.error('合约校验失败:', e)
          setBalanceError(/revert|unrecognized|selector|missing revert/i.test(msg) ? BALANCE_ERROR_MSG : msg)
        }
        setContract(c)
        await refreshBalance(c, accounts[0])
      } else {
        setBalance('0')
        setBalanceError('未获取到合约地址，请确认后端已配置当前链（Sepolia 或本地）并重启后端')
      }

      window.ethereum.on('accountsChanged', async (acc: string[]) => {
        if (acc.length === 0) {
          disconnectWallet()
          return
        }
        setAccount(acc[0])
        const addr = chainContractAddress || FALLBACK_CONTRACT_ADDRESS
        if (!addr) return
        try {
          const prov = new ethers.BrowserProvider(window.ethereum)
          const newSigner = await prov.getSigner()
          const abi = GREEN_TOKEN_ABI as ethers.InterfaceAbi
          const c = new ethers.Contract(addr, abi, newSigner)
          const cReadOnly = new ethers.Contract(addr, abi, prov)
          const sym = await cReadOnly.symbol()
          if (sym !== 'GCT') throw new Error('合约不匹配')
          setContract(c)
          await refreshBalance(c, acc[0])
        } catch (e) {
          console.error('切换账户后失败:', e)
          const prov = new ethers.BrowserProvider(window.ethereum)
          const newSigner = await prov.getSigner()
          const c = new ethers.Contract(addr, GREEN_TOKEN_ABI as ethers.InterfaceAbi, newSigner)
          setContract(c)
          await refreshBalance(c, acc[0])
        }
      })

      window.ethereum.on('chainChanged', () => {
        window.location.reload()
      })

      return accounts[0]
    } catch (error) {
      console.error('连接钱包失败:', error)
      showToast({ type: 'error', title: '连接钱包失败', description: '请重试或检查浏览器是否拦截了弹窗。' })
      return null
    }
  }

  useEffect(() => {
    if (!account || !contract) return
    refreshBalance(contract, account)
  }, [account, contract])

  return (
    <Web3Context.Provider
      value={{
        provider,
        signer,
        account,
        contract,
        connectWallet,
        disconnectWallet,
        balance,
        balanceError,
        refreshBalance: () => refreshBalance(),
        chainName
      }}
    >
      {children}
    </Web3Context.Provider>
  )
}


declare global {
  interface Window {
    ethereum?: any
  }
}








