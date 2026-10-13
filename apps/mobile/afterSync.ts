import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "fs";
import { resolve } from "path";
import { spawnSync } from "child_process";
import { build } from "vite";

import { writeAssetManifest } from "./scripts/asset-manifest.js";

const root = import.meta.dirname;
const workspaceRoot = resolve(root, "../..");
const distDir = resolve(workspaceRoot, "dist");
const preloadOutDir = resolve(root, ".mobile-preload");
const androidAssetsNodeModules = resolve(root, "android/app/src/main/assets/public/node_modules");

function cleanOldPreloadArtifacts() {
	if (!existsSync(distDir)) return;

	for (const name of readdirSync(distDir)) {
		if (/^(preload(?:-.+)?|web-.+|index\.esm-.+)\.js$/.test(name)) {
			rmSync(resolve(distDir, name), { force: true });
		}
	}
}

async function buildPreload() {
	rmSync(preloadOutDir, { recursive: true, force: true });
	cleanOldPreloadArtifacts();

	await build({
		root,
		configFile: false,
		build: {
			outDir: preloadOutDir,
			emptyOutDir: true,
			target: ["chrome91", "safari16.4"],
			sourcemap: false,
			minify: false,
			lib: {
				entry: resolve(root, "src/preload.ts"),
				formats: ["es"],
				fileName: () => "preload.js",
			},
			rollupOptions: {
				output: {
					inlineDynamicImports: true,
					assetFileNames: "preload-[name][extname]",
				},
			},
		},
	});

	mkdirSync(distDir, { recursive: true });
	copyFileSync(resolve(preloadOutDir, "preload.js"), resolve(distDir, "preload.js"));
	rmSync(preloadOutDir, { recursive: true, force: true });
}

function capSync() {
	// 直接用 node 调 Capacitor CLI 的 JS 入口，而不是 shell 里的 `cap`。
	// 原因：Windows 的 `cmd /c cap` 不会去 node_modules/.bin 找可执行文件
	// （那是 POSIX shell 的机制），会报「'cap' 不是内部或外部命令」。
	// 用 node 直调 .js 入口在 Windows / macOS / Linux 上行为一致。
	const cliEntry = resolve(root, "node_modules/@capacitor/cli/bin/capacitor");

	const result = spawnSync(process.execPath, [cliEntry, "sync"], {
		cwd: root,
		stdio: "inherit",
	});

	if (result.status !== 0) {
		throw new Error(
			`cap sync failed with exit code ${result.status ?? "unknown"}${result.error ? `: ${result.error.message}` : ""}`
		);
	}
}

function patchAndroidAssets() {
	const pnpmDir = resolve(androidAssetsNodeModules, ".pnpm");
	const androidSafePnpmDir = resolve(androidAssetsNodeModules, "_pnpm");

	if (!existsSync(pnpmDir)) return;

	if (existsSync(androidSafePnpmDir)) {
		rmSync(androidSafePnpmDir, { recursive: true, force: true });
	}

	renameSync(pnpmDir, androidSafePnpmDir);
}

await buildPreload();

// 生成内置资源清单 dist/asset-manifest.json：
// iOS 侧 WKWebView 不支持目录列举，运行时 getFileList 只能读这份构建期清单；
// 且必须在 cap sync 之前写盘，才会被同步进 iOS 工程。
// 实现见 scripts/asset-manifest.ts —— 该文件同时也是 CI 瘦身步骤的唯一实现，避免两份规则漂移。
console.log(`asset-manifest.json written: ${writeAssetManifest(distDir)} entries`);

capSync();
patchAndroidAssets();
