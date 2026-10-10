# 无名杀 iOS 操作手册

> **这份手册覆盖三件事：把《无名杀》编译成 iOS 安装包（`.ipa`）→ 装进 iPhone → 补齐武将原画与语音。**  
> 从「完全没做过」到「手机上能玩」，照着做即可；每一步都给了**验证方法**和**出错怎么办**。

**本手册描述的实现位于 `feat/ios-support` 分支**（Capacitor 8 线）。附录里的源码链接都指向该分支；  
若你在 `main` 上浏览，请先切到 `feat/ios-support` 再看代码。

---

## 我该看哪一节？

| 你的情况                       | 看这里                                        |
| -------------------------- | ------------------------------------------ |
| 只想尽快把游戏装到 iPhone 上         | **第 0 节** → **第 3 节**（云端构建）→ **第 6 节**（安装） |
| 有 Mac，想本地出包 / 上架 App Store | **第 4 节**（本地构建）→ **第 6 节**                 |
| 装好了，但没有武将立绘 / 语音           | **第 7 节**（默认自动下，不用你操作）                     |
| 出了报错 / 现象不对                | **第 10 节**（按现象查表）                          |
| 想知道为什么要这么设计                | **第 1 节**（iOS 与安卓的差异）                      |

---

## 0. 30 秒速览

| 项             | 值                                                                 |
| ------------- | ----------------------------------------------------------------- |
| 本仓库           | `https://github.com/cklsit/noname`                                |
| **构建分支**      | **`feat/ios-support`**（Capacitor **8.1**，用 Swift Package Manager） |
| 旧线，**不要**用来构建 | `main` —— 仍是 Capacitor **6.2**，且没有资源瘦身步骤、没有「边玩边下」                 |
| 产物            | **未签名** `.ipa`，约 **294 MB**                                       |
| 签名            | 交给 SideStore / AltStore 用**你自己的 Apple ID** 重签，无需开发者账号             |
| 素材策略          | 包内**恒定不含**武将原画 / 技能语音 / 阵亡语音（合计约 979 MB），由游戏内「边玩边下」按需补齐           |
| 花费            | 公共仓库的 GitHub Actions 完全免费；本地构建免费；Apple 免费账号签名可用                   |

> ⚠️ **最容易犯的错：在 Actions 网页点 `Run workflow` 时忘记切分支。**  
> 默认跑的是 `main`（旧线），出来的包和预期完全不同。**必须手动把分支切成 `feat/ios-support`**（见 3.2）。

---

## 1. 先读：iOS 版和安卓版有什么不同

不理解这四条，排障时会完全找不到方向。

### 1.1 文件系统：iOS 是沙盒，不需要「选目录」

|         | Android                       | iOS               |
| ------- | ----------------------------- | ----------------- |
| 机制      | SAF（Storage Access Framework） | 应用沙盒              |
| 可写位置    | 用户手动授权的目录                     | 沙盒内的 `Documents/` |
| 是否要授权流程 | 要                             | **不要**            |

iOS 上分成两层：

- **只读层**：随 App 打包的内置资源，由 Capacitor 在 `capacitor://localhost` 下提供；
- **可写层**：沙盒里的 `Documents/`，存档、扩展、素材、导出文件都在这里。

读取遵循**覆盖层**语义：先查可写层，命中就返回；否则回退到内置资源。  
所以「放进去的文件覆盖内置文件，删掉就还原」——这也是第 7.3 节手动导入能生效的原因。

> **为什么可写层根目录就是 `Documents/` 本身（而不是它的某个子目录）？**  
> 一是和安卓对齐（安卓 SAF 里用户选的那个目录就是游戏根目录，没有中间层）；  
> 二是方便手动导入——iOS「文件」App 暴露的正是 `Documents/`，根目录对齐后，  
> 你可以直接在「文件」里按 `image/character`、`audio/skill`、`extension` 的层级放东西。

### 1.2 覆盖层有两层，缺一不可

上面那层只覆盖了**走游戏文件 API 的读写**（`game.readFile` / `game.writeFile` …）。  
但游戏加载扩展用的是 `<script src="...">`，走的是 **WebView 的网络请求**，不经过 `game.*` API。

所以还需要第二层——**请求层覆盖层**：

|      | Android                                           | iOS                                |
| ---- | ------------------------------------------------- | ---------------------------------- |
| 拦截机制 | `WebViewAssetLoader` + `JsAwareAssetsPathHandler` | `WKURLSchemeHandler`（Capacitor 内置） |
| 扩展点  | `PathHandler.handle(path)`                        | `NonameRouter.route(for:)`         |
| 命中判断 | SAF 里存在该文件                                        | `Documents/` 下存在该文件                |

