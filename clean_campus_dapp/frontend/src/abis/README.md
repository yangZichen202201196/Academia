# 前端 ABI 说明

## 唯一来源：合约编译产物

- **`GreenToken.json`**：由 `contracts` 目录执行 `npm run compile` 时自动复制到此处（见 contracts 的 copy-abi-to-frontend 脚本），与链上部署的合约一一对应。
- **`contractAbi.ts`**：从 `GreenToken.json` 里**只取出我们实际用到的函数和事件**，导出为 `GREEN_TOKEN_ABI`。不手写 ABI，避免和合约不一致导致调用失败。

## 前端如何使用

- 所有和合约的交互（连接钱包、查余额、兑换、审核发积分等）都使用 **`contractAbi.ts`** 导出的 **`GREEN_TOKEN_ABI`**。
- 这样只维护一份 ABI、且来自合约编译结果，保证和智能合约统一，调用不会乱。

## 合约有改动时

1. 在 `contracts` 目录执行 `npm run compile`，再部署。
2. 确保 `GreenToken.json` 已同步到本目录（若 compile 脚本里配置了复制）。
3. 若**新加了需要前端调用的函数或事件**，在 `contractAbi.ts` 的 `NEEDED_NAMES` 里加上对应名字即可。
