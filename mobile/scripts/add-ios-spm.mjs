#!/usr/bin/env node
/**
 * Add Capacitor iOS platform using SPM template.
 * Workaround: Capacitor CLI lowercases --packagemanager, so "SPM" never matches
 * and CocoaPods is required incorrectly. This script extracts the SPM template
 * and applies appId / appName from capacitor.config.json.
 */
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const iosDir = join(root, "ios");
const require = createRequire(import.meta.url);

if (existsSync(iosDir)) {
  console.error("[add-ios-spm] ios/ already exists. Remove it first to re-add.");
  process.exit(1);
}

const cliPkg = dirname(require.resolve("@capacitor/cli/package.json"));
const template = join(cliPkg, "assets", "ios-spm-template.tar.gz");
if (!existsSync(template)) {
  console.error("[add-ios-spm] missing template:", template);
  process.exit(1);
}

const configPath = join(root, "capacitor.config.json");
const config = JSON.parse(readFileSync(configPath, "utf8"));
const appId = config.appId || "com.mytimetree.app";
const appName = (config.appName || "MyTimeTree")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;");

mkdirSync(iosDir, { recursive: true });
try {
  execFileSync("tar", ["-xzf", template, "-C", iosDir], { stdio: "inherit" });
} catch (e) {
  rmSync(iosDir, { recursive: true, force: true });
  throw e;
}

const pbx = join(iosDir, "App/App.xcodeproj/project.pbxproj");
const plist = join(iosDir, "App/App/Info.plist");
let pbxContent = readFileSync(pbx, "utf8");
pbxContent = pbxContent.replace(
  /PRODUCT_BUNDLE_IDENTIFIER = ([^;]+)/g,
  `PRODUCT_BUNDLE_IDENTIFIER = ${appId}`,
);
writeFileSync(pbx, pbxContent);

let plistContent = readFileSync(plist, "utf8");
plistContent = plistContent.replace(
  /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]*(<\/string>)/,
  `$1${appName}$2`,
);
writeFileSync(plist, plistContent);

console.log(`[add-ios-spm] ios/ ready (SPM) appId=${appId} name=${appName}`);
console.log("[add-ios-spm] next: npm run cap:sync && npm run open:ios");
