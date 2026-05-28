# 校园环保积分 - 后端

## 填充示例数据（排行榜、校园动态、积分展示）

若前端出现 **「暂无排行榜数据」**、**「暂无记录」**、**「当前积分 0.00 GCT」** 等，多半是数据库里还没有用户和报告数据。

在 **backend 目录** 下执行种子脚本即可写入约 20+ 用户、报告与兑换记录：

```bash
cd backend
npm run seed
```

- 会插入学号白名单、用户（含绑定钱包）、环保行为报告（含待审/已通过/已驳回）、兑换记录与操作日志。
- 学号登录默认密码：`123456`（如 20240001、张三 等）。
- 执行后刷新前端，排行榜与校园动态会按新数据展示；积分仍依赖链上合约，未发积分前会显示 0。

## 排行榜与动态逻辑说明

- **排行榜**：优先从链上合约读取累计积分；若未配置合约或链上无数据，会自动回退到按数据库「已通过报告」汇总积分。
- **校园动态**：展示全站最近报告（`GET /api/reports/recent`），不依赖当前登录用户是否有上报。

. 使用方式小结
想用的链	操作
Sepolia	backend/.env 中 ACTIVE_CHAIN=sepolia，配置 SEPOLIA_RPC_URL、SEPOLIA_CONTRACT_ADDRESS；钱包选 Sepolia。
Hardhat 本地	ACTIVE_CHAIN=hardhat，配置 HARDHAT_RPC_URL、HARDHAT_CONTRACT_ADDRESS；先 npx hardhat node 再 npm run deploy；钱包选本地 31337。
改完 backend/.env 后重启后端，前端刷新即可；前端会从后端拿到当前链的合约地址，无需再为换链改前端 .env（可选保留 NEXT_PUBLIC_CONTRACT_ADDRESS 作回退）。
