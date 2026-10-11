/**
 * 无名杀 GitHub Pages 静态 fs 后端（Service Worker shim）
 *
 * 背景：上游 web 版启动时要求同源 fs 后端（/checkFile、/readFile、/getFileList、/writeFile…），
 * 纯静态托管（GitHub Pages）没有后端 → 启动中止「加载内容失败」。
 * 本 shim 在部署时替换 dist/service-worker.js，把这些接口用
 * 「静态文件 + asset-manifest.json + Cache API 覆盖层」仿真出来：
 *   - 读：覆盖层优先 → 静态文件（经 asset-manifest 索引 + 真实 fetch 兜底）
 *   - 写：落在 Cache API 覆盖层（持久、可读回）；删除以墓碑标记（可遮盖静态文件）
 *
 * 行为对齐参考实现 packages/fs/src/index.ts（Fastify 版 noname-server）：
 *   - 所有响应：{ success: boolean, code: number, errorMsg?, data? }（JSON, HTTP 200）
 *   - checkFile/checkDir → "file" | "directory" | {}
 *   - readFile → number[]（字节数组）；readFileAsText → string
 *   - getFileList → { folders: string[], files: string[] }（跳过 "."/"_" 开头项）
 *   - writeFile/removeFile/removeDir/createDir → true
 *   - 路径逃逸（..）→ 报错「只能访问站点目录下的资源」（同 ensureSafe）
 */
const SW_VERSION = "noname-pages-fs-shim v1 (2026-10-11)";
const DEBUG = false;
const OVERLAY_CACHE = "noname-fs-overlay-v1";
const ROUTES = new Set([
	"checkFile",
	"checkDir",
	"readFile",
	"readFileAsText",
	"writeFile",
	"removeFile",
	"removeDir",
	"getFileList",
	"createDir",
]);

const BASE = new URL(self.registration.scope).pathname; // 例如 /noname/
const ORIGIN = self.location.origin;
const OVERLAY_ARC = `${BASE}__fs_overlay__/`; // 覆盖层在 Cache 里的私有命名空间（不会被网络请求）

self.addEventListener("install", event => {
	event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", event => {
	event.waitUntil(self.clients.claim());
	console.log(`[fs-shim] activated: ${SW_VERSION}`);
});

// ---------- 响应工具 ----------
const jsonResponse = obj =>
	new Response(JSON.stringify(obj), {
		status: 200,
		headers: { "content-type": "application/json; charset=utf-8" },
	});
const ok = data => jsonResponse({ success: true, code: 200, data });
const fail = message => jsonResponse({ success: false, code: 400, errorMsg: String(message) });

// ---------- 路径工具 ----------
function normalizePath(input) {
	let s = String(input ?? "").replace(/\\/g, "/");
	while (s.startsWith("./")) s = s.slice(2);
	s = s.replace(/^\/+/, "");
	const parts = [];
	for (const seg of s.split("/")) {
		if (!seg || seg === ".") continue;
		if (seg === "..") {
			if (parts.length === 0) throw new Error("只能访问站点目录下的资源");
			parts.pop();
			continue;
		}
		parts.push(seg);
	}
	return parts.join("/");
}
const fileUrl = path => new URL(BASE + path.split("/").map(encodeURIComponent).join("/"), ORIGIN);
const ancestorsOf = p => {
	const parts = p ? p.split("/") : [];
	const out = [];
	for (let i = 0; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
	return out; // 包含 ""（根）
};

// ---------- 覆盖层（Cache API） ----------
const arcKey = (kind, path) => `${OVERLAY_ARC}${kind}/${encodeURIComponent(path)}`;
const overlayScopePromise = caches.open(OVERLAY_CACHE);
let tombstoneMemo = null; // { files:Set, dirs:Set }，写入/删除后失效

async function overlayFileBytes(path) {
	const cache = await overlayScopePromise;
	const res = await cache.match(arcKey("f", path));
	if (!res) return null;
	return new Uint8Array(await res.arrayBuffer());
}
async function overlayFileExists(path) {
	const cache = await overlayScopePromise;
	return !!(await cache.match(arcKey("f", path)));
}
async function writeOverlayFile(path, bytes) {
	const cache = await overlayScopePromise;
	await cache.put(arcKey("f", path), new Response(bytes));
	await cache.delete(arcKey("t", path));
	for (const dir of ancestorsOf(path)) await cache.delete(arcKey("d", dir));
	tombstoneMemo = null;
}
async function deleteOverlayKey(kind, path) {
	const cache = await overlayScopePromise;
	await cache.delete(arcKey(kind, path));
	tombstoneMemo = null;
}
async function getTombstones() {
	if (tombstoneMemo) return tombstoneMemo;
	const cache = await overlayScopePromise;
	const files = new Set();
	const dirs = new Set();
	for (const req of await cache.keys()) {
		const key = req.url;
		if (!key.startsWith(OVERLAY_ARC)) continue;
		const rest = key.slice(OVERLAY_ARC.length);
		if (rest.startsWith("t/")) files.add(decodeURIComponent(rest.slice(2)));
		else if (rest.startsWith("d/")) dirs.add(decodeURIComponent(rest.slice(2)));
	}
	tombstoneMemo = { files, dirs };
	return tombstoneMemo;
}
async function isTombstoned(path) {
	const { files, dirs } = await getTombstones();
	if (files.has(path)) return true;
	for (const dir of dirs) {
		if (path === dir || path.startsWith(`${dir}/`)) return true;
	}
	return false;
}
async function listOverlayFiles() {
	const cache = await overlayScopePromise;
	const out = [];
	for (const req of await cache.keys()) {
		const key = req.url;
		if (!key.startsWith(`${OVERLAY_ARC}f/`)) continue;
		out.push(decodeURIComponent(key.slice(`${OVERLAY_ARC}f/`.length)));
	}
	return out;
}

// ---------- 静态清单索引 ----------
let indexPromise = null;
function getIndex() {
	if (!indexPromise) {
		indexPromise = (async () => {
			const files = new Set();
			try {
				const res = await fetch(new URL(`${BASE}asset-manifest.json`, ORIGIN));
				if (res.ok) {
					for (const item of await res.json()) files.add(String(item));
				}
			} catch {}
			const dirs = new Set();
			for (const f of files) {
				const parts = f.split("/");
				for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
			}
			return { files, dirs };
		})();
	}
	return indexPromise;
}

async function staticFileExists(path) {
	// manifest 之外的真实静态文件兜底（如 asset-manifest.json / preload.js）
	try {
		const res = await fetch(fileUrl(path), { method: "HEAD" });
		return res.ok;
	} catch {
		return false;
	}
}

// ---------- 各端点实现 ----------
async function checkPath(input) {
	const path = normalizePath(input);
	if (await isTombstoned(path)) return {};
	if (path === "") return "directory";
	if (await overlayFileExists(path)) return "file";
	const { files, dirs } = await getIndex();
	if (files.has(path)) return "file";
	if (dirs.has(path)) return "directory";
	const overlay = await listOverlayFiles();
	if (overlay.includes(path)) return "file";
	for (const f of overlay) {
		if (f.startsWith(`${path}/`)) return "directory";
	}
	if (await staticFileExists(path)) return "file";
	return {};
}

async function readFileBytes(input) {
	const path = normalizePath(input);
	if (await isTombstoned(path)) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
	const overlay = await overlayFileBytes(path);
	if (overlay) return [...overlay];
	const res = await fetch(fileUrl(path));
	if (!res.ok) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
	return [...new Uint8Array(await res.arrayBuffer())];
}

async function readFileText(input) {
	const path = normalizePath(input);
	if (await isTombstoned(path)) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
	const overlay = await overlayFileBytes(path);
	if (overlay) return new TextDecoder().decode(overlay);
	const res = await fetch(fileUrl(path));
	if (!res.ok) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
	return await res.text();
}

async function listDir(input) {
	const path = normalizePath(input);
	const kind = await checkPath(path);
	if (kind === "file") throw new Error("路径不是文件夹");
	if (kind !== "directory") throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);

	const { files, dirs } = await getIndex();
	const overlayFiles = await listOverlayFiles();
	const { files: deadFiles, dirs: deadDirs } = await getTombstones();
	const isDead = p => deadFiles.has(p) || [...deadDirs].some(d => p === d || p.startsWith(`${d}/`));

	const prefix = path ? `${path}/` : "";
	const folders = new Set();
	const fileNames = [];
	for (const f of [...files, ...overlayFiles]) {
		if (prefix && !f.startsWith(prefix)) continue;
		const rest = f.slice(prefix.length);
		if (!rest) continue;
		const seg = rest.split("/");
		if (seg.length === 1) {
			if (!isDead(f)) fileNames.push(seg[0]);
		} else if (!isDead(`${prefix}${seg[0]}`)) {
			folders.add(seg[0]);
		}
	}
	const skip = name => name.startsWith(".") || name.startsWith("_");
	return {
		folders: [...folders].filter(n => !skip(n)).sort(),
		files: fileNames.filter(n => !skip(n)).sort(),
	};
}

async function writeFile(pathInput, dataArray) {
	const path = normalizePath(pathInput);
	if (!path) throw new Error("EEXIST: path is empty");
	if (!Array.isArray(dataArray)) throw new Error("write data must be an array of bytes");
	const bytes = Uint8Array.from(dataArray.map(n => Number(n) & 0xff));
	await writeOverlayFile(path, bytes);
	return true;
}

async function createDir(input) {
	const path = normalizePath(input);
	if (path && (await checkPath(path)) === "file") throw new Error(`EEXIST: ${path} 已存在且不是文件夹`);
	await deleteOverlayKey("d", path);
	return true;
}

async function removeFile(input) {
	const path = normalizePath(input);
	if ((await checkPath(path)) === "directory") throw new Error("不能删除文件夹");
	if (!(await overlayFileExists(path))) {
		const { files } = await getIndex();
		const overlay = await listOverlayFiles();
		if (!files.has(path) && !overlay.includes(path) && !(await staticFileExists(path))) {
			throw new Error(`ENOENT: no such file or directory, unlink '${path}'`);
		}
	}
	await deleteOverlayKey("f", path);
	const cache = await overlayScopePromise;
	await cache.put(arcKey("t", path), new Response("tombstone"));
	tombstoneMemo = null;
	return true;
}

async function removeDir(input) {
	const path = normalizePath(input);
	const kind = await checkPath(path);
	if (kind === "file") throw new Error(`${path} 不是文件夹`);
	if (kind !== "directory") throw new Error(`ENOENT: no such file or directory, rm '${path}'`);
	const cache = await overlayScopePromise;
	for (const f of await listOverlayFiles()) {
		if (path === "" || f === path || f.startsWith(`${path}/`)) await cache.delete(arcKey("f", f));
	}
	const { files: deadFiles } = await getTombstones();
	for (const t of deadFiles) {
		if (path === "" || t === path || t.startsWith(`${path}/`)) await cache.delete(arcKey("t", t));
	}
	await cache.put(arcKey("d", path), new Response("tombstone"));
	tombstoneMemo = null;
	return true;
}

// ---------- fetch 路由 ----------
self.addEventListener("fetch", event => {
	let url;
	try {
		url = new URL(event.request.url);
	} catch {
		return;
	}
	if (url.origin !== ORIGIN) return;
	if (!url.pathname.startsWith(BASE)) return;
	const route = url.pathname.slice(BASE.length);
	if (!ROUTES.has(route)) return; // 其余请求（静态资源等）原样放行
	if (DEBUG) console.log(`[fs-shim] ${event.request.method} ${route} ${url.search}`);
	event.respondWith(handleRoute(route, event.request, url));
});

async function handleRoute(route, request, url) {
	try {
		if (route === "writeFile") {
			if (request.method !== "POST") return fail("writeFile 需要 POST");
			const body = await request.json();
			return ok(await writeFile(body?.path, body?.data));
		}
		const q = url.searchParams;
		switch (route) {
			case "checkFile":
				return ok(await checkPath(q.get("fileName")));
			case "checkDir":
				return ok(await checkPath(q.get("dir")));
			case "readFile":
				return ok(await readFileBytes(q.get("fileName")));
			case "readFileAsText":
				return ok(await readFileText(q.get("fileName")));
			case "getFileList":
				return ok(await listDir(q.get("dir")));
			case "createDir":
				return ok(await createDir(q.get("dir")));
			case "removeFile":
				return ok(await removeFile(q.get("fileName")));
			case "removeDir":
				return ok(await removeDir(q.get("dir")));
			default:
				return fail(`未知路由 ${route}`);
		}
	} catch (error) {
		if (DEBUG) console.warn(`[fs-shim] ${route} 失败:`, error);
		return fail(error && error.message ? error.message : String(error));
	}
}