两层的效果合起来才是：**用户放在 `Documents/` 里的任何文件，游戏都能读到**，  
不必重装、不必改任何游戏代码。

### 1.3 即时编译（JIT）在 iOS 上自动降级

游戏有个可选的「即时编译功能」，依赖 `service worker`；**iOS 的 WKWebView 不支持 service worker**，  
因此该功能在 iOS 上不可用。现在检测到 iOS WebView 时**静默跳过**，不弹「无法启用即时编译功能」的框。

> 如果你看到这个弹框，说明跑的仍是旧版 `game.js` —— 重新执行 `pnpm build` 即可。

### 1.4 目录列举：靠 `asset-manifest.json`

游戏启动要「列目录」扫描有哪些武将、卡牌、模式（`getFileList`）。  
安卓有真实文件系统可以直接列；**iOS 的 WKWebView 出于安全限制不提供目录列举能力**。

因此构建阶段会生成一份资源清单 `dist/asset-manifest.json`（记录全部文件的相对路径），随包发布，  
运行时 `getFileList` 读它来模拟列目录。

> ⚠️ **手动裁剪过 `dist/` 下的资源后，必须重新执行 `pnpm --filter @noname/mobile sync` 重建清单**，  
> 否则游戏会去找已经被删掉的文件。

---

## 2. 环境要求

### 2.1 只走云端构建（路线 A）——**不需要装任何东西**

你只需要一个 GitHub 账号和一台能上网的设备（手机也行）。

### 2.2 还要走本地构建（路线 B）

| 项目      | 要求                                                                  |
| ------- | ------------------------------------------------------------------- |
| 电脑      | **Apple Silicon Mac**（见下方提示）                                        |
| macOS   | 支持 Xcode 26.0+ 的版本                                                  |
| Xcode   | **26.0+**（Capacitor 8 起改用 Swift Package Manager，**不再需要 CocoaPods**） |
| Node.js | `^20.19.0 \|\| >=22.12.0`（CI 上用的是 Node 24）                          |
| pnpm    | `>= 9`，用 `corepack enable pnpm` 启用                                  |
| 磁盘      | 建议 ≥ 20 GB 空闲                                                       |

> 💡 **Xcode 26 起 Apple 不再支持 Intel Mac。** Intel 机器最高只能装 Xcode 15.x，  
> 无法用于本仓库当前的 Capacitor 8 工程。**这类机器请走路线 A 云端构建**（不需要你本地有 Mac）。

装好 Xcode 后先打开一次同意许可协议，然后验证：

```bash
xcodebuild -version        # 应输出 Xcode 26.x
```

若提示 `xcode-select: error`：

```bash
sudo xcode-select -s /Applications/Xcode.app
```

---

## 3. 路线 A：云端构建 ipa（推荐，无需 Mac）

### 3.1 原理

GitHub 为公共仓库免费提供 macOS 云主机（Apple Silicon）。工作流  
`.github/workflows/ios-build.yml` 自动完成：

```
装 Node/pnpm → 编译网页资源 → 生成资源清单 → 同步进已提交的 Xcode 工程
  → 编译（不签名）→ 组装 Payload → 打包成 .ipa → 上传 Artifact / Release
```

因为**不签名**，托管在 GitHub 上不需要任何 Apple 账号或证书。签名交给侧载工具在你的 Apple ID 下完成。

### 3.2 逐步操作

1. 打开本仓库的 **Actions** 页面：`https://github.com/cklsit/noname/actions`
2. 左侧点 **Build unsigned iOS IPA**
3. 右侧点 **Run workflow**。**最关键的一步**：把 **Use workflow from** 从 `main` 改成  
   **`feat/ios-support`**
4. 填写参数：
   | 选项               | 建议值  | 说明                      |
   | ---------------- | ---- | ----------------------- |
   | `retention_days` | `14` | 产物在 GitHub 上保留多少天（1–90） |
   | `create_release` | ✅ 勾上 | 同时发布到 Release 页面，方便长期下载 |
5. 点绿色 **Run workflow**，刷新页面就能看到新的运行；点进去有实时日志。

> **武将原画与语音没有开关。** 工作流里 “Strip character art and voice” 步骤**恒定执行**，  
> 只保留 3 张必需的默认剪影，并重建资源清单。被裁掉的资源改由「边玩边下」补齐（见第 7 节）。

**验证**：运行约 4–8 分钟后应为绿色 ✅。若失败，点进去看最后一个红色步骤，对照第 10 节排查。

### 3.3 用 tag 自动构建（可选）

```bash
git tag ios-v1.0.0
git push origin ios-v1.0.0
```

推送 `ios-v*` 格式的标签会自动触发构建，Release 标签就是该 tag 名。

### 3.4 拿到产物

