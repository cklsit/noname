import { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
	appId: "com.libnoname.noname",
	appName: "noname",
	webDir: "../../dist",
	plugins: {
		App: {},
		// 安卓 15/16 对 targetSdk 35+ 强制 edge-to-edge，系统栏会浮在 WebView 上层并吃掉
		// 页面顶部那一带的触摸，导致左上角系统按钮（选项/整理手牌/收藏）和选项菜单的
		// 标签栏（武将/扩展等）点不到。这里启动即隐藏系统栏，与旧 Cordova 端默认
		// 隐藏状态栏（show_statusbar_android 默认 false）的行为保持一致。
		//
		// 注意：这是 Capacitor 6 的 `@capacitor/status-bar` 插件配置。
		// Capacitor 8 改用核心的 SystemBars 插件，本仓库为兼容 Intel Mac
		//（最高只能装 Xcode 15 / Capacitor 6）保留旧插件。
		StatusBar: {
			// 让页面内容延伸到状态栏下方（安卓）；iOS 侧恒为叠加式，无此选项
			overlaysWebView: true,
			style: "DARK",
		},
	},
};

export default config;
