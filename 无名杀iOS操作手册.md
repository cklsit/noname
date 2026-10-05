# 无名杀 iOS 操作手册

> 本 fork 的 iOS 速查：从「构建 ipa」到「装进 iPhone」的完整操作步骤。  
> 更详尽的文档见 [`apps/mobile/docs/ios.md`](https://github.com/cklsit/noname/blob/feat/ios-support/apps/mobile/docs/ios.md)（在 `feat/ios-support` 分支上）。  
> 本文只保留「照着做」的操作步骤，去掉了调研分析与本机信息。



---

## 0. 现状速查（先看这个）

| 项             | 值                                                                          |
| ------------- | -------------------------------------------------------------------------- |
| 本仓库           | `https://github.com/cklsit/noname`                                         |
| **构建分支**      | **`feat/ios-support`**（Capacitor **8.1**）                                  |
| 旧线，**不要**用来构建 | `main` —— 仍是 Capacitor **6.2**，且没有瘦身步骤、没有「边玩边下」                            |
| 素材策略          | 包内**恒定不含**武将原画 / 技能语音 / 阵亡语音（约 970 MB），由游戏内「边玩边下」按需补齐                      |
| 上游同步          | 每天 UTC 16:00（北京 0 点）自动把 `libnoname/noname` 合并进 `main` 与 `feat/ios-support` |
| 本地素材补充包       | `Documents/无名杀素材补充/`（懒人包独有素材，见 4.4）                                        |

> ⚠️ **在 Actions 网页点 Run workflow 时，要手动把分支切成 `feat/ios-support`。**  
> 默认跑的是 `main`（旧线），出来的包与预期完全不同。

---

## 1. 路线 A：云端构建 ipa（推荐）

### 1.1 触发

1. 打开 `https://github.com/cklsit/noname/actions`
2. 左侧点 **Build unsigned iOS IPA**
3. 右侧 **Run workflow** → **Use workflow from** 选 **`feat/ios-support`**
4. 参数：
   | 选项               | 建议值  | 说明                  |
   | ---------------- | ---- | ------------------- |
   | `retention_days` | `14` | 产物在 GitHub 上保留多少天   |
   | `create_release` | ✅ 勾上 | 同时发到 Release，方便长期下载 |
   > 武将原画与语音**没有开关**：工作流里 “Strip character art and voice” 步骤**恒定执行**（约 970 MB），  
   > 只保留 3 张必需的默认剪影，并重建资源清单。改由「边玩边下」补齐（见第 4 节）。
5. 点绿色 **Run workflow**，刷新页面看进度（点进去有实时日志）。

### 1.2 打 tag 自动构建

```bash
git tag ios-v1.0.0
git push origin ios-v1.0.0
```

### 1.3 拿 ipa

- **Artifacts**：任务页面底部 `noname-ios-unsigned`（zip，解压后是 `.ipa`）
- **Release**：`https://github.com/cklsit/noname/releases` 里最新的一条

> ⚠️ 产物是**未签名** ipa，**不能双击直接安装**，必须经 SideStore / AltStore 用你自己的 Apple ID 重签。

### 1.4 体积与磁盘

完整资源约 **2.8 GB**；裁剪后约 **337 MB**。

- AltStore / SideStore 安装 **超过 300 MB** 的 ipa 容易报 `Bad Allocation`
- Apple 对未压缩 App 的硬上限是 **4 GB**
- 工作流已做三重防护：`fetch-depth: 1`（只拉最新 1 个提交）、每步打印磁盘剩余、编译前体检

---

## 2. 路线 B：本地 Mac 构建（需要 Apple Silicon）

| 项目      | 要求                                                                  |
| ------- | ------------------------------------------------------------------- |
| macOS   | 支持 Xcode 26.0+ 的版本                                                  |
| Xcode   | **26.0+**（Capacitor 8 起改用 Swift Package Manager，**不再需要 CocoaPods**） |
| Node.js | 22.x（LTS）                                                           |
| pnpm    | `corepack enable pnpm`                                              |



> 💡 Xcode 26 起 Apple 不再支持 Intel Mac。Intel 机器最高只能装 Xcode 15.x，  
> 无法用于当前的 Capacitor 8 工程 —— 这类机器请走**路线 A**。

```bash
# 1) 环境自检
xcodebuild -version          # 应输出 Xcode 26.x

# 2) 获取代码
git clone https://github.com/cklsit/noname.git
cd noname
git checkout feat/ios-support
pnpm install
```

**iOS 工程已随仓库提供**（`apps/mobile/ios/` 与 `android/` 一样纳入版本管理），  
**不需要**执行 `npx cap add ios`。仅当工程被误删时才重建，且重建后要从 Git 恢复自定义 Swift 文件：

```bash
git checkout -- apps/mobile/ios
```

### 2.1 查 Team ID

1. 打开 `https://developer.apple.com/account`
2. 进 **Membership details**，找到 **Team ID**（10 位字符）

> 没有付费开发者账号（$99/年）时，免费 Apple ID 也能出 ipa，但签名 **7 天过期**、最多 3 台设备。  
> 免费账号的 Team ID 可在 Xcode 的 `Settings → Accounts` 里看到（形如 `名字 (Personal Team)`）。

### 2.2 一键构建

```bash
cd apps/mobile
pnpm build:ios -- --team=<你的TeamID>
```

产物路径：`apps/mobile/ios/build/export/<AppName>.ipa`

可选参数：

| 参数                           | 作用                            |
| ---------------------------- | ----------------------------- |
| `--method=development`       | 默认，适合侧载（SideStore / AltStore） |
| `--method=ad-hoc`            | 需先在 Apple 后台登记设备 UDID         |
| `--method=app-store-connect` | 用于上架 App Store 或 TestFlight   |
| `--configuration=Release`    | 出正式版（更小更快），默认 Debug           |
| `--skip-web-build`           | 复用已有 `dist`，不重新构建网页部分         |

> 想打一个「素材齐全」的包（模拟器调试 / 上架回归）：  
> `pnpm build && pnpm --filter @noname/mobile sync`，再直接对 `apps/mobile/ios` 出包。

---

## 3. 装进 iPhone

1. 把 `.ipa` 传到手机上（AirDrop 最方便）
2. 打开 **SideStore**，点 `+`，选那个 `.ipa`
3. 等它装完，桌面出现《无名杀》图标

> **7 天过期**：免费账号签的应用每 7 天要重签一次。SideStore 会在充电 + 连 Wi-Fi 时自动续签。

---

## 4. 素材补齐

包内不含武将原画与语音，有两条互补路径，都从上游 GitHub 取文件、写进沙盒可写层（`Documents/`）：

| 方式              | 触发                            | 代价                     |
| --------------- | ----------------------------- | ---------------------- |
| **边玩边下**（默认，推荐） | 无感：游戏用到某个武将的立绘/语音时才下**那一个**文件 | 首次遇到时零点几秒延迟，仅一次        |
| 批量补齐            | 菜单 → 其它 → 更新 → **下载素材**       | 一次约 970 MB，建议在 Wi-Fi 下 |

两者写的是同一个可写层，互不冲突：批量下过的文件，按需下载检测到本地已有会直接跳过。
两者的成果还会汇总到面板上的「**素材就绪进度**」——只靠边玩边下补的文件也会体现在进度里。

### 4.3 手动导入（「文件」App）

> **「文件」App → 浏览 → 我的 iPhone → 无名杀**

```
无名杀/
├── image/character/     武将立绘（文件名 = 武将 ID，如 zhaoyun.jpg）
├── audio/skill/         技能语音（文件名 = 技能 ID，如 benghuai.mp3）
├── audio/die/           阵亡语音（文件名 = 武将 ID，如 zhaoyun.mp3）
└── extension/           扩展（每个扩展一个文件夹，文件夹名即扩展名）
```

这四个目录在 App 首次启动时自动建好。放进去的文件会**覆盖**内置同名资源，删掉即还原，  
所以只补一部分也可以。静态资源下次读取即生效；新武将包 / 扩展需要重启游戏重新扫描。

### 4.4 素材补充包（懒人包独有素材）

手机端「边玩边下」只能从**上游官方仓库**取文件，**上游没有的永远下不到**  
（约 78 个武将没有原画，其中势曹爽、势陈矫、势陈群等）。本地已从电脑版懒人包提取出  
「上游完全没有」的那部分：

```
Documents/无名杀素材补充/     （39 张立绘 + 458 段技能语音 + 91 段阵亡语音，约 37 MB）
├── image/character/
├── audio/skill/
├── audio/die/
└── 使用说明.md
```

导入方法：按 4.3 的层级把 `image`、`audio` 拷进「文件」App 的《无名杀》目录  
（经 iCloud 云盘中转最方便），然后**完全退出游戏再重开**。

> 详细步骤见该目录下的《使用说明.md》。  
> 注意别往 `image/character/` 放 `default_silhouette_*`，那三张是全局兜底图。

---

## 5. 每日自动同步上游

`.github/workflows/sync-upstream.yml` 每天 UTC 16:00（北京时间 0 点）执行：

1. 比较上游 `libnoname/noname` 与 fork 的两个分支；
2. 有更新就调 `merge-upstream` 合并，无更新直接跳过；
3. 用 matrix **同时覆盖 `main` 与 `feat/ios-support`**（两者都必须同步，缺一不可）。

> 为什么两个分支都要同步：iOS 包的**批量下载清单**是按「构建分支自己的资源」生成的。  
> 功能分支落后上游 → 上游新增的文件永远进不了清单，玩家点「下载素材」补不到。  
> （「边玩边下」不受影响，它按路径直取上游。）

### SYNC_TOKEN

GitHub 内置令牌**无权创建或修改 `.github/workflows/` 下的文件**（权限清单里也没有这一项）。  
上游一旦改到工作流，那次合并会被拒（422 `without 'workflows' permission`）。  
因此配了一个仓库 secret **`SYNC_TOKEN`**（PAT，需要 `Contents: Read and write` + `Workflows: Read and write`）。

- 运行日志里会打印身份：`当前使用 SYNC_TOKEN（身份：<用户名>）` → 说明 PAT 生效；  
  若显示 `github-actions[bot]` → PAT 没配上。
- **没配也能用**（上游只改普通文件时内置令牌足够，多数日子如此），失败时有明确中文报错，  
  手动去网页点一次 Sync fork 即可。
- 建议用**细粒度令牌**：`Repository access` 只选本仓库，权限只给上面两项。

---

## 6. 常见问题速查

| 现象 / 报错                         | 处理                                                                          |
| ------------------------------- | --------------------------------------------------------------------------- |
| `xcodebuild: command not found` | Xcode 未装或未打开过；`sudo xcode-select -s /Applications/Xcode.app`                |
| `No signing certificate`        | Team ID 填错，或 Apple ID 未在 Xcode 登录                                           |
| `Bad Allocation`                | ipa 太大，见 1.4 节                                                              |
| `iOS project not found`         | `apps/mobile/ios/` 缺失，`git checkout -- apps/mobile/ios` 恢复                  |
| 武将没立绘 / 技能与阵亡没配音                | 首次会自动按需下载；若迟迟不出，进「菜单 → 其它 → 更新 → 下载素材」点「测试连接」看哪个源不通                         |
| 对局刚开始时卡一下（画面无任何提示）              | 这是**边玩边下**在下载本局用到的立绘/语音。刻意不弹提示以免遮挡牌桌，仅首次出现                                  |
| 扩展加载不了 / 用户放的扩展不生效              | 确认 `Main.storyboard` 初始 ViewController 是 `NonameBridgeViewController`       |
| 读不到武将 / 卡牌                      | `asset-manifest.json` 缺失或未随裁剪更新 → `pnpm --filter @noname/mobile sync`       |
| 导入文件时列表全灰、点不动                   | 已由 `src/ios-file-input.ts` 修掉；若文件在 iCloud 未下载，先点一下让它下载                      |
| 菜单 / 顶部按钮点不动                    | 确认 `capacitor.config.ts` 里 `SystemBars.hidden` 为 `true`，且未启用 `contentInset` |

> 更完整的排查表见 `apps/mobile/docs/ios.md` 第 5 节。

---

## 7. 相关文件

| 文件                                           | 作用                                                  |
| -------------------------------------------- | --------------------------------------------------- |
| `apps/mobile/docs/ios.md`                    | 仓库内权威文档（构建 / 安装 / 排障）                               |
| `.github/workflows/ios-build.yml`            | 云端未签名 ipa 构建工作流                                     |
| `.github/workflows/sync-upstream.yml`        | 每日自动同步上游                                            |
| `apps/mobile/src/lazy-assets.ts`             | **边玩边下**（按需补齐立绘 / 语音）                               |
| `apps/mobile/src/asset-download.ts`          | **批量下载素材** + 两者共用的多源下载与写盘                           |
| `apps/mobile/src/fs/ios.ts`                  | iOS 文件系统（沙盒覆盖层）                                     |
| `apps/mobile/ios/App/App/NonameRouter.swift` | 请求层覆盖层（让 `<script src>` / `fetch` 也读到 `Documents/`） |
