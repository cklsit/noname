<h1 align="center">无名杀</h1>

<p align="center">
  <a href="https://github.com/cklsit/noname/actions/workflows/build.yml"><img alt="构建状态" src="https://img.shields.io/github/actions/workflow/status/cklsit/noname/build.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/libnoname/noname/releases/latest"><img alt="上游最新版本" src="https://img.shields.io/github/v/release/libnoname/noname?display_name=tag&style=flat-square"></a>
  <a href="https://github.com/libnoname/noname/graphs/contributors"><img alt="项目贡献者" src="https://img.shields.io/github/contributors/libnoname/noname?style=flat-square"></a>
  <a href="./LICENSE"><img alt="许可证" src="https://img.shields.io/github/license/libnoname/noname?style=flat-square"></a>
</p>

> **本仓库是 [libnoname/noname](https://github.com/libnoname/noname) 的 Fork**，版本 `v1.11.6`。
> 相比上游，本仓库额外提供了 **iOS 平台支持**、**GitHub Actions 云端构建 iOS 安装包**、
> **网页版在线游玩（Cloudflare Pages）** 与 **网页版联机中继** 能力，详见下方「本 Fork 的新增能力」。

---

## 📌 本 Fork 的新增能力

### iOS 平台支持

上游仅在安卓端提供移动端支持，本 Fork 补齐了 iOS（当前维护分支为 **`feat/ios-support`**，基于 **Capacitor 8.1**）：

- 新增 iOS 文件系统适配层（`apps/mobile/src/fs/ios.ts`），存档、扩展、导出文件全部可用
- 双平台统一抽象（`apps/mobile/src/fs/types.ts` / `legacy-api.ts`），安卓与 iOS 共用一套回调式 API 映射
- 解决了 iOS 沙盒的两个关键限制：
  - `WKWebView` 的自定义 scheme **不支持目录列举** → 构建期生成 `asset-manifest.json` 模拟列目录
  - iOS 上 `window.open` 会静默失败 → 改用 `window.location.href`
- 「边玩边下」素材策略：包内**恒定不含**武将原画与语音（合计约 979 MB），进入游戏后自动在后台按需补齐

### GitHub Actions 云端构建 IPA（无需 Mac）

即使**没有 Mac 电脑**（或 Mac 太老装不了新版 Xcode），也能编译出 iOS 安装包：

| 特性 | 说明 |
| --- | --- |
| 构建分支 | **`feat/ios-support`**（`main` 仍是 Capacitor 6.2 旧线，**不要**用它构建） |
| 运行环境 | GitHub 免费提供的 `macos-26` 云端机器（自带 Xcode 26.x） |
| 成本 | **公共仓库完全免费、不限分钟** |
| 产出 | **未签名** `.ipa`，约 **294 MB**，可直接交给 SideStore / AltStore 用你自己的 Apple ID 重签 |
| 触发方式 | 仓库 Actions 页面手动触发（记得把分支切到 `feat/ios-support`），或推送 `ios-v*` 标签自动构建 |
| 资源瘦身 | **恒定**裁掉武将语音与立绘：dist 1.6 GB → 裁剪后约 392 MB → ipa 约 294 MB，以满足侧载工具的体积限制 |

工作流文件：[`.github/workflows/ios-build.yml`](https://github.com/cklsit/noname/blob/feat/ios-support/.github/workflows/ios-build.yml)

> 📖 **完整操作步骤（面向零基础）请阅读：[`无名杀iOS操作手册.md`](https://github.com/cklsit/noname/blob/main/%E6%97%A0%E5%90%8D%E6%9D%80iOS%E6%93%8D%E4%BD%9C%E6%89%8B%E5%86%8C.md)**
>
> 手册内含两条路线的对比（云端构建 / 本地 Mac 构建）、逐步操作指引、素材补齐方式、以及体积限制、报错排查等注意事项。

### 移动端构建命令

```bash
pnpm --filter @noname/mobile build:android   # 生成安卓包
pnpm --filter @noname/mobile build:ios       # 在 Mac 上生成 iOS 包
```

### 网页版在线游玩（Cloudflare Pages）

上游网页版需要自建 `noname-server`（同源文件系统后端）才能完成启动；本 Fork 将其改造为**纯静态托管即可直接游玩**：

- **在线地址：<https://nngame.de5.net/>**（备用：<https://noname-cje.pages.dev/>）—— 打开即玩，无需下载安装
- 部署方式：[`.github/workflows/cloudflare-pages.yml`](https://github.com/cklsit/noname/blob/feat/web-pages/.github/workflows/cloudflare-pages.yml)（推送到 feat/web-pages 自动部署；也可在 Actions 页面手动触发）
- 核心改造：
  - **Service Worker 静态文件系统后端**（[`.github/pages/sw-shim.js`](https://github.com/cklsit/noname/blob/feat/web-pages/.github/pages/sw-shim.js)）：在纯静态环境中仿真上游启动所必需的 `/checkFile`、`/readFile`、`/writeFile` 等接口——读取走「静态文件 + `asset-manifest.json` 索引」，写入（存档、设置）保存在浏览器缓存层
  - **部署路径适配**：`importmap`、文件系统路由与内容包加载路径在构建期统一相对化

> ⚠️ 限制与须知：
> - **存档保存在浏览器本地**：清除浏览器站点数据会丢失存档；不同浏览器 / 设备之间不互通
> - 首次打开会经历数次自动重载（上游 Service Worker 注册行为，属正常现象）
> - 部署为完整版（含全部武将立绘与语音，未做裁剪）

### 网页版联机（中继）

浏览器的安全策略禁止 **HTTPS 页面直连未加密的 `ws://` 联机服务器**（混合内容拦截），而社区联机服务器大多只提供 `ws://`。本 Fork 的网页版联机处理方式：

- **服务器提供加密**：在「联机」输入框填 `wss://服务器地址:端口` 直接连接
- **服务器只有 `ws://`**：**只输服务器地址即可**——客户端会自动经中继转发（默认端口输入 `IP`，非默认端口输入 `IP:端口`）。中继由本 Fork 自建（云端加密隧道 + 中继服务，运行在自有服务器上，对外为**固定地址** `wss://relay.nngame.de5.net/`——地址恒定不变，与容器 / 服务器重启无关）
- 本地版 / 桌面版不受此限制，按原有方式直接填地址即可

> ⚠️ 限制与说明：
> - **地址自动补全**：纯 IP 会自动补上默认端口 `8080`；若目标服务器使用其他端口，请按 `IP:端口` 填写
> - 目标服务器端口需 **≥ 1024**；服务器若启用「未备案域名拦截」（常见于中国大陆云服务商）可能拒绝连接
> - **跨域可达性**：中继流量经云端边缘网络转发，中国大陆玩家通常额外增加约 50~200ms 延迟；对回合制玩法影响很小，可正常游玩
> - 中继流量与并发按小规模朋友联机设计，未做大规模公测的容量保证

---

## 项目使用约定

本项目基于 GPL 3.0 协议开源，使用此项目时请遵守开源协议。  
除此外，希望你在使用代码时已经了解以下额外说明：

1. 打包、二次分发 **请保留代码出处**：<https://github.com/libnoname/noname>
2. 请不要用于商业用途。

## 项目结构

本仓库为 pnpm monorepo，主要目录如下：

| 目录 | 说明 |
| --- | --- |
| `apps/core` | 游戏核心（`noname`，纯前端，Chromium ≥ 91 / Safari ≥ 16.4） |
| `apps/mobile` | 移动端封装（支持 **Android + iOS**；iOS 出包走 **`feat/ios-support`**） |
| `apps/electron` | Electron 桌面端封装 |
| `packages` | 可复用的工具包与扩展 |
| `scripts` | 构建与开发脚本 |
| `docs` | 开发文档（游戏流程、技能格式、皮肤与音频指南等） |
| `.github/workflows` | CI：构建部署、Lint、发布，以及 **iOS 云端构建**、**网页版部署（Cloudflare Pages）** |

## 快速启动

### 环境要求

> **提示：** 请参考 [本地文档](./docs/how-to-start.md) 或 [github文档](https://github.com/libnoname/noname/wiki/%E5%A6%82%E4%BD%95%E8%BF%90%E8%A1%8C%E6%97%A0%E5%90%8D%E6%9D%80%EF%BC%88%E7%A8%8B%E5%BA%8F%E5%91%98%E7%89%88%EF%BC%89) 配置环境。

- [Node.js](https://nodejs.org/) ^20.19.0 || >=22.12.0
- [pnpm](https://pnpm.io/) >= 9
- Webview: Chromium >= 91 || Safari >=16.4.0 (暂不支持Firefox)

### 安装依赖

```bash
pnpm install
```

### 启动

```bash
pnpm dev
```

### 构建

```bash
pnpm build        # 产出 dist/，可直接部署到静态服务器
```

---

贡献代码可阅读相关文档：

[Git 下载安装指南](https://github.com/libnoname/noname/wiki/Git%E4%B8%8B%E8%BD%BD%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97)

[Github 桌面版客户端使用入门](https://docs.github.com/zh/desktop/overview/getting-started-with-github-desktop)

[如何提交代码到《无名杀》Github 仓库](https://github.com/libnoname/noname/wiki/%E5%A6%82%E4%BD%95%E6%8F%90%E4%BA%A4%E4%BB%A3%E7%A0%81%E5%88%B0%E3%80%8A%E6%97%A0%E5%90%8D%E6%9D%80%E3%80%8BGithub%E4%BB%93%E5%BA%93)

[《无名杀》项目 Pull Request 提交规范](https://github.com/libnoname/noname/wiki/%E3%80%8A%E6%97%A0%E5%90%8D%E6%9D%80%E3%80%8B%E9%A1%B9%E7%9B%AE-Pull-Request-%E6%8F%90%E4%BA%A4%E8%A7%84%E8%8C%83)

客户端下载戳这里：

安卓： <https://github.com/nonameShijian/noname-shijian-android/releases/tag/v1.6.8>

PC:  <https://github.com/nonameShijian/noname/releases/tag/v1.75>

网页端推荐使用 Chrome 系内核浏览器游玩，暂不支持 Firefox 浏览器

请尽量保证游玩的 Chrome 系浏览器或手机 Webview 的`内核版本大于等于91`

---

最近有一伙人号称是《无名杀十周年》的开发团队，宣称《无名杀十周年》“全新无名杀，比旧版拥有更多武将，兼容更多扩展”，实际上:

- 《无名杀十周年》（原《无名杀清瑶版》）由无名杀 v1.9.124 修改而来，属于无名杀的一种**Fork**，并非“全新无名杀”；且《无名杀十周年》开发团队**公然违反 GPL-3.0 协议**，详情请看[这里](https://github.com/github/dmca/blob/master/2023/09/2023-09-20-noname.md)、[这里](https://tieba.baidu.com/p/8623890806)以及[这里](https://tieba.baidu.com/p/8624582238)。
- 《无名杀十周年》至今没有更新神典韦等新机制武将，且删除了部分无名杀的原创武将，导致《无名杀十周年》的武将数量远远不及无名杀前几个版本的武将数量；不仅如此，《无名杀十周年》自分裂后的部分武将源码依然来自无名杀和其他开发者开源的代码。
- 《无名杀十周年》兼容扩展的方式是不更新本体数据，从而导致《无名杀十周年》仍然在用 1.9.124 版本的代码，无法兼容使用 1.10 以后功能的扩展；而且《无名杀十周年》开发团队在使用**大量**GPL-3.0 开源的代码后对生成产物进行了**混淆加密**，在**违反开源精神**的同时，也导致扩展稳定性极具下降，更容易出问题。

《无名杀十周年》就是彻头彻尾的骗局，《无名杀十周年》的开发团队更是一群拿无名杀吸血的骗子，虽然号称“不忘初心”，却公然对最有资格论述无名杀创作初心的无名杀创始人进行侮辱谩骂，直接违背其制定的规则和开源精神，恶劣程度远超当初在多个无名杀社群“自立”的水叶之流。

先秦介子推曾言：“窃人之财，犹谓之盗，况贪天之功以为己力乎。”无名杀社区发展至今，正是因为有大量的开源代码进行参考，才能不断推陈出新。试想每个扩展开发者在成为一个扩展开发者之前，谁敢说没有大量参考社区内的源码？每个作品凝聚的都是大家的心血，而不是仅仅归属于个别人。我们相信：开放、共享、多元才是无名杀的初心，绝不是封闭、私藏与趋同。

我们在此呼吁无名杀社区正确认识《无名杀十周年》开发团队的一些行为与做法，并希望《无名杀十周年》开发团队能反省迄今以来的所作所为。**自由开源**是无名杀社区的灵魂，希望各方都能够遵循这一精神。
