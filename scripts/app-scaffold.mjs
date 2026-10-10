import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { registerVault, isValidFolderName } from "./vault-registration.mjs";
const slug = process.argv[2];
if (!isValidFolderName(slug) || ["api","apps","admin","www","app","launch","preview","login","settings"].includes(slug)) throw new Error("Pass a nonreserved lowercase app slug (3–64 characters).");
const dir = path.join(process.cwd(), "src/vaults", slug);
if (fs.existsSync(dir)) throw new Error("The app source folder already exists.");
const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const encode = (value, length) => {
  let result = "";
  for (let index = 0; index < length; index++) { result = alphabet[Number(value & 31n)] + result; value >>= 5n; }
  return result;
};
let randomness = 0n;
for (const byte of crypto.randomBytes(10)) randomness = (randomness << 8n) + BigInt(byte);
const ulid = encode(BigInt(Date.now()), 10) + encode(randomness, 16);
const manifest = { schemaVersion: 2, mode: "mini-app", appModel: "standalone", slug, artifactId: `vaultui_${slug}_${ulid}`, name: slug, displayTitle: { en: "Independent Mini App", zh: "独立小程序" }, match: { bindings: [] }, i18n: ["en", "zh", "ko"] };
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "VaultABI.ts"), "export const VaultABI = [] as const;\n");
fs.writeFileSync(path.join(dir, "i18n.json"), JSON.stringify({ en: { title: "Independent Mini App", description: "This app uses your Flap account. Connect your wallet or sign in using the main site to continue.", guest: "Continue with Flap", connected: "Your Flap account is connected" }, zh: { title: "独立小程序", description: "此应用使用你的 Flap 账户，可通过主站连接钱包或登录后继续。", guest: "使用 Flap 继续", connected: "已连接你的 Flap 账户" }, ko: { title: "독립 미니 앱", description: "이 앱은 Flap 계정을 사용합니다. 메인 사이트에서 지갑을 연결하거나 로그인하여 계속하세요.", guest: "Flap으로 계속", connected: "Flap 계정이 연결되었습니다" } }, null, 2) + "\n");
fs.writeFileSync(path.join(dir, "Component.tsx"), `"use client";
import { useFlapSdk } from "@/src/sdk";
export default function Component() {
  const { wallet, i18n } = useFlapSdk({ chainId: 56 });
  return <div className="min-h-screen w-full p-6">
    <h1 className="text-2xl font-semibold">{i18n.t("title")}</h1>
    <p className="mt-4 text-white/60">{i18n.t("description")}</p>
    <p className="mt-4 break-all">{wallet.isConnected ? wallet.address : i18n.t("guest")}</p>
    <p className="mt-4">{wallet.isConnected ? i18n.t("connected") : i18n.t("guest")}</p>
  </div>;
}
`);
registerVault(slug);
console.log(JSON.stringify({ slug, appId: manifest.artifactId, path: `/apps/${slug}`, next: [`yarn app:check ${slug}`, `yarn app:e2e ${slug}`, `yarn app:package ${slug}`, `yarn app:verify-package dist/${slug}.zip`] }, null, 2));