| 方式            | 位置                           | 说明                                  |
| ------------- | ---------------------------- | ----------------------------------- |
| **Artifacts** | 任务页面底部 `noname-ios-unsigned` | zip，解压后是 `.ipa`；到期会被清理              |
| **Release**   | 仓库 Release 页面                | 文件名 `noname-ios-unsigned.ipa`，长期可下载 |

> ⚠️ 产物是**未签名**的 `.ipa`，**不能双击直接安装**，必须经过 SideStore / AltStore 重签（见第 6 节）。

### 3.5 关于仓库体积（为什么有时会失败）

《无名杀》的 Git 历史非常庞大（十几年累积，大量 mp3 / jpg 直接提交进历史），完整克隆需要 TB 级磁盘。  
工作流为此做了三重防护：

1. `fetch-depth: 1` —— 只拉取最新 1 个提交；
2. 每步打印磁盘剩余空间；
3. 编译前体检，剩余空间不足 5 GB 时直接给出明确报错。

如果仍因磁盘问题失败，可考虑维护一个只存放构建产物的轻量仓库专门用于出包。

---

## 4. 路线 B：本地 Mac 构建

> 前提：你的 Mac 满足第 2.2 节的要求（**Apple Silicon + Xcode 26.0+**）。

### 4.1 获取代码并安装依赖

```bash
git clone https://github.com/cklsit/noname.git
cd noname
git checkout feat/ios-support      # 必须切到这个分支
pnpm install
```

### 4.2 确认 iOS 工程存在

`apps/mobile/ios/` **已随仓库提供**（与 `android/` 一样纳入版本管理），克隆下来即可直接构建，  
**不需要**执行 `npx cap add ios`。

```bash
ls apps/mobile/ios/App/App/*.swift
# AppDelegate.swift  NonameBridgeViewController.swift  NonameRouter.swift
```

> 仅在工程被误删时才需要重建。注意 `npx cap add ios` 会生成一份**官方默认模板**，  
> 上面两个 `Noname*.swift` 会丢失，需要从 Git 恢复：`git checkout -- apps/mobile/ios`。

### 4.3 查询 Team ID

1. 打开 <https://developer.apple.com/account>
2. 进入 **Membership details**，找到 **Team ID**（10 位字符）

> **没有付费开发者账号（$99/年）也可以。** 免费 Apple ID 照样能出 `.ipa`，只是签名 **7 天过期**、  
> 最多 3 台设备，自用测试足够。免费账号的 Team ID 在 Xcode 的 `Settings → Accounts` 里就能看到  
> （显示为 `你的名字 (Personal Team)`）。

### 4.4 一键构建

在 `apps/mobile` 目录执行：

```bash
cd apps/mobile
pnpm build:ios -- --team=<你的TeamID>
```

脚本依次完成：构建网页资源 → `cap sync`（含资源清单生成）→ `xcodebuild archive` → 导出 `.ipa`。

产物路径：

```
apps/mobile/ios/build/export/<AppName>.ipa
```

### 4.5 可选参数

| 参数                           | 作用                            |
| ---------------------------- | ----------------------------- |
| `--method=development`       | 默认，适合侧载（SideStore / AltStore） |
| `--method=ad-hoc`            | 需先在 Apple 后台登记设备 UDID         |
| `--method=app-store-connect` | 用于上架 App Store 或 TestFlight   |
| `--configuration=Release`    | 出正式版（体积更小、运行更快），默认 Debug      |
| `--skip-web-build`           | 复用已有 `dist`，不重新构建网页部分         |

> **想打一个「素材齐全」的包**（例如模拟器调试、上架前回归）：  
> `pnpm build && pnpm --filter @noname/mobile sync`，再直接对 `apps/mobile/ios` 出包。  
> 这样包内会带上完整的武将原画与语音。

---

## 5. 资源体积与裁剪

### 5.1 实测体积

| 项目                       | 大小                    |
| ------------------------ | --------------------- |
| 完整资源（`dist/`）            | 约 **1.6 GB**          |
| └ `audio/skill` 技能语音     | **474 MB**            |
| └ `image/character` 武将立绘 | **393 MB**            |
| └ `audio/die` 阵亡语音       | **112 MB**            |
| └ 其余（背景 / 表情 / 卡牌 / 代码…） | 约 600 MB              |
| **裁剪三大目录后**（未压缩）         | 约 **392 MB**          |
| **产出的 ipa**              | 约 **294 MB**（281 MiB） |

### 5.2 相关限制

- AltStore / SideStore 安装**超过 300 MB** 的 `.ipa` 时容易报 `Bad Allocation`；
- Apple 对**未压缩 App** 的硬上限是 **4 GB**；
- 本地编译 1.6 GB 的工程很慢，且至少需要 20 GB 空闲磁盘。

**被裁掉的三个目录**（合计约 979 MB）：

