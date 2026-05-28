/**
 * 将 contracts/.deployed-address 中的地址同步到 frontend/.env 和 backend/.env。
 * 在项目根目录或 contracts 目录执行：
 *   node contracts/scripts/sync-deployed-address.js
 * 或（在 contracts 下）：
 *   node scripts/sync-deployed-address.js
 */
const fs = require("fs");
const path = require("path");

const scriptDir = __dirname;
const contractsDir = path.join(scriptDir, "..");
const deployedPath = path.join(contractsDir, ".deployed-address");

const projectRoot = path.resolve(contractsDir, "..");
const frontendEnv = path.join(projectRoot, "frontend", ".env");
const backendEnv = path.join(projectRoot, "backend", ".env");

if (!fs.existsSync(deployedPath)) {
  console.error("未找到 contracts/.deployed-address，请先执行: cd contracts && npx hardhat run scripts/deploy.js --network localhost");
  process.exit(1);
}

const address = fs.readFileSync(deployedPath, "utf8").trim();
if (!address || !address.startsWith("0x")) {
  console.error("contracts/.deployed-address 内容无效");
  process.exit(1);
}

function updateEnv(envPath, key) {
  if (!fs.existsSync(envPath)) {
    console.warn("跳过（不存在）:", envPath);
    return;
  }
  let content = fs.readFileSync(envPath, "utf8");
  const line = key + "=" + address;
  const re = new RegExp("^\\s*" + key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*=.*", "m");
  if (re.test(content)) content = content.replace(re, line);
  else content = (content.trimEnd() ? content.trimEnd() + "\n" : "") + line + "\n";
  fs.writeFileSync(envPath, content, "utf8");
  console.log("已更新 " + envPath + " -> " + key + "=" + address);
}

updateEnv(frontendEnv, "NEXT_PUBLIC_CONTRACT_ADDRESS");
updateEnv(backendEnv, "CONTRACT_ADDRESS");
console.log("\n请重启前后端 (npm run dev) 并强制刷新浏览器 (Ctrl+Shift+R)。");
