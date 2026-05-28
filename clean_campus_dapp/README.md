# 校园环保积分系统 DApp

基于区块链的去中心化环保行为积分系统。

## 技术栈

- **前端**: Next.js 14 (App Router) + React 18 + TypeScript + Ethers.js
- **智能合约**: Solidity + Hardhat
- **后端**: Node.js + Express
- **存储**: IPFS (Pinata)
- **区块链网络**: Hardhat 本地链（默认）/ 可扩展至测试网

## 功能模块

1. ✅ MetaMask 钱包登录
2. ✅ 环保行为上报（图片上传）
3. ✅ 积分发放（ERC-20代币）
4. ✅ 积分排行榜
5. ✅ 奖励兑换

- **业务逻辑与上链说明**：见 [业务逻辑与上链说明.md](./业务逻辑与上链说明.md)（哪些环节上链、链上数据如何展示）。
- **合约运行与部署**：见 [contracts/如何运行.md](./contracts/如何运行.md)（推荐按该文档顺序启动链、部署、启动前后端）。

## 快速开始

### 1. 安装依赖

```bash
# 根目录
npm install

# 前端
cd frontend && npm install

# 后端
cd backend && npm install

# 智能合约
cd contracts && npm install
```

### 2. 配置环境变量

#### 前端 (.env)
```
NEXT_PUBLIC_CONTRACT_ADDRESS=你的合约地址
NEXT_PUBLIC_RPC_URL=http://localhost:8545
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

#### 后端 (.env)
```
PORT=3001
PINATA_API_KEY=你的Pinata API Key
PINATA_SECRET_KEY=你的Pinata Secret Key
DATABASE_URL=sqlite:./database.db
```

#### 智能合约 (.env)
```
# 默认使用 Hardhat 本地链（localhost:8545）时不需要此文件
# 如需部署到测试网/主网，再根据 hardhat.config.js 配置 RPC 与私钥
```

### 3. 部署智能合约

```bash
cd contracts
npm run compile
npm run deploy
```

### 4. 启动项目

```bash
# 后端（终端1）
cd backend && npm run dev

# 前端 Next.js（终端2）
cd frontend && npm run dev
```

## 项目结构

```
.
├── frontend/          # Next.js 前端应用
├── backend/           # Express后端API
├── contracts/         # Solidity智能合约
└── README.md
```

