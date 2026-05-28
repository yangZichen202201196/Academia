# 使用 Sepolia 测试网

## 1. 配置合约部署（contracts/.env）

- **SEPOLIA_RPC_URL**：已填好公共节点，无需修改；若限流可改用 Alchemy/Infura 的 Sepolia RPC。
- **PRIVATE_KEY**：必须换成**有 Sepolia 测试 ETH** 的钱包私钥（当前为本地链用密钥，在 Sepolia 上无余额）。
  - 测试币水龙头：https://sepoliafaucet.com 或 https://www.alchemy.com/faucets/ethereum-sepolia

## 2. 部署到 Sepolia

在 `contracts` 目录下执行：

```bash
npm run deploy:sepolia
```

终端会输出合约地址，例如：`GreenCampusToken deployed to: 0x...`，请复制该地址。

## 3. 后端与前端切换到 Sepolia

部署成功后：

1. **backend/.env**  
   - 将 `CONTRACT_ADDRESS` 改为上一步输出的合约地址  
   - 将 `RPC_URL` 改为 `https://ethereum-sepolia.publicnode.com`（或你的 Sepolia RPC）  
   - 将 `ADMIN_PRIVATE_KEY` 改为与部署账户相同的私钥（用于审核、兑换等链上操作）  
   - `BLOCK_EXPLORER_URL` 已为 `https://sepolia.etherscan.io`，无需改

2. **frontend/.env**  
   - 将 `NEXT_PUBLIC_CONTRACT_ADDRESS` 改为同一合约地址  
   - 将 `NEXT_PUBLIC_RPC_URL` 改为同一 Sepolia RPC  
   - `NEXT_PUBLIC_BLOCK_EXPLORER_URL` 已为 Sepolia 浏览器，无需改

3. 重启后端与前端，MetaMask 选择 **Sepolia 测试网**，即可在 Sepolia 上使用，且「链上查看」会跳转到 https://sepolia.etherscan.io。