| 裁剪内容              | 体积     | 影响           |
| ----------------- | ------ | ------------ |
| `audio/skill`     | 474 MB | 武将技能无配音，其他正常 |
| `image/character` | 393 MB | 武将显示默认剪影     |
| `audio/die`       | 112 MB | 阵亡无配音        |

> ⚠️ `image/character` 里的 `default_silhouette_*` 是**游戏必需**的默认剪影，不能整目录删干净，  
> 否则没有立绘的武将会显示破图。

### 5.3 两条路线怎么裁

- **路线 A（云端构建）**：工作流里的 “Strip character art and voice” 步骤**恒定执行**，没有开关。  
  它只保留必需的 3 张默认剪影，并重建资源清单。你不需要做任何事。
- **路线 B（本地构建，可选）**：若你也想让本地包瘦身，手动删除上述目录后  
  **必须重新执行 `pnpm --filter @noname/mobile sync`** 重建 `asset-manifest.json`，  
  否则游戏会去找已删除的文件。

---

## 6. 装进 iPhone（SideStore / AltStore）

以 **SideStore** 为例：

1. **把 `.ipa` 传到手机上** —— AirDrop 最方便（Mac → iPhone）；
2. 打开 **SideStore**，点 `+`，选择那个 `.ipa`；
3. 等待安装完成，桌面会出现《无名杀》图标。

**验证**：图标出现后点开，能进首页即成功。

> **7 天过期**：免费账号签名的应用**每 7 天需要重新签名一次**。SideStore 会在充电 + 连接 Wi-Fi 时  
> **自动续签**，所以平时不用管；如果图标变灰打不开，打开 SideStore 手动刷新一次即可。

> 首次启动后建议直接去「菜单 → 其它 → 更新 → 下载素材」看一眼进度（见 7.2）。

---

## 7. 素材补齐（武将原画与语音）

包内不含 `audio/skill`、`audio/die`、`image/character` 三大目录（见第 5 节），  
结果是武将**没有立绘、没有配音**。共有**三条互补路径**，前两条全自动、第三条手动。

### 7.1 边玩边下（默认，无需任何操作）

游戏用到某个武将的立绘或语音、而本地没有时，**只把那一个文件**取回来。  
首次遇到某个武将会多出零点几秒等待，之后**永久命中本地**。

- 适用范围：只处理被裁掉的三个前缀（`image/character/`、`audio/skill/`、`audio/die/`）；  
  打包保留的 `default_silhouette_*` 不参与。
- **画面上没有任何提示** —— 这件事发生在你打牌的过程中，任何浮层都会挡住牌桌，  
  所以刻意不做界面反馈，进度只写 `console`。
- 不重复下载：会话内记住「已确认存在 / 已确认拿不到」；同一路径并发只下一次；  
  `404` 视为上游确实没有，不再换源重试。

> **对局刚开始时卡一下是正常的**，就是它在下载本局用到的立绘/语音，仅首次出现。

### 7.2 批量下载（游戏启动后自动开始）

游戏启动约 **6 秒后**（等首屏跑完）会**自动**开始批量补齐，**不需要你点任何按钮** ——  
侧载包缺的正是这约 979 MB 素材，静默补完即可。**已经补齐过就跳过**，不会每次启动白跑。

想查看进度或中途停止：

> **菜单 → 其它 → 更新 → 下载素材**

| 面板上的东西     | 含义                                                         |
| ---------- | ---------------------------------------------------------- |
| **素材就绪进度** | `已就绪 / 总数`（约 1.2 万项），包含内置已有项；按「边玩边下 + 批量下载」**共用**的记录算，每秒刷新 |
| 状态行        | 本次下载正在做什么（源、清单来源、失败数…）                                     |
| **主按钮**    | 运行中显示 **停止下载**；空闲时是「开始下载 / 重新下载」                           |
| **测试连接**   | 逐个探测各下载源并列出 HTTP 状态，用来判断「哪个域名不通」                           |

- 点 **停止下载** 只终止**本次**下载；下次启动游戏会重新开始，  
  已经下过的靠 `checkFile` 跳过，所以是**接着下**而不是从头再来。
- 整个过程**静默**：画面上不会有任何提示，进度只体现在这个面板与 `console`。

**实现要点**（想改代码时看）：

