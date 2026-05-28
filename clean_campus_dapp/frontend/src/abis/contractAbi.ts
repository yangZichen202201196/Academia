/**
 * 前端 ABI 唯一来源：合约编译产物 GreenToken.json，与链上字节码一致。
 * 不做过滤，直接使用完整 ABI，避免筛选导致与合约不一致。
 */
import GreenTokenArtifact from './GreenToken.json'

const artifact = GreenTokenArtifact as { abi: unknown[] }
export const GREEN_TOKEN_ABI = artifact.abi
