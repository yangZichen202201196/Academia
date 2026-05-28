require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// 验证私钥格式的辅助函数
const validatePrivateKey = (key) => {
  if (!key) return false;
  // 支持有 0x 前缀和无前缀的私钥
  const keyWithoutPrefix = key.startsWith('0x') ? key.slice(2) : key;
  return keyWithoutPrefix.length === 64 && /^[0-9a-fA-F]+$/.test(keyWithoutPrefix);
};

module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
      // 关闭 viaIR，避免部分环境下字节码/selector 异常导致「无法识别的函数」
      // viaIR: true
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    localhost: {
      url: "http://localhost:8545",
      accounts: validatePrivateKey(process.env.PRIVATE_KEY) 
        ? [process.env.PRIVATE_KEY] 
        : [],
      chainId: 31337
    },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      accounts: validatePrivateKey(process.env.PRIVATE_KEY)
        ? [process.env.PRIVATE_KEY]
        : [],
      chainId: 11155111
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  
  // 添加类型支持
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6"
  }
};