| 关注点       | 做法                                                                                                                |
| --------- | ----------------------------------------------------------------------------------------------------------------- |
| 为什么能下到    | 从上游 `libnoname/noname` 的 `main` 分支取文件，写进 `Documents/`；靠 1.2 节的两层覆盖层直接生效                                           |
| 文件清单      | **首选构建期内置的 `asset-download-manifest.json`**（实测 **12048** 条，随包发布，完全离线）。仅在它缺失时才回退到 `api.github.com` 的 Git Trees API |
| 文件内容      | 按顺序尝试多个源，第一个成功即用：GitHub Raw → jsDelivr → jsDelivr(Fastly) → jsDelivr(Gcore)。某源连续失败 5 次自动切换                        |
| 上游路径前缀    | `apps/core/`（注意不是仓库根目录）                                                                                           |
| 本地落盘路径    | 去掉前缀后写入，例如 `image/character/zhaoyun.jpg` → `Documents/image/character/zhaoyun.jpg`                                |
| 断点续传      | 有历史记录时逐个 `checkFile` 跳过已下载项，因此「停止后再点」是续传而非重下                                                                      |
| iCloud 备份 | `Documents/` 默认进 iCloud 备份。补齐约 979 MB 素材后，备份体积也会相应增长                                                              |

> **⚠️ 改代码时务必注意：写入时传原始字节，不要自己先转 base64。**  
> `game.writeFile` 的 `data` 参数传**字符串**会被当作文件内容做 UTF-8 编码；  
> 只有传 `ArrayBuffer` / `Blob` / `ArrayBufferView` 才按二进制落盘。  
> 曾经因为传了 base64 字符串，导致下载全部「成功」但原画与语音一个都出不来。  
> 另外，**只要写入格式变了就必须把 `WRITE_FORMAT_VERSION` 加一**，否则用户机器上旧格式  
> 写出的坏文件会被续传逻辑永久当成「已下载」。

### 7.3 手动导入（用「文件」App）

iOS 版开启了文件共享，可以直接用系统「文件」App 打开游戏目录：

> **「文件」App → 浏览 → 我的 iPhone → 无名杀**

目录结构与游戏内部路径一一对应：

```
无名杀/
├── 使用说明.txt          首次启动自动生成
├── image/character/     武将立绘（文件名 = 武将 ID，如 zhaoyun.jpg）
├── audio/skill/         技能语音（文件名 = 技能 ID，如 benghuai.mp3）
├── audio/die/           阵亡语音（文件名 = 武将 ID，如 zhaoyun.mp3）
└── extension/           扩展（每个扩展一个文件夹，文件夹名即扩展名）
```


这四个目录在 App **首次启动时自动建好**。放进去的文件会**覆盖**内置同名资源，删掉即还原，
所以只补一部分也可以。

| 放进去的东西 | 何时生效 |
| --- | --- |
| 立绘 / 语音（静态资源） | 下次读取即生效 |
| 新武将包 / 扩展 | 需要**重启游戏**重新扫描 |

> 不需要额外的「导入」按钮：游戏本来就跑在覆盖层上，只要文件出现在 `Documents/`
> 的对应位置，下一次读取就会命中。

### 7.4 素材补充包（上游没有的素材）

手机端「边玩边下」只能从**上游官方仓库**取文件，**上游没有的永远下不到**。
实测上游约 78 个武将没有原画（例如势曹爽、势陈矫、势陈群等）。这部分要靠一个**素材补充包**补齐：

