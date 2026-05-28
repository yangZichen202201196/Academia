const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

function getProjectRoot() {
  return path.resolve(__dirname, "..", "..");
}

function updateEnvFile(envPath, key, value) {
  const line = key + "=" + value;
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }
  const keyMatch = new RegExp("^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=.*", "m");
  if (keyMatch.test(content)) {
    content = content.replace(keyMatch, line);
  } else {
    content = (content.trimEnd() ? content.trimEnd() + "\n" : "") + line + "\n";
  }
  fs.writeFileSync(envPath, content, "utf8");
  if (fs.existsSync(envPath)) {
    const readBack = fs.readFileSync(envPath, "utf8").match(new RegExp("^\\s*" + key + "\\s*=\\s*(.+)", "m"));
    console.log("  已写入 " + key + " 到 " + path.resolve(envPath));
  }
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const network = await hre.ethers.provider.getNetwork();

  console.log("====== 部署 GreenToken ======");
  console.log("网络:", network.name, "chainId:", network.chainId.toString());
  console.log("部署账户:", deployer.address);

  const GreenToken = await hre.ethers.getContractFactory("GreenToken");
  const greenToken = await GreenToken.deploy(deployer.address);
  await greenToken.waitForDeployment();
  const address = await greenToken.getAddress();

  console.log("GreenToken 已部署到:", address);

  const [name, symbol] = await Promise.all([
    greenToken.name(),
    greenToken.symbol()
  ]);
  console.log("验证: name=%s symbol=%s", name, symbol);

  try {
    await greenToken.redeemForReward.staticCall(1n, 1n, "deploy-check");
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (/unrecognized|selector/i.test(msg)) {
      console.error("\n[错误] 链上字节码中未识别 redeemForReward，兑换会报错。请执行：");
      console.error("  npx hardhat clean");
      console.error("  npx hardhat compile");
      console.error("  然后重新运行本脚本（先确保 npx hardhat node 在运行）。\n");
      process.exit(1);
    }
  }

  const root = getProjectRoot();
  const frontendEnv = path.join(root, "frontend", ".env");
  const backendEnv = path.join(root, "backend", ".env");

  console.log("\n--- 写入合约地址（请与前端页面显示的「兑换使用地址」一致）---");
  console.log("  本次部署地址:", address);
  console.log("  frontend/.env 路径:", path.resolve(frontendEnv));
  console.log("  backend/.env 路径:", path.resolve(backendEnv));

  fs.writeFileSync(path.join(__dirname, "..", ".deployed-address"), address, "utf8");
  if (fs.existsSync(frontendEnv)) {
    updateEnvFile(frontendEnv, "NEXT_PUBLIC_CONTRACT_ADDRESS", address);
    const readFront = fs.readFileSync(frontendEnv, "utf8").match(/NEXT_PUBLIC_CONTRACT_ADDRESS\s*=\s*(.+)/m);
    console.log("  前端 .env 已写入 NEXT_PUBLIC_CONTRACT_ADDRESS =", (readFront && readFront[1] && readFront[1].trim()) || address);
  } else {
    console.warn("  未找到 frontend/.env，请手动在 frontend/.env 中设置 NEXT_PUBLIC_CONTRACT_ADDRESS=" + address);
  }
  if (fs.existsSync(backendEnv)) {
    updateEnvFile(backendEnv, "CONTRACT_ADDRESS", address);
    const readBack = fs.readFileSync(backendEnv, "utf8").match(/CONTRACT_ADDRESS\s*=\s*(.+)/m);
    console.log("  后端 .env 已写入 CONTRACT_ADDRESS =", (readBack && readBack[1] && readBack[1].trim()) || address);
  } else {
    console.warn("  未找到 backend/.env，请手动在 backend/.env 中设置 CONTRACT_ADDRESS=" + address);
  }
  console.log("---\n>>> 必须重启前后端 (npm run dev)，并强制刷新浏览器 (Ctrl+Shift+R)，否则前端仍用旧地址会报 unrecognized-selector。\n");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });








