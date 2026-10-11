/**
 * 无名杀联机中继（Cloudflare Pages Functions — advanced mode）
 *
 * 用途：让「HTTPS 网页版」能够连接「只有 ws://（未加密）的联机服务器」。
 *   浏览器安全策略禁止从 https 页面直连 ws://（混合内容拦截）——
 *   本中继提供一个 wss:// 入口，把流量透明转发到目标服务器：
 *     wss://<本站>/relay?to=<host>:<port>  →  ws://<host>:<port>
 *
 * 用法（游戏内「联机」输入框）：
 *   wss://noname-cje.pages.dev/relay?to=43.138.118.130:8080
 *
 * 安全与配额：
 *   - 目标端口限制 >= 1024（防滥用连系统/敏感服务）；
 *   - /relay 之外的所有路径仍是纯静态（由 _routes.json 保证，不消耗 Functions 配额）；
 *   - Functions 免费额度 10 万请求/天（WebSocket 按消息计）——小群体联机足够。
 */

export default {
	async fetch(request) {
		const url = new URL(request.url);

		if (url.pathname !== "/relay") {
			return new Response("Not Found", { status: 404 });
		}

		if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("此端点用于中继 WebSocket。用法: wss://<host>/relay?to=<host>:<port>", {
				status: 426,
			});
		}

		const to = (() => {
			let raw = url.searchParams.get("to") || "";
			try {
				// 兼容客户端对 to 做了 URL 编码的情形（未编码字符串 decode 后不变）
				raw = decodeURIComponent(raw);
			} catch {}
			return raw;
		})();
		if (!to) {
			return new Response("缺少 ?to=host:port 参数", { status: 400 });
		}

		let target;
		try {
			target = new URL(`ws://${to}`);
		} catch {
			return new Response("目标地址无效", { status: 400 });
		}
		const port = Number(target.port || 80);
		if (port < 1024) {
			return new Response("出于安全考虑，不允许中继到特权端口（<1024）", { status: 403 });
		}

		// 入站：客户端 <-> Worker
		const pair = new WebSocketPair();
		const [client, server] = Object.values(pair);
		server.accept();

		// 出站：Worker -> 目标服务器（Workers 中出站 WebSocket 亦按 server 风格处理，需要 accept）
		let upstream;
		try {
			upstream = new WebSocket(target.href);
			try {
				upstream.accept();
			} catch {}
		} catch {
			server.close(1011, "无法连接目标服务器");
			return new Response(null, { status: 101, webSocket: client });
		}

		const teardown = () => {
			try {
				server.close();
			} catch {}
			try {
				upstream.close();
			} catch {}
		};

		server.addEventListener("message", (e) => {
			try {
				if (upstream.readyState === 1) upstream.send(e.data);
			} catch {
				teardown();
			}
		});
		upstream.addEventListener("message", (e) => {
			try {
				if (server.readyState === 1) server.send(e.data);
			} catch {
				teardown();
			}
		});
		server.addEventListener("close", teardown);
		upstream.addEventListener("close", teardown);
		server.addEventListener("error", teardown);
		upstream.addEventListener("error", teardown);

		return new Response(null, { status: 101, webSocket: client });
	},
};
