/**
 * iOS 构建脚本 —— 对应 `buildAndroid.ts` 的 iOS 版。
 *
 * 与安卓的差别：
 *
 * - 安卓在**任何平台**都能构建（`gradlew` 跨平台可用）；iOS 必须跑在 **macOS** 上，
 *   因为 `xcodebuild` / `codesign` 只存在于 macOS。因此在 Windows 上运行本脚本会直接
 *   给出清晰提示，而不是抛一堆难懂的报错。
 * - 签名相关参数（Team ID / 描述文件 / 导出方式）通过命令行传入，不写死在仓库里。
 *
 * 工具链要求（本仓库固定在 Capacitor 6，为的是兼容 Intel Mac）：
 *
 * - **Xcode 15.0+**：Capacitor 6 的要求。注意 Xcode 26+ 起 Apple 已不再支持 Intel Mac，
 *   所以 Intel 机器请装 Xcode 15.x（最高支持 macOS Ventura 13.5+ 的那一档）。
 * - **CocoaPods**：Capacitor 6 的 iOS 工程用 CocoaPods 管理依赖（Capacitor 8 才改用 SPM）。
 *
 * 典型用法（在 Mac 上、仓库根目录执行）：
 *
 *   pnpm --filter @noname/mobile build:ios -- --team=XXXXXXXXXX
 *
 * 常用参数：
 *   --team=<id>             Apple 开发者 Team ID（必需）
 *   --method=<method>       导出方式：development（默认，可用于 SideStore/AltStore 侧载）
 *                           / ad-hoc / app-store-connect
 *   --configuration=<name>  Debug（默认）或 Release
 *   --skip-web-build        复用已有 dist，只重新 sync + 打包
 *   --help                  查看帮助
 *
 * 产物：`apps/mobile/ios/build/export/<AppName>.ipa`
 *
 * ⚠️ 首次运行前需要先有 iOS 工程，即先执行 `npx cap add ios`（本脚本会检查并提示）。
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const mobileRoot = import.meta.dirname;
const workspaceRoot = resolve(mobileRoot, "../..");
const iosRoot = resolve(mobileRoot, "ios");
const archivePath = resolve(iosRoot, "build/noname.xcarchive");
const exportDir = resolve(iosRoot, "build/export");

const args = new Set(process.argv.slice(2));

if (args.has("--help")) {
	console.log(`Usage: pnpm --filter @noname/mobile build:ios [options]

Options:
  --team=<id>             Apple Developer Team ID (required)
  --method=<method>       development (default) | ad-hoc | app-store-connect
  --configuration=<name>  Debug (default) | Release
  --skip-web-build        Reuse the existing dist directory
  --help                  Show this message

Requirements:
  - Must run on macOS (xcodebuild is required).
  - Xcode 15.0+ and CocoaPods (Capacitor 6; works on Intel Macs).
  - Run "npx cap add ios" once before the first build to generate the Xcode project.
`);
	process.exit(0);
}

const teamId = readOption("--team=");
const method = readOption("--method=") ?? "development";
const configuration = readOption("--configuration=") ?? "Debug";

const allowedMethods = new Set(["development", "ad-hoc", "app-store-connect", "enterprise", "validation"]);
if (!allowedMethods.has(method)) {
	throw new Error(`Invalid --method=${method}. Expected one of: ${[...allowedMethods].join(", ")}`);
}
if (method === "enterprise") {
	// 企业证书会被 Apple 批量吊销，且需要企业账号，明确劝阻
	console.warn("警告：enterprise 导出方式需要企业开发者账号，且证书极易被吊销，不建议个人使用。");
}

assertMacOS();

if (!teamId) {
	throw new Error("Missing --team=<Apple Developer Team ID>. Find it at https://developer.apple.com/account (Membership details).");
}

if (!existsSync(iosRoot)) {
	throw new Error(
		`iOS project not found at ${iosRoot}.\n` +
			`Run "npx cap add ios" in ${mobileRoot} first (on macOS).`
	);
}

checkCocoaPods();

// Capacitor 6 用 CocoaPods 生成 App.xcworkspace；这里做一次兜底探测，
// 万一将来换回 SPM 模板（Capacitor 8+）也能给出可读的报错而不是让 xcodebuild 抛原始错误。
const workspacePath = resolve(iosRoot, "App/App.xcworkspace");
if (!existsSync(workspacePath)) {
	throw new Error(
		`Xcode workspace not found at ${workspacePath}.\n` +
			"该工程可能未用 CocoaPods 初始化。请在 Mac 上执行：\n" +
			"  cd apps/mobile && npx cap add ios --packagemanager CocoaPods\n" +
			"（或先删除 ios/ 目录再重新执行 npx cap add ios）"
	);
}

if (args.has("--skip-web-build")) {
	console.log("--skip-web-build is set; reusing the existing dist directory.");
} else {
	run("pnpm", ["build"], workspaceRoot, "Web build");
}

// sync 内部会顺带生成 dist/asset-manifest.json（iOS 目录列举依赖它）
run("pnpm", ["sync"], mobileRoot, "Capacitor sync");

// CocoaPods 依赖需要在 sync 之后重新安装（cap sync 会更新 Podfile / Podfile.lock）
run("pod", ["install"], resolve(iosRoot, "App"), "CocoaPods install");

run(
	"xcodebuild",
	[
		"-workspace",
		workspacePath,
		"-scheme",
		"App",
		"-configuration",
		configuration,
		"-archivePath",
		archivePath,
		"-destination",
		"generic/platform=iOS",
		"DEVELOPMENT_TEAM=" + teamId,
		"CODE_SIGN_STYLE=Automatic",
		"archive",
	],
	iosRoot,
	"xcodebuild archive"
);

// 生成导出用的 ExportOptions.plist，避免依赖 Xcode GUI 手工配置
mkdirSync(resolve(iosRoot, "build"), { recursive: true });
const exportOptionsPath = resolve(iosRoot, "build/ExportOptions.plist");
writeFileSync(
	exportOptionsPath,
	`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>method</key>
	<string>${method}</string>
	<key>teamID</key>
	<string>${teamId}</string>
	<key>compileBitcode</key>
	<false/>
	<key>stripSwiftSymbols</key>
	<true/>
	<key>signingStyle</key>
	<string>automatic</string>
</dict>
</plist>
`,
	{ encoding: "utf8" }
);

run(
	"xcodebuild",
	["-exportArchive", "-archivePath", archivePath, "-exportPath", exportDir, "-exportOptionsPlist", exportOptionsPath],
	iosRoot,
	"xcodebuild -exportArchive"
);

console.log(`\niOS archive: ${archivePath}`);
console.log(`iOS IPA exported to: ${exportDir}`);
console.log("用 SideStore / AltStore 把这个 .ipa 装进 iPhone 即可。");

function readOption(prefix: string): string | undefined {
	const found = process.argv.find(arg => arg.startsWith(prefix));
	return found?.slice(prefix.length);
}

function assertMacOS() {
	if (process.platform !== "darwin") {
		throw new Error(
			`iOS builds require macOS (current platform: ${process.platform}).\n` +
				"请在 Mac 上克隆本仓库后再执行该命令；Windows 上可以先把代码改完、推送到 GitHub，再到 Mac 上拉取构建。"
		);
	}
}

/** Capacitor 6 的 iOS 工程用 CocoaPods 管理依赖，构建前必须确保 pod 命令可用 */
function checkCocoaPods() {
	const result = spawnSync("pod", ["--version"], { encoding: "utf8" });
	if (result.error || result.status !== 0) {
		throw new Error(
			"CocoaPods was not found. Capacitor 6 uses CocoaPods for its iOS project.\n" +
				"安装方式（任选其一）：\n" +
				"  sudo gem install cocoapods\n" +
				"  brew install cocoapods"
		);
	}
	console.log(`CocoaPods: ${result.stdout.trim()}`);
}

function run(command: string, commandArgs: string[], cwd: string, step: string) {
	console.log(`\n==> ${step}`);
	const result = spawnSync(command, commandArgs, {
		cwd,
		stdio: "inherit",
		shell: process.platform === "win32" && command === "pnpm",
	});

	if (result.error) {
		throw new Error(`${step} failed: ${result.error.message}`);
	}
	if (result.status !== 0) {
		throw new Error(`${step} failed with exit code ${result.status ?? "unknown"}`);
	}
}