> **📦 下载：[noname-ios-materials.zip](https://github.com/cklsit/noname/releases/download/ios-materials-v1/noname-ios-materials.zip)**（约 33 MB）
> 含 **39 张立绘 + 458 段技能语音 + 91 段阵亡语音**，解压后约 39 MB。

包内结构：

```
无名杀素材补充/
├── image/character/      39 张立绘
├── audio/skill/          458 段技能语音
├── audio/die/            91 段阵亡语音
└── 使用说明.md
```

**导入方法（全程在手机上完成，不需要电脑）**：

1. 用手机浏览器打开上面的下载链接，下载 `noname-ios-materials.zip`；
2. 打开「**文件**」App → **下载项** → 点这个 zip，自动解压出 `无名杀素材补充/`；
3. 进入 `无名杀素材补充/image/character/` → 右上角「…」→ **全选** → **拷贝**；
   再到「**我的 iPhone → 无名杀 → image/character**」→ 空白处长按 → **粘贴**；
4. `audio/skill/`、`audio/die/` 同样操作；
5. **完全退出游戏再重开**（不要只切后台）。

> 包内《使用说明.md》有更细的逐步说明。
> ⚠️ 别往 `image/character/` 放 `default_silhouette_*`，那三张是全局兜底图。

**这个包是怎么来的**：从第三方整合包（社区流传的「懒人包」等）的 `resources/app/` 里，
筛出「上游仓库完全没有同名文件」的那些。**不是本项目原创素材**，仅供个人自用补齐。

> ℹ️ 它**不在仓库的 git 历史里**（`git log` 可证 `使用说明.md` 从未入库），
> 而是作为 **Release 附件**发布 —— 这样手机浏览器能直接下载。
> 如果你在仓库的文件树里翻找，是找不到的。

---

## 8. 每日自动同步上游

`.github/workflows/sync-upstream.yml` 每天 **UTC 16:00（北京时间 0 点）**执行：

1. 比较上游 `libnoname/noname` 与 fork 的两个分支；
2. 有更新就调 `merge-upstream` 合并，无更新直接跳过；
3. 用 matrix **同时覆盖 `main` 与 `feat/ios-support`**（两者都必须同步，缺一不可）。

> **为什么两个分支都要同步**：iOS 包的**批量下载清单**是按「构建分支自己的资源」生成的。
> 功能分支落后上游 → 上游新增的文件永远进不了清单，玩家点「下载素材」补不到。
> （「边玩边下」不受影响，它按路径直取上游。）

### SYNC_TOKEN

GitHub 内置令牌**无权创建或修改 `.github/workflows/` 下的文件**（权限清单里也没有这一项）。
上游一旦改到工作流，那次合并会被拒（422 `without 'workflows' permission`）。
因此配了一个仓库 secret **`SYNC_TOKEN`**（PAT，需要 `Contents: Read and write` +
`Workflows: Read and write`）。

| 运行日志里显示 | 含义 |
| --- | --- |
| `当前使用 SYNC_TOKEN（身份：<用户名>）` | PAT 生效 ✅ |
| `当前使用内置 GITHUB_TOKEN` | PAT 没配上（上游只改普通文件时也能用） |

- **没配也能用**（多数日子上游只改普通文件），失败时有明确中文报错，
  手动去网页点一次 **Sync fork** 即可。
- 建议用**细粒度令牌**：`Repository access` 只选本仓库，权限只给上面两项。

> ⚠️ 定时任务可能**延迟数小时**（GitHub 调度器的已知问题，非配置错误）。
> 需要立刻同步时，去 Actions 页面手动 `Run workflow` 即可，秒级触发。

---

## 9. 项目结构与本 Fork 新增能力

### 9.1 项目结构

本仓库为 pnpm monorepo：

| 目录 | 说明 |
| --- | --- |
| `apps/core` | 游戏核心（包名 `noname`，纯前端；Chromium ≥ 91 / Safari ≥ 16.4） |
| `apps/mobile` | 移动端封装（**Capacitor 8**，支持 **Android + iOS**） |
| `apps/electron` | Electron 桌面端封装 |
| `packages` | 可复用的工具包与扩展 |
| `scripts` | 构建与开发脚本 |
| `docs` | 开发文档（游戏流程、技能格式、皮肤与音频指南等） |
| `.github/workflows` | CI：构建部署、Lint、发布，以及 **iOS 云端构建** |

### 9.2 本 Fork 相比上游新增了什么

上游 `libnoname/noname` 只在安卓端提供移动端支持。本 Fork 额外做了两件事：

**① iOS 平台支持**（通过 Capacitor 8）

- 新增 iOS 文件系统适配层 `apps/mobile/src/fs/ios.ts`，存档、扩展、导出文件全部可用；
- 双平台统一抽象（`fs/types.ts` / `fs/legacy-api.ts`），安卓与 iOS 共用一套回调式 API 映射；
- 解决 iOS 沙盒的两个关键限制：**不接受目录列举**（→ 构建期生成 `asset-manifest.json`）、
  **`window.open` 静默失败**（→ 改用 `window.location.href`）；
- 新增**请求层覆盖层**（`NonameRouter.swift`），让 `<script src>` 加载的扩展也能读到用户文件。

**② GitHub Actions 云端构建 IPA（无需 Mac）**

| 特性 | 说明 |
| --- | --- |
| 运行环境 | GitHub 免费提供的 `macos-26` 云端机器（Apple Silicon，自带 Xcode 26.x） |
| 成本 | **公共仓库完全免费、不限分钟** |
| 产出 | **未签名** `.ipa`，交给 SideStore / AltStore 用你自己的 Apple ID 重签 |
| 触发 | Actions 页面手动触发，或推送 `ios-v*` 标签自动构建 |
| 资源瘦身 | 恒定裁掉语音与立绘，把包体压到约 294 MB，满足侧载工具的体积限制 |

### 9.3 移动端构建命令

```bash
pnpm --filter @noname/mobile build:android   # 生成安卓包
pnpm --filter @noname/mobile build:ios       # 在 Mac 上生成 iOS 包（见 4.4）
```

---

## 10. 常见问题（按现象查）

| 现象 / 报错 | 原因与解决 |
| --- | --- |
| `xcodebuild: command not found` | Xcode 未安装或未打开过；先打开一次 Xcode，再执行 `sudo xcode-select -s /Applications/Xcode.app` |
| `No signing certificate` | Team ID 填错，或 Apple ID 未在 Xcode 中登录 |
| `Unable to find a destination` | 缺 iOS 平台支持，执行 `xcodebuild -downloadPlatform iOS` |
| `Bad Allocation` | `.ipa` 过大导致侧载失败，见第 5 节裁剪资源 |
| `iOS project not found` | `apps/mobile/ios/` 工程缺失，执行 `git checkout -- apps/mobile/ios` 恢复 |
| 构建跑完但包「和预期完全不一样」 | **分支选错了**：默认跑的是 `main`（旧线）。必须在 Run workflow 时把分支切成 `feat/ios-support`（见 3.2） |
| 构建失败在 “Build unsigned archive” | 多数是磁盘不足（日志里会打印剩余空间与明确报错）；或 Xcode 版本低于 26.0 |
| 武将没有立绘 / 技能与阵亡没有语音 | 第一次遇到某个武将时会**按需下载**（7.1），几秒内自动出现；若是「刚开局就一片空白且迟迟不出现」，说明网络拿不到素材——进「菜单 → 其它 → 更新 → 下载素材」点 **测试连接** 看哪个源不通 |
| 对局刚开始时卡一下（画面上没有任何提示） | 这是**边玩边下**在下载该武将在本局用到的立绘/语音。刻意不弹提示以免遮挡牌桌，仅首次出现 |
| 想暂停 / 关掉素材下载 | 「菜单 → 其它 → 更新 → 下载素材」→ **停止下载**。只对本次生效；下次启动会接着下（已下过的跳过） |
| 素材进度条长时间不动 / 一直 0% | 确认已联网（建议 Wi-Fi）；点 **测试连接** 看是否有源可用。若是刚装完，首次要下约 979 MB，需要时间 |
| 「文件」App 里明明放了文件，游戏读不到 | 层级放错了。必须是 `Documents/<image\|audio\|extension>/...`，见 7.3 |
| 「文件」App 里有个别武将仍显示剪影 | 上游本身就没有该武将的原画（约 78 个）。用第 7.4 节的素材补充包导入 |
| 导入文件时列表里的文件是**灰色、点不动** | iOS 的「文件」选择器会按 `accept` 严格过滤，且没有「显示全部文件」的逃生入口。已在 iOS 上统一去掉 `accept` 修掉；若文件在 iCloud 上未下载，仍需先点一下让它下载 |
| 扩展加载不了 / 用户放的扩展不生效 | 请求层覆盖层（`NonameRouter`）未生效。确认 `Main.storyboard` 的初始 ViewController 是 `NonameBridgeViewController`，且该 Swift 文件已加入 Xcode 工程的编译目标 |
| 游戏启动时弹出「无法启用即时编译功能」 | 当前运行的仍是旧版 `game.js`。重新构建网页资源（`pnpm build`）让 JIT 降级逻辑生效 |
| 菜单 / 顶部按钮点不动 | 系统栏（状态栏、导航栏）浮层吃掉了触摸事件。确认 `capacitor.config.ts` 中 `SystemBars.hidden` 为 `true`，且未启用 `contentInset` |
| 游戏能启动但读不到武将 / 卡牌 | `asset-manifest.json` 缺失或未随资源裁剪更新，重新执行 `pnpm --filter @noname/mobile sync` |
| 首页黑屏 / 加载失败 | 自定义 `Router` 的 fallback 逻辑必须与官方 `CapacitorRouter` 逐字对齐（无扩展名的路径要回退到 `index.html`），改动该文件时不要凭直觉改 |
| **在 GitHub 仓库里找不到《使用说明.md》/「无名杀素材补充」** | **不是 bug**：它不在仓库文件树里，而是挂在 **Release** 上（[下载链接](https://github.com/cklsit/noname/releases/download/ios-materials-v1/noname-ios-materials.zip)）。手机自带浏览器打开即可下载，步骤见 7.4 |

---

## 11. 许可与出处

本项目基于 **GPL-3.0** 协议开源，使用此项目时请遵守开源协议。此外：

1. 打包、二次分发**请保留代码出处**：<https://github.com/libnoname/noname>
2. **请不要用于商业用途。**

本仓库是 [`libnoname/noname`](https://github.com/libnoname/noname) 的 Fork。
上游项目说明与社区文档：

- [如何运行无名杀（程序员版）](https://github.com/libnoname/noname/wiki/%E5%A6%82%E4%BD%95%E8%BF%90%E8%A1%8C%E6%97%A0%E5%90%8D%E6%9D%80%EF%BC%88%E7%A8%8B%E5%BA%8F%E5%91%98%E7%89%88%EF%BC%89)
- [Git 下载安装指南](https://github.com/libnoname/noname/wiki/Git%E4%B8%8B%E8%BD%BD%E5%AE%89%E8%A3%85%E6%8C%87%E5%8D%97)
- [如何提交代码到《无名杀》仓库](https://github.com/libnoname/noname/wiki/%E5%A6%82%E4%BD%95%E6%8F%90%E4%BA%A4%E4%BB%A3%E7%A0%81%E5%88%B0%E3%80%8A%E6%97%A0%E5%90%8D%E6%9D%80%E3%80%8BGithub%E4%BB%93%E5%BA%93)
- [Pull Request 提交规范](https://github.com/libnoname/noname/wiki/%E3%80%8A%E6%97%A0%E5%90%8D%E6%9D%80%E3%80%8B%E9%A1%B9%E7%9B%AE-Pull-Request-%E6%8F%90%E4%BA%A4%E8%A7%84%E8%8C%83)

**其他平台客户端**（非本 Fork 产物，来自社区）：

- 安卓：<https://github.com/nonameShijian/noname-shijian-android/releases/tag/v1.6.8>
- PC：<https://github.com/nonameShijian/noname/releases/tag/v1.75>

> 网页端推荐使用 Chrome 系内核浏览器（内核版本 ≥ 91），暂不支持 Firefox。

---

## 附录 A：相关实现文件

> 全部位于 `feat/ios-support` 分支；下表用分支限定的完整链接，从任何地方点开都能看到。

| 文件 | 作用 |
| --- | --- |
| [`src/preload.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/preload.ts) | 平台分流入口：按 `Capacitor.getPlatform()` 选择文件系统实现，安装 `game.*` API |
| [`src/fs/ios.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/fs/ios.ts) | iOS 文件系统实现（沙盒覆盖层 + 内置资源清单列举） |
| [`src/fs/types.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/fs/types.ts) | 跨平台共用的 `NativeFileSystem` 接口与工具函数 |
| [`src/fs/legacy-api.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/fs/legacy-api.ts) | 把 `NativeFileSystem` 映射为游戏所需的回调式 `game.*` API |
| [`src/lazy-assets.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/lazy-assets.ts) | **边玩边下**（默认）：用到立绘/语音而本地没有时就地按需下载，并让界面/音频重新取到它 |
| [`src/asset-download.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/asset-download.ts) | **批量补充下载**：启动后自动补齐，并在「菜单 → 其它 → 更新」提供停止/重试面板；同时对外提供两者共用的多源下载与写盘函数 |
| [`src/ios-file-input.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/src/ios-file-input.ts) | **放宽文件选择器**：iOS 按 `accept` 严格过滤且无逃生入口，这里统一去掉 `accept` |
| [`ios/App/App/NonameBridgeViewController.swift`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/ios/App/App/NonameBridgeViewController.swift) | 继承 `CAPBridgeViewController`，重写 `router()` 挂上自定义路由器 |
| [`ios/App/App/NonameRouter.swift`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/ios/App/App/NonameRouter.swift) | **请求层覆盖层**：让 `<script src>` / `fetch` 也能读到 `Documents/` 中的用户文件 |
| [`ios/App/App/Base.lproj/Main.storyboard`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/ios/App/App/Base.lproj/Main.storyboard) | 初始 ViewController 指向 `NonameBridgeViewController` |
| [`buildIos.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/buildIos.ts) | 本地 Mac 一键构建脚本 |
| [`afterSync.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/afterSync.ts) | `cap sync` 前置步骤：打包 preload、生成 `asset-manifest.json` 与 `asset-download-manifest.json` |
| [`capacitor.config.ts`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/capacitor.config.ts) | Capacitor 平台配置（含 iOS 的 `contentInset`、`SystemBars`） |
| [`ios-build.yml`](https://github.com/cklsit/noname/blob/feat/ios-support/.github/workflows/ios-build.yml) | 云端未签名 `.ipa` 构建工作流 |
| [`sync-upstream.yml`](https://github.com/cklsit/noname/blob/main/.github/workflows/sync-upstream.yml) | 每日自动同步上游 |

---

## 附录 B：命令速查

```bash
# ---------- 本地开发（任意平台）----------
pnpm install                 # 装依赖
pnpm dev                     # 本地起开发服务器
pnpm build                   # 产出 dist/（可直接部署到静态服务器）

# ---------- 路线 B：本地 Mac 构建 ----------
git checkout feat/ios-support
pnpm install
cd apps/mobile
pnpm build:ios -- --team=<你的TeamID>                            # 默认 development（适合侧载）
pnpm build:ios -- --team=<你的TeamID> --configuration=Release    # 正式版

# ---------- 资源裁剪后必须重建清单 ----------
pnpm --filter @noname/mobile sync

# ---------- 路线 A：云端构建 ----------
git tag ios-v1.0.0 && git push origin ios-v1.0.0   # 打 tag 自动构建

# ---------- 恢复被误删的 iOS 工程 ----------
git checkout -- apps/mobile/ios
```
