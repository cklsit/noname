# 《无名杀》移植到 iOS（App Store / TestFlight）—— 可行性分析与实施报告

> 面向读者：**代码小白**（个人开发者，无公司、无 Mac 经验）  
> 报告对象：`C:/Users/Jonson/Documents/noname`（无名杀 v1.11.6，GPL-3.0 开源）  
> 报告日期：2026-09-27  
> 报告性质：**只做分析与规划，未对项目做任何代码修改**  
> 关联报告：《无名杀移植微信小程序可行性报告.md》



---

## 零、先看结论（如果只看一段，看这里）

| 问题                        | 结论                                                                                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS 比微信小程序好做吗？            | **好做得多，而且好太多。** 原因是根本性的：项目的 Android 版就是 **Capacitor 容器**，Capacitor **原生支持 iOS**，换平台基本是「加一个 iOS 工程 + 写一个 iOS 文件系统适配」，而不是重写渲染层                                  |
| **最关键的好消息**               | 🔥 **游戏本体已经内置了完整的 iOS 代码路径**。代码里到处都有 `lib.device === "ios"` 的分支、`StatusBar` 调用、iOS 专属布局选项（`show_statusbar_ios`）。也就是说——**这个游戏的 iOS 适配在代码层面早就做好了，只是缺一个 iOS 容器** |
| 我（个人，没公司）能上架 App Store 吗？ | ✅ **能！这是和微信小程序的根本区别。** Apple 的 **Individual（个人 / 独资）开发者账号** $99/年，**凭个人真实姓名就能直接上架 App Store**，**不需要营业执照、不需要邓白氏编码（D-U-N-S）**、不需要注册公司                           |
| 那 TestFlight 呢？           | ✅ 能。个人账号支持 TestFlight，**最多 10,000 名外部测试者**，每个构建版本 **90 天**有效期                                                                                                 |
| 最大的门槛是什么？                 | 🖥️ **必须有一台 Mac**。iOS 应用只能在 macOS 上编译打包（Xcode 仅支持 Mac）。这是硬性要求，无法绕过                                                                                            |
| 需要多少钱？                    | **约 ¥720/年（$99 开发者账号）+ Mac 设备成本**。相比微信方案（服务器+域名+备案+软著），**成本结构完全不同，反而更省心**                                                                                     |
| 最大的坑在哪？                   | ⚠️ 三个：① **必须用真实姓名**（App Store 会显示你的真名）；② **GPL-3.0 协议 + App Store 的 DRM/许可条款可能冲突**（这是最需要提前想清楚的事）；③ **Apple 审核指南 4.7 对「迷你游戏」有专门条款**，且审核不接受「简单套壳」               |
| 综合建议                      | ⭐ **强烈推荐走 iOS 路线**。技术上最顺、资质上最松。**建议先用 TestFlight 做内测**，验证完再考虑正式上架                                                                                             |



> ✅ **一句话对比**：
>
> - 微信小程序：**技术上难（要重写渲染层）、资质上几乎走不通（个人主体拿不到游戏类目）**
> - iOS：**技术上顺（已有 iOS 代码路径 + Capacitor 支持）、资质上走得通（个人账号就能上架）**

---

## 一、可行性分析

### 1.1 为什么 iOS 路线技术上是「顺风局」

#### （1）项目已有 Capacitor 容器体系 —— 这是决定性优势

项目的 `apps/mobile/` 就是用 **Capacitor** 打包的移动端：

```
apps/mobile/
├── capacitor.config.ts     ← Capacitor 配置（跨平台，iOS 也用它）
├── src/preload.ts          ← 平台预加载脚本（实现游戏所需的文件 API）
├── afterSync.ts            ← 同步脚本（构建预加载 + cap sync）
├── buildAndroid.ts         ← 安卓构建脚本
└── android/                ← 安卓原生工程
```

关键点：**Capacitor 是一套跨平台框架，同时支持 Android 和 iOS。** 官方配置中已经定义了 `appId: "com.libnoname.noname"` 和 `webDir: "../../dist"`，这些**通用配置对 iOS 一样有效**。

**换句话说：官方已经用 Capacitor 把「网页游戏 → 原生 App」这件事做成了，只是目前只生成了 Android 工程（`android/` 目录），没有生成 `ios/` 目录。**

我们要做的是：**补上 iOS 这一侧**（生成 iOS 工程 + 写 iOS 文件系统桥接）。

#### （2）🔥 游戏代码已内置完整 iOS 支持（重大发现）

我在源码里搜索后发现，游戏本体**早就为 iOS 写好适配逻辑了**：

| 文件                                                        | 行数                | iOS 相关代码                                                            |
| --------------------------------------------------------- | ----------------- | ------------------------------------------------------------------- |
| `apps/core/noname/util/index.js`                          | 24-31             | 设备判定，明确产出 `"ios"` 值                                                 |
| `apps/core/noname/init/cordova.js`                        | 17, 189, 207, 503 | `lib.device == "android"` / `ios` 分支                                |
| `apps/core/noname/init/cordova.js`                        | 509-520           | **iOS 状态栏处理**：`show_statusbar_ios` 配置、`StatusBar.overlaysWebView()` |
| `apps/core/noname/init/index.ts`                          | 73-74             | **iOS 触屏默认配置**：`show_statusbar_ios = "overlay"`                     |
| `apps/core/noname/library/index.js`                       | 4250-4253         | 按平台显示不同的状态栏设置项                                                      |
| `apps/core/noname/library/index.js`                       | 4447, 4470        | `window.StatusBar && lib.device == "ios"`                           |
| `apps/core/noname/ui/click/index.js`                      | 4660              | iOS 滚动手势特殊处理                                                        |
| `apps/core/noname/ui/create/index.js`                     | 2331              | iOS 手机布局判定                                                          |
| `apps/core/noname/ui/create/menu/pages/exetensionMenu.js` | 584               | iOS 专属菜单逻辑                                                          |
| `apps/core/noname/ui/create/menu/pages/otherMenu.js`      | 786, 802          | iOS 按钮「用户手动输入」特殊处理                                                  |

> 💡 **这说明什么？**  
> 无名杀**曾经有过 iOS 版本**（从 `cordova.js` 和 `StatusBar` 的用法看，早期应该是用 Cordova 打包过 iOS）。  
> 也就是说：**界面层、布局层、交互层的 iOS 适配已经全部完成，代码里现成可用。**  
> 你不需要重写 UI，不需要处理「无 DOM」问题 —— 因为 iOS 上跑的是 **WKWebView，它完整支持 DOM 和 CSS**！

> 🎯 **这是 iOS 方案和微信小游戏方案最本质的差异**：
>
> |             | 微信小游戏               | iOS                        |
> | ----------- | ------------------- | -------------------------- |
> | 运行环境        | JS 沙箱，**无 DOM/CSS** | **WKWebView，完整 DOM + CSS** |
> | 界面改造        | **必须重写渲染层**         | ✅ **零改动**                  |
> | 现有 iOS 适配代码 | 用不上                 | ✅ **直接生效**                 |
> | 音频          | 需换成 wx API          | ✅ 原生 `Audio` 可用            |

#### （3）文件系统抽象层干净，可移植

游戏有一套设计良好的抽象接口（`apps/core/noname/library/fs/`）：

```typescript
// adapter.ts —— 平台无关的文件系统接口
export interface FileSystemAdapter {
    open(path, options?): Promise<FileHandle>;
    read(path): Promise<Uint8Array>;
    write(path, data: Uint8Array): Promise<void>;
    stat(path): Promise<FileInfo | null>;
    list(path): Promise<DirEntry[]>;
    createDir(path, options?): Promise<void>;
    remove(path, options?): Promise<void>;
}
```

`legacy.ts` 里还有 `installLegacyFileSystemAPI()`，会**自动**把上面这套接口包装成游戏需要的 `game.checkFile` / `game.readFile` / `game.writeFile` 等老 API。

**这意味着：我们只需要为 iOS 实现一个 `FileSystemAdapter`，其余全部自动打通。**

#### （4）现有 Android 适配层就是最好的「模板」

`apps/mobile/src/preload.ts` 里已经完整实现了一套文件系统桥接（`SafFs` 插件），包括：

- `checkFile` / `checkDir` / `readFile` / `readFileAsText` / `writeFile` / `removeFile` / `getFileList` / `createDir` / `removeDir`
- 甚至处理了 base64 编解码、Blob 转换、错误回调等细节

**我们要做的 iOS 版，就是把「Android SAF（存储访问框架）」替换成「iOS 沙盒文件系统」，接口一模一样。**

> ⚠️ 唯一需要留意的：`preload.ts` 里有一句硬编码检查 ——
>
> ```typescript
> if (Capacitor.getPlatform() !== "android") {
>     throw new Error("移动端 SAF 文件系统仅支持 Android");
> }
> ```
>
> 这行需要改造成 **按平台分支**（iOS 走另一套实现），这是主要的改造点。

### 1.2 iOS 技术方案详解

#### 方案对比

| 维度         | 说明                                                         |
| ---------- | ---------------------------------------------------------- |
| **容器框架**   | **Capacitor**（沿用现有方案，无需换框架）                                |
| **渲染引擎**   | WKWebView（iOS 系统内置，支持完整 DOM/CSS/JS）                        |
| **文件访问**   | iOS 沙盒目录（`Documents` / `Library`）+ Capacitor Filesystem 插件 |
| **资源加载**   | 打包进 App（首次启动解压）或首次启动时下载                                    |
| **构建工具**   | Xcode（**仅 macOS**）                                         |
| **最低系统版本** | 建议 iOS 15.0+（根据 Capacitor 8 的要求，**需核实官方文档**）               |

#### 需要新写的代码（工作量评估）

| 模块                  | 工作量     | 说明                                                |
| ------------------- | ------- | ------------------------------------------------- |
| 生成 iOS 工程           | ⭐ 极低    | `npx cap add ios` 一条命令                            |
| iOS 文件系统适配层         | ⭐⭐⭐ 中等  | 参考现有 `preload.ts` 改写，用 Capacitor Filesystem 或自写插件 |
| `preload.ts` 平台分支改造 | ⭐⭐ 低    | 拆出 android / ios 两条路径                             |
| iOS 状态栏适配           | ⭐ 极低    | 已有代码支持，只需装 `@capacitor/status-bar`                |
| 首次启动资源释放            | ⭐⭐⭐ 中等  | 1.3GB 资源如何交付给用户（见 1.3）                            |
| **UI 层改造**          | ✅ **零** | **iOS 上 DOM/CSS 原生可用，无需改动**                       |

#### iOS 与 Android 的差异点

| 差异点     | Android 现状                            | iOS 需要                          |
| ------- | ------------------------------------- | ------------------------------- |
| 文件系统    | SAF（Storage Access Framework），需用户授权目录 | iOS 沙盒，**无需授权**（App 自己的目录）      |
| 用户可见文件  | 可通过文件管理器访问                            | **不可见**（沙盒机制），需用分享/导出功能         |
| 状态栏     | `SystemBars.hide()`                   | `@capacitor/status-bar`         |
| 返回键     | 有系统返回键                                | **无**，需提供 App 内返回/退出            |
| 安全区（刘海） | 部分机型                                  | **全系需要处理**（`safe-area-inset-*`） |
| 内存限制    | 较宽松                                   | **WKWebView 内存较紧，大资源需注意**       |

> ⚠️ **iOS 特有风险**：WKWebView 有内存限制，如果一次性加载 1.3GB 资源的索引或大量图片，可能触发「白屏崩溃」（iOS 强制回收 WebView 进程）。**这是 iOS 方案最需要重点测试的地方。**

### 1.3 1.3GB 资源怎么处理（核心工程问题）

先看数据（与微信方案相同的审计结果）：

| 目录                     | 体积         | 文件数              |
| ---------------------- | ---------- | ---------------- |
| `apps/core/audio/`     | **636 MB** | 9553 个（9546 mp3） |
| `apps/core/image/`     | **536 MB** | 4107 个           |
| `apps/core/extension/` | 53 MB      | 8 个扩展            |
| `apps/core/font/`      | 24 MB      | 8 个字体            |
| `apps/core/character/` | 16 MB      | 366 个武将          |
| `apps/core/noname/`    | 3.4 MB     | **核心逻辑代码**       |
| **合计**                 | **1.3 GB** |                  |

**和微信不同，iOS 这里的选择更多：**

| 方案                | 做法                                   | 优点        | 缺点                                                            | 推荐度         |
| ----------------- | ------------------------------------ | --------- | ------------------------------------------------------------- | ----------- |
| **A. 全量打包**       | 1.3GB 全部放进 App 包                     | 开箱即用、离线可玩 | **App 体积 1.3GB+**，下载慢；Apple 对超过 200MB 的包会提示用户用 Wi-Fi；可能影响审核观感 | ⭐⭐          |
| **B. 核心包 + 首次下载** | 主包放核心代码 + 必需资源（约 100-200MB），其余首次启动下载 | 安装包小、体验好  | ⚠️ **必须遵守 Guideline 4.2.3(ii)：需明示下载大小并在下载前提示用户**；需自建资源服务器     | ⭐⭐⭐⭐ **推荐** |
| **C. 精简资源包**      | 移除 / 压缩部分语音和图片（如语音转低码率）              | 体积大幅下降    | 损失部分游戏内容                                                      | ⭐⭐⭐         |
| **D. 按需加载**       | 用到哪个武将才下载对应语音                        | 极省流量      | 实现复杂，弱网体验差                                                    | ⭐⭐          |

> 💡 **实务建议**：**方案 B + 部分 C**。  
> 先用工具统计「核心玩法必需资源」，做一版精简包；剩余的语音包等做首次下载（并明确提示用户下载大小）。  
> 同时注意：**Apple 允许 App 在首次启动时下载资源，但必须遵守 4.2.3(ii)**。

### 1.4 🔥 可行性总评（打分表）

| 维度      | iOS 评分      | 对比微信   | 说明                                                  |
| ------- | ----------- | ------ | --------------------------------------------------- |
| 技术可行性   | ⭐⭐⭐⭐⭐ **高** | 微信 ⭐⭐⭐ | Capacitor 原生支持 + 游戏已有 iOS 代码路径 + DOM 可用，**无需重写 UI** |
| 合规可行性   | ⭐⭐⭐⭐ **较高** | 微信 ⭐☆  | **个人账号即可上架 App Store**，无版号/软著/备案要求                  |
| 成本可行性   | ⭐⭐⭐⭐ **好**  | 微信 ⭐⭐⭐ | $99/年，无需服务器/域名/备案/软著；**但需要 Mac**                    |
| 你的能力匹配度 | ⭐⭐ **有距离**  | 微信 ⭐   | **必须有 Mac + 学 Xcode 基本操作**，但比微信方案好上手太多              |
| **综合**  | ✅ **推荐**    | ❌ 不推荐  | **iOS 是明显更优的选择**                                    |

---

## 二、你的准备工作

### 2.1 硬性前置条件（必须满足）

| 序号 | 项目                 | 说明                                                                                                                        | 成本         |
| -- | ------------------ | ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1  | **Mac 电脑**         | 🔴 **硬性要求，无法绕过**。iOS 应用只能在 macOS 上用 Xcode 编译。可以是 MacBook / iMac / Mac mini。**必须在 macOS 15+**（装 Xcode 16 的要求，**需核实最新版要求**） | ¥4000+ 或借用 |
| 2  | **Apple ID**       | 免费注册，**必须开启双重认证（2FA）**，否则无法注册开发者账号                                                                                        | ¥0         |
| 3  | **开发者账号资格**        | 需**年满 18 岁**、有有效身份证件                                                                                                      | —          |
| 4  | **支付方式**           | 支持境外支付的信用卡 / 借记卡（Visa / Mastercard 等），用于支付 $99                                                                            | —          |
| 5  | **Xcode**          | Mac App Store 免费下载，约 10-20GB                                                                                              | ¥0         |
| 6  | **Node.js + pnpm** | 用于构建游戏本体（已有项目要求 Node ≥ 22.12）                                                                                             | ¥0         |

> ⚠️ **关于 Mac 的现实建议**：
>
> - **如果你没有 Mac**：这是 iOS 路线最大的现实障碍。选项有：
>   - 借用朋友的 Mac（只需在打包/上传阶段使用）
>   - 购买 Mac mini（最便宜的入门 Mac，约 ¥4000+）
>   - 租用「云 Mac」服务（如 MacStadium 等，按月付费）
>   - 找一位有 Mac 的合作者，你负责策划和测试，他负责打包
> - **这是你最需要先决定的事。**

### 2.2 你需要准备的账号与资料

| 序号 | 项目                          | 你现在有没有 | 说明                                 |
| -- | --------------------------- | ------ | ---------------------------------- |
| 1  | Apple ID                    | ❓ 需注册  | 免费，但**必须开 2FA**                    |
| 2  | **Apple Developer Program** | ❌ 需购买  | **$99/年（约 ¥720）**，个人账号，1-2 天审批     |
| 3  | 身份证件                        | ❓      | 需要**真实姓名**，会显示为 App Store 上的「卖家名称」 |
| 4  | 隐私政策页面                      | ❌ 需准备  | **所有 App 必须提供公开可访问的隐私政策 URL**      |
| 5  | 技术支持 URL                    | ❌ 需准备  | 可以是一个简单网页或 GitHub 页面               |
| 6  | App 图标                      | ❌ 需准备  | 1024×1024 PNG，无透明通道、无圆角            |
| 7  | App 截图                      | ❌ 需准备  | 每种设备尺寸 3-10 张                      |
| 8  | App 描述文案                    | ❌ 需准备  | 名称、副标题、关键词、描述                      |

### 2.3 时间线规划

```
第 0 周   ├─ 决策：确认有 Mac 可用 + 确认走 Capacitor iOS 路线
         │
第 1 天   ├─ 注册 Apple ID 并开启 2FA
         ├─ 注册 Apple Developer Program（$99）← 1~2 天审批
         │
第 2~3 天 ├─ 安装 Xcode；用 `npx cap add ios` 生成 iOS 工程
         │
第 1~3 周 ├─【核心开发】改造 preload.ts，实现 iOS 文件系统适配层
         ├─ 加入 @capacitor/status-bar，适配安全区
         ├─ 解决资源交付方案（打包 vs 下载）
         └─ 在 iPhone / 模拟器上跑通「启动 → 主菜单 → 单机一局」
         │
第 4 周   ├─ 准备上架材料（隐私政策、截图、图标、描述）
         ├─ 上传 TestFlight，内部测试
         │
第 5~6 周 ├─ TestFlight 外部测试（可邀请至多 10,000 人）
         ├─ 收集反馈并修复问题
         └─ 正式提交 App Store 审核（通常 24-48 小时出结果）
```

### 2.4 预算清单

| 项目                          | 费用                             | 周期         | 备注                  |
| --------------------------- | ------------------------------ | ---------- | ------------------- |
| Apple Developer Program（个人） | **$99 USD/年（约 ¥720）**          | 1~2 天      | **核心支出**，续费制        |
| Mac 设备                      | ¥0（已有/借用）或 ¥4000+（购买 Mac mini） | —          | 🔴 **决定性门槛**        |
| Xcode                       | ¥0                             | 下载 10-20GB | 免费                  |
| 资源服务器（若走下载方案）               | ¥0 ~ 500/年                     | —          | 可选；也可用对象存储/CDN      |
| 隐私政策页面                      | ¥0                             | —          | 可用免费静态页面托管          |
| 域名（放隐私政策）                   | ¥0 ~ 80/年                      | —          | 可选，也可用 GitHub Pages |
| **合计（已有 Mac）**              | **约 ¥720/年**                   |            |                     |
| **合计（需买 Mac mini）**         | **约 ¥4720**（首年）                |            |                     |



> 💡 **对比微信方案**：iOS 方案**不需要**服务器（1.3GB 可打包）、**不需要** ICP 备案、**不需要**软件著作权、**不需要**游戏版号。**行政成本几乎为零**，这是最大的优势。

### 2.5 ⚠️ 你必须先知道的四个风险

#### 风险一：🔴 GPL-3.0 与 App Store 条款的潜在冲突（**最需要重视**）

「无名杀」使用 **GPL-3.0** 协议。这是一个**强 Copyleft** 协议，要求：

- 分发衍生作品时，**必须提供完整源代码**；
- 必须以**同等许可**分发（不能加限制性条款）。

而 Apple App Store 的条款存在**众所周知的冲突点**：

- Apple 对 App 施加 **DRM（FairPlay 加密）** 和使用限制；
- Apple 的服务条款对 App 的再分发施加了 GPL 不允许的额外限制。

> ⚠️ 这在开源社区是**长期争议话题**。典型案例：**VLC 播放器曾因此从 App Store 下架**（后通过多方努力重新上架）。
>
> **对你的实际影响：**
>
> - 如果你的 App **完全免费、不开内购**，风险相对可控；
> - 但 GPL 的「必须开源」要求，与 App Store「不能以 Apple 不允许的方式再分发」可能存在张力；
> - **建议：在提交前研究清楚，或在 App 内/App Store 描述中明确声明源码地址与 GPL-3.0 许可**，主动履行开源义务。


> 📌 **我的建议做法**：
>
> 1. 在 App Store 描述中**明确标注**：「本 App 是基于 GPL-3.0 协议开源的《无名杀》（<https://github.com/libnoname/noname）的非商业移植版本」；>
> 2. 在 App 内「关于」页面提供**源代码链接**；
> 3. 确保你的修改版本**同样以 GPL-3.0 开源发布**（如放在 GitHub）；
> 4. **务必不要**加广告或内购。

#### 风险二：🟠 Guideline 4.7 —— 「迷你游戏」专门条款

Apple 在 **2025 年 11 月 13 日修订**了审核指南，**明确指出 HTML5 和 JavaScript 迷你 App / 迷你游戏属于 4.7 条款管辖范围**。相关要求：

| 条款        | 要求                                         | 对你的影响                                                  |
| --------- | ------------------------------------------ | ------------------------------------------------------ |
| **4.7**   | 你对自己 App 中提供的所有软件负责，不符合指南会导致 **App 被拒**    | 你需要对无名杀内容负责                                            |
| **4.7.1** | 必须提供**筛选不良内容的方法**、**举报机制**，以及**屏蔽滥用用户**的能力 | ⚠️ 如果游戏有聊天/联机功能，**必须加举报功能**                            |
| **4.7.2** | **未经 Apple 事先许可，不得向该软件暴露原生平台 API**         | ⚠️ 这一点需要留意：Capacitor 桥接（文件系统、状态栏）属于「暴露原生 API」，**需要评估** |
| **4.7.3** | 未经用户明确同意，不得共享数据或隐私权限                       | 如需采集数据，需弹窗同意                                           |
| **4.7.4** | 必须提供**软件和元数据的索引**，并包含 **Universal Links**  | ⚠️ 如果 App 内有多个游戏/模式，需要提供索引和深链接                         |
| **4.7.5** | 必须提供**识别超过年龄分级内容的方法**，并用**年龄限制机制**限制未成年访问  | ⚠️ 三国杀类游戏含战斗元素，**年龄分级需谨慎填写**，可能需要年龄验证机制                |

> ⚠️ **4.7.2 是这里最微妙的一条**。Capacitor 的文件系统桥接本质上是「把原生能力暴露给 Web 内容」。  
> **建议**：在提交审核时，如果被质疑，需要向 Apple 说明这是「App 自身功能的实现方式」，而非「向第三方软件开放平台能力」。  
> **更稳妥的做法是：把游戏资源完整打包进 App 二进制**，让游戏成为「App 自带内容」而非「下载的外部软件」，这样可绕开 4.7 的大部分管辖。

#### 风险三：🟠 Guideline 4.2 —— 「最小功能」/ 拒绝「简单套壳」

Apple 明确拒绝「仅仅是重新包装的网站」的 App：

> 「App 应包含功能、内容和 UI，而不仅仅是一个经过重新包装的网站。」

**对你的影响**：

- 好消息：无名杀是**完整的游戏**，有完整玩法、界面、存档系统，**不是套壳网站**，这方面问题不大；
- 但需要在**审核备注**中说明：这是一款完整的单机卡牌游戏 App，而不是网页封装。
- 同时 4.2.3(ii)：**如需首次启动下载资源，必须披露下载大小并提前提示**。

#### 风险四：🟠 Guideline 4.1 —— 「抄袭」条款

> 「请拿出你自己的想法……请不要简单照搬 App Store 上的热门 App，或只是细微修改其他 App 的名称或 UI，就将其挪为己用。」  
> 「**未经开发者批准，你不得在 App 的图标或名称中使用其他开发者的图标、品牌或产品名称**。」

**对你的影响**：

- 「无名杀」是**知名开源项目**，你在移植时必须**明确标注来源**，不能声称是原创；
- ⚠️ **关键问题**：「无名杀」这个名字、以及它**基于「三国杀」玩法**这件事，属于知识产权敏感区：
  - 「三国杀」是**游卡桌游的注册商标**；
  - 建议**不要**在 App 名称/图标中使用「三国杀」相关元素；
  - 「无名杀」名称本身建议**取得原作者（libnoname）的书面许可**后再使用，或改用其他名称。
- **建议做法**：在 App Store 描述中显著标注「本 App 为社区非商业移植，与游卡桌游无关」，并在 README 中保留原始出处。

#### 补充风险：**内容分级与地区限制**

- 三国杀类游戏含「击杀」等战斗表现，**App Store 年龄分级应如实填写**（建议 12+ 或 17+，**需按 Apple 分级标准核实**）；
- 中国大陆地区的 App Store 上架游戏类 App，**可能仍需具备游戏版号**（这与微信小游戏的要求类似，取决于 Apple 中国区的政策执行）。**这一点必须核实**。如果只面向海外或 TestFlight 内测，则不受此限。

---

## 三、具体流程（分步骤操作手册）

### 阶段 1：注册 Apple 开发者账号（第 1 天）

**Step 1.1｜创建 Apple ID**

1. 访问 `https://appleid.apple.com/`，点击「创建您的 Apple 账户」
2. 填写：姓名、出生日期、邮箱、密码
   - ⚠️ **务必开启双重认证（2FA）**，这是开发者账号注册的**强制要求**
3. 完成邮箱 + 手机号验证

**Step 1.2｜加入 Apple Developer Program**

1. 访问 `https://developer.apple.com/programs/enroll`
2. 点击「Start Your Enrollment」，用**刚创建的 Apple ID 登录**
3. 选择账户类型：
   - ✅ **选「Individual / Sole Proprietor（个人 / 独资）」** ← **这是你的选择**
   - ❌ **不要选 Organization**（需要 D-U-N-S 编码、营业执照，流程 1-4 周）
4. 填写个人信息：
   - ⚠️ **必须与身份证件**完全一致（姓名、地址、电话）
   - ⚠️ 你的**真实法定姓名会作为 App Store 上的「卖家名称」对外显示**
5. 接受开发者协议
6. 支付 **$99 USD**（需要 Visa/Mastercard 等可境外支付的卡）
7. 等待审核：**个人账号通常 24-48 小时**内通过

**个人账号 vs 组织账号对比表：**

| 项目            | 个人（Individual）✅ 选这个 | 组织（Organization） |
| ------------- | ------------------- | ---------------- |
| 年费            | $99                 | $99              |
| 可上架 App Store | ✅ **可以**            | ✅ 可以             |
| TestFlight    | ✅ 10,000 人 / 90 天   | ✅ 同样             |
| 卖家名称显示        | **你的真实姓名**          | 公司名称             |
| 需要营业执照        | ❌ **不需要**           | ✅ 需要             |
| 需要 D-U-N-S 编码 | ❌ **不需要**           | ✅ 需要             |
| 审批时间          | **24-48 小时**        | 1-4 周            |
| 团队协作          | 仅本人                 | 最多 100 人         |

### 阶段 2：搭建 iOS 工程（第 2-3 天）

**Step 2.1｜准备 Mac 环境**

1. 安装 **Xcode**（Mac App Store，免费，约 10-20GB）
2. 安装 **Node.js**（≥ 22.12）和 **pnpm**（≥ 9）
   - 项目要求见 `docs/how-to-start.md`
3. 打开 Xcode，完成首次初始化（会提示安装附加组件）

**Step 2.2｜构建游戏本体**

```bash
# 在项目根目录
cd /path/to/noname
pnpm install
pnpm build          # 产出 dist/ 目录
```

**Step 2.3｜生成 iOS 工程**

```bash
cd apps/mobile
npx cap add ios     # 生成 ios/ 目录
npx cap sync ios    # 同步 dist/ 到 iOS 工程
```

> 💡 生成的 `apps/mobile/ios/` 目录结构大致是：
>
> ```
> apps/mobile/ios/
> ├── App/
> │   ├── App.xcodeproj          ← Xcode 工程文件
> │   ├── App/
> │   │   ├── Info.plist
> │   │   └── public/            ← 同步进来的游戏文件（dist/）
> │   └── Podfile               ← CocoaPods 依赖
> └── ...
> ```

**Step 2.4｜安装必需插件**

```bash
cd apps/mobile
npm install @capacitor/ios @capacitor/status-bar
```

### 阶段 3：改造代码（第 1-3 周，核心工作）

> ⚠️ **以下为改造方案，本报告不动代码。**

**Step 3.1｜改造 `preload.ts` 支持 iOS**

现状（`apps/mobile/src/preload.ts` 第 100 行左右）：

```typescript
if (Capacitor.getPlatform() !== "android") {
    throw new Error("移动端 SAF 文件系统仅支持 Android");
}
```

改造思路 —— **拆成平台分支**：

```typescript
// 伪代码示意
export default async function preload({ lib, game }) {
    lib.path = (await import("path-browserify-esm")).default;

    const platform = Capacitor.getPlatform();

    if (platform === "android") {
        // 保持现有 SAF 逻辑不变
        await setupAndroidSaf(game);
    } else if (platform === "ios") {
        // ★ 新增：iOS 文件系统适配
        await setupIosFileSystem(game);
    } else {
        throw new Error(`不支持的平台: ${platform}`);
    }

    // 状态栏处理（分平台）
    await setupStatusBar(platform);
    // ... 其余公共逻辑
}
```

**Step 3.2｜实现 iOS 文件系统适配层**

iOS 没有 SAF，改用 **iOS 沙盒目录 + Capacitor Filesystem**：

```typescript
// ios/fs.ts —— iOS 文件系统适配（示意，需对照实际接口实现）
import { Filesystem, Directory, Encoding } from "@capacitor/filesystem";

const ROOT = "noname";  // 在 Documents 下的根目录

class IosFileSystem {
    /**
     * 检查文件/目录是否存在
     * 对应 game.checkFile / game.checkDir
     */
    async stat(path: string) {
        try {
            const info = await Filesystem.stat({
                path: `${ROOT}/${path}`,
                directory: Directory.Documents,
            });
            return info.type === "directory" ? "directory" : "file";
        } catch {
            return null;   // 不存在
        }
    }

    /**
     * 读取文件（文本）：对应 game.readFileAsText
     */
    async readFileAsText(path: string): Promise<string> {
        const result = await Filesystem.readFile({
            path: `${ROOT}/${path}`,
            directory: Directory.Documents,
            encoding: Encoding.UTF8,     // 文本读取
        });
        return result.data as string;
    }

    /**
     * 读取文件（二进制）：对应 game.readFile
     * 返回 base64，再转 ArrayBuffer
     */
    async readFile(path: string): Promise<string> {
        const result = await Filesystem.readFile({
            path: `${ROOT}/${path}`,
            directory: Directory.Documents,
        });
        return result.data as string;   // base64
    }

    /**
     * 写入文件：对应 game.writeFile
     */
    async writeFile(path: string, data: string) {
        await Filesystem.writeFile({
            path: `${ROOT}/${path}`,
            directory: Directory.Documents,
            data,
            encoding: Encoding.UTF8,
            recursive: true,            // 自动建父目录
        });
    }

    /**
     * 列目录：对应 game.getFileList
     */
    async readdir(path: string) {
        const result = await Filesystem.readdir({
            path: `${ROOT}/${path}`,
            directory: Directory.Documents,
        });
        const folders = result.files.filter(f => f.type === "directory").map(f => f.name);
        const files = result.files.filter(f => f.type === "file").map(f => f.name);
        return { folders, files };
    }

    // deleteFile / mkdir / rmdir 同理
}
```

> 📌 **注意**：上面用的是 Capacitor 官方 Filesystem 插件的 API（`@capacitor/filesystem`，已在项目依赖中）。**具体参数名和用法需核对官方文档**。

**Step 3.3｜首次启动释放资源（若走「核心包 + 下载」方案）**

```typescript
// 伪代码示意：首次启动时检查并释放/下载资源
async function ensureResources() {
    const isFirstRun = !(await storage.get({ key: "resources_ready" })).value;

    if (!isFirstRun) return;

    // ⚠️ Guideline 4.2.3(ii) 要求：必须提前告知下载大小并获用户同意
    const confirmed = await showDownloadPrompt({
        title: "需要下载游戏资源",
        message: "首次启动需要下载约 XXX MB 的游戏资源，建议在 Wi-Fi 环境下进行。",
    });
    if (!confirmed) { /* 处理用户拒绝 */ return; }

    // 逐项下载并解压到 Documents 目录
    await downloadAndExtractResources(/* ... */);

    await storage.set({ key: "resources_ready", value: "true" });
}
```

**Step 3.4｜状态栏与安全区适配**

```typescript
// 状态栏：游戏已有 show_statusbar_ios 配置，需接入 Capacitor 插件
import { StatusBar } from "@capacitor/status-bar";

async function setupStatusBar(platform: string) {
    if (platform !== "ios") return;
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setOverlaysWebView({ overlay: true });  // 对应 overlaysWebView(true)
}
```

安全区（刘海屏）CSS 处理 —— 游戏已有相关逻辑，需确认：

```css
/* 游戏内已有 viewport-fit=cover（见 apps/core/index.html） */
/* 补上安全区变量使用 */
.safe-top    { padding-top: env(safe-area-inset-top); }
.safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
```

**Step 3.5｜iOS 特有问题处理清单**

| 问题             | 处理方案                                                        |
| -------------- | ----------------------------------------------------------- |
| **无系统返回键**     | 需在 UI 中提供「返回」按钮，或用 `@capacitor/app` 的 `backButton` 事件       |
| **无退出 App 机制** | `game.exit` 在 iOS 上不能调用 `exitApp()`（Apple 不允许程序化退出），改为返回主界面 |
| **内存压力**       | 避免一次性加载大量图片；用懒加载；监控 `didReceiveMemoryWarning`               |
| **文件不可见**      | 用户无法用文件管理器找到存档；需提供「导出/分享」功能（`UIActivityViewController`）     |
| **音频自动播放限制**   | iOS 要求**用户交互后才能播放音频**，需在用户点击后初始化音频                          |
| **后台运行**       | App 切到后台会暂停，需正确处理 `pause`/`resume` 事件（游戏已有相关逻辑）             |

### 阶段 4：测试与 TestFlight（第 4 周）

**Step 4.1｜本地测试**

1. 用 Xcode 打开 `apps/mobile/ios/App/App.xcodeproj`
2. 连接 iPhone，或使用 iOS 模拟器
3. 选择签名团队（Signing & Capabilities → Team → 选你的账号）
4. 点击运行，在设备上测试游戏

**Step 4.2｜上传到 TestFlight**

1. 在 **App Store Connect**（`https://appstoreconnect.apple.com`）创建 App 记录：
   - Platform: iOS
   - Name: App 名称（⚠️ 避免「三国杀」「无名杀」的商标风险）
   - Bundle ID: `com.libnoname.noname`（沿用现有 `capacitor.config.ts` 中的 appId）
   - SKU: 自定义唯一标识
2. 在 Xcode 中：`Product → Archive` → `Distribute App` → `App Store Connect`
3. 上传完成后，在 App Store Connect 中配置 TestFlight：
   - **内部测试**：最多 100 名团队成员（需添加到账号）
   - **外部测试**：最多 **10,000 人**，**每个构建版本 90 天**有效期
4. 提交外部测试审核（首次需 Apple 审核，通常 1-2 天）

**Step 4.3｜上架材料准备清单**

- [ ] **App 名称**（≤30 字符，⚠️ 避开商标）
- [ ] **副标题**（≤30 字符）
- [ ] **关键词**（≤100 字符）
- [ ] **描述**（⚠️ 必须包含 GPL-3.0 声明和来源标注）
- [ ] **App 图标**：1024×1024 PNG，无透明、无圆角
- [ ] **截图**：每种设备尺寸 3-10 张（iPhone 6.7"、6.5"、5.5" 等）
- [ ] **隐私政策 URL**（**必填**，必须公开可访问）
- [ ] **技术支持 URL**（必填）
- [ ] **年龄分级**（如实填写，三国杀类建议 12+/17+）
- [ ] **App 隐私信息**（在 App Store Connect 中申报数据收集情况）
- [ ] **审核备注**：说明这是开源游戏《无名杀》的非商业移植，附 GitHub 链接

### 阶段 5：提交 App Store 审核（第 5-6 周）

**Step 5.1｜提交前自检清单**

- [ ] 已在真机上完整测试（启动、主菜单、单机对局、存档、退出恢复）
- [ ] 无崩溃、无白屏
- [ ] 首次启动的资源下载有明确提示（如走下载方案）
- [ ] 隐私政策链接可访问
- [ ] 技术支持链接可访问
- [ ] App 内已标注 GPL-3.0 来源
- [ ] 截图展示了**实际运行的 App**（不是设计稿）
- [ ] 年龄分级与内容匹配
- [ ] 无任何形式的广告或内购（个人账号 + GPL 协议要求）
- [ ] 无占位内容、无「Lorem ipsum」
- [ ] 已处理安全区（刘海屏/灵动岛）
- [ ] 图标无透明通道、无圆角

**Step 5.2｜提交**

1. App Store Connect → 选择构建版本 → 填写所有元数据
2. 点击「Submit for Review」
3. 等待审核：**通常 24-48 小时**
4. 若被拒绝，仔细阅读拒绝原因，修改后重新提交


**Step 5.3｜常见拒绝原因与应对**

| 拒绝条款            | 原因             | 应对                                    |
| --------------- | -------------- | ------------------------------------- |
| **4.2 最小功能**    | 被认为只是网页套壳      | 在审核备注中说明这是完整游戏（附玩法说明、截图）；强调离线可玩、有存档系统 |
| **4.7 迷你游戏**    | 未提供内容筛选/举报机制   | 若含聊天/联机功能，必须加入举报和屏蔽功能                 |
| **4.1 抄袭**      | 名称/图标涉及他人品牌    | 更换名称和图标，避免「三国杀」相关元素                   |
| **2.1 App 完整性** | 有崩溃/占位内容       | 充分真机测试                                |
| **5.1.1 隐私政策**  | 缺少隐私政策链接       | 准备公开可访问的隐私政策页面                        |
| **3.1.1 内购**    | 若有任何付费内容未走 IAP | 本方案应完全免费，无此问题                         |
| **4.3 垃圾应用**    | 认为与其他 App 高度重复 | 强调这是**开源项目移植**，说明差异和来源                |

---

## 四、iOS vs 微信小程序 全维度对比

| 维度            | 微信小程序 / 小游戏     | iOS（App Store / TestFlight）     |
| ------------- | --------------- | ------------------------------- |
| **技术栈适配**     | ❌ 需重写渲染层（无 DOM） | ✅ **零改动**（WKWebView 支持 DOM/CSS） |
| **游戏已有代码支持**  | 无               | ✅ **已有完整 iOS 代码路径**             |
| **容器方案**      | 需从零搭            | ✅ **Capacitor 原生支持**            |
| **个人主体能否上架**  | ❌ 拿不到游戏类目       | ✅ **可以，个人账号就行**                 |
| **需要营业执照**    | ❌ 需要（若要公开发布）    | ✅ **不需要**                       |
| **需要软件著作权**   | ✅ 必须            | ❌ **不需要**                       |
| **需要游戏版号**    | ⚠️ 棋牌类需要（且难拿）   | ⚠️ 视地区而定，**需核实**                |
| **需要 ICP 备案** | ✅ 必须            | ❌ **不需要**                       |
| **需要服务器**     | ✅ 必须（1.3GB 资源）  | ❌ **可打包进 App**                  |
| **需要 Mac**    | ❌ 不需要           | 🔴 **必须**                       |
| **需要 Xcode**  | ❌ 不需要           | ✅ 需要                            |
| **开发难度**      | 🔴 高（重写渲染层）     | 🟡 中（写文件适配层）                    |
| **成本**        | ¥1700-2700/年    | **¥720/年**（+Mac）                |
| **审核周期**      | 1-3 工作日         | 24-48 小时                        |
| **测试分发**      | 体验版（扫码）         | **TestFlight（10,000 人）**        |
| **合规风险**      | 🔴 极高           | 🟡 中等                           |
| **目标用户**      | 微信内用户           | 全部 iPhone 用户                    |
| **综合推荐度**     | ❌ **不推荐**       | ✅ **推荐**                        |

---

## 五、风险清单与应对

| 风险                             | 等级    | 说明                       | 应对                                |
| ------------------------------ | ----- | ------------------------ | --------------------------------- |
| **GPL-3.0 与 App Store 条款冲突**   | 🔴 高  | DRM/再分发限制与 GPL 的开源要求存在张力 | 明确标注来源与许可；保持免费无内购；考虑先咨询开源社区意见     |
| **必须用 Mac**                    | 🔴 高  | iOS 构建的硬性门槛              | 借 Mac / 买 Mac mini / 云 Mac / 找合作者 |
| **Guideline 4.7.2（原生 API 暴露）** | 🟠 中高 | Capacitor 桥接可能被质疑        | 尽可能把资源打包进 App，避免「下载外部软件」；保留说明材料   |
| **Guideline 4.2（最小功能）**        | 🟠 中  | 可能被认为套壳                  | 完整的游戏体验 + 审核备注说明                  |
| **Guideline 4.1（抄袭/商标）**       | 🟠 中  | 「三国杀」是注册商标               | 更换名称图标；标注来源；说明与游卡无关               |
| **内容分级**                       | 🟠 中  | 战斗元素                     | 如实填写分级                            |
| **中国大陆版号要求**                   | 🟠 中  | 中国区上架游戏可能有版号要求           | **需核实**；可考虑仅海外发行或先走 TestFlight    |
| **1.3GB 资源体积**                 | 🟡 中  | 影响安装包大小和审核观感             | 精简 + 首次下载（须提示大小）                  |
| **WKWebView 内存限制**             | 🟡 中  | 大量资源可能导致白屏崩溃             | 懒加载、分包、真机压力测试                     |
| **隐私政策/技术支持 URL**              | 🟡 中  | 必填项                      | 用 GitHub Pages 免费托管               |
| **iOS 沙盒文件不可见**                | 🟡 中  | 用户找不到存档                  | 提供导出/分享功能                         |
| **首次启动资源下载提示**                 | 🟡 中  | 4.2.3(ii) 强制要求           | 明确提示下载大小并征求同意                     |
| **版权方（游卡）投诉**                  | 🟡 中  | 「三国杀」玩法/商标风险             | 非商业、标注来源、更换名称；关注法律边界              |

---

## 六、行动清单（照着打勾）

### 第 1 天

- [ ] 确认是否有 Mac 可用（**这是第一步，也是决定性的**）
- [ ] 读一遍 2.5 节的四个风险，确认你接受「以真实姓名上架」和「GPL 开源义务」
- [ ] 注册 Apple ID，**开启双重认证**
- [ ] 注册 Apple Developer Program（选 **Individual**），支付 $99

### 第 2-3 天

- [ ] 安装 Xcode（约 10-20GB）
- [ ] 安装 Node.js ≥ 22.12 + pnpm ≥ 9
- [ ] 在项目根目录执行 `pnpm install && pnpm build`
- [ ] 在 `apps/mobile` 执行 `npx cap add ios`
- [ ] 安装 `@capacitor/ios` 和 `@capacitor/status-bar`
- [ ] 用 Xcode 打开 iOS 工程，先跑通「默认页面加载」

### 第 1-3 周（核心开发）

- [ ] 改造 `preload.ts`：加入 iOS 平台分支
- [ ] 实现 iOS 文件系统适配层（参考 Capacitor Filesystem 插件）
- [ ] 解决资源交付方案（打包 vs 首次下载）
- [ ] 接入状态栏插件，适配安全区
- [ ] 处理 iOS 特有问题（无返回键、音频策略、内存）
- [ ] **真机跑通「启动 → 主菜单 → 单机一局 → 存档 → 恢复」**

### 第 4 周

- [ ] 准备上架材料（图标、截图、描述、隐私政策、技术支持 URL）
- [ ] 在 App Store Connect 创建 App 记录
- [ ] Xcode Archive 并上传到 TestFlight
- [ ] 邀请自己和朋友做内部测试

### 第 5-6 周

- [ ] 开启 TestFlight 外部测试，收集反馈
- [ ] 修复问题
- [ ] 提交 App Store 审核
- [ ] 发布

---

## 七、结语：iOS 是明显更优的选择

### 为什么 iOS 比微信小程序好？

**1. 技术上：顺风局，不是逆风局**

- iOS 的 WKWebView **完整支持 DOM 和 CSS** → **界面零改动**
- 项目**已内置完整 iOS 代码路径**（`device === "ios"`、`StatusBar`、iOS 布局选项）→ **适配逻辑现成**
- 官方已用 **Capacitor** 打包过移动端，Capacitor **原生支持 iOS** → **容器现成**
- 唯一的主要工作是：**写一个 iOS 文件系统适配层**（约 1-3 周）

> 对比微信：要在**没有 DOM 的沙箱里重写整个渲染层**，工作量根本不在一个量级。

**2. 资质上：个人就能上架，行政成本几乎为零**

- ✅ 个人开发者账号 **$99/年**，**凭真实姓名就能上架 App Store**
- ✅ **不需要**营业执照、**不需要** D-U-N-S 编码、**不需要**注册公司
- ✅ **不需要**软件著作权、**不需要** ICP 备案、**不需要**服务器

> 对比微信：个人主体拿不到游戏类目，还要软著 + 备案 + 服务器，**三重门槛**。

**3. 分发上：TestFlight 是天然的「小范围试玩」通道**

- 最多 **10,000 名测试者**，**90 天有效期**，完美适配「先小范围玩起来」的需求。

### 但有三件事你必须先想清楚

| 必须想清楚的事                        | 说明                                                                 |
| ------------------------------ | ------------------------------------------------------------------ |
| **1. Mac 从哪来**                 | 🔴 这是唯一的硬门槛。没有 Mac，这条路走不通。                                         |
| **2. GPL-3.0 与 App Store 的关系** | ⚠️ 这是最需要专业判断的地方。建议保持**完全免费、无内购**，并在 App 内和 App Store 描述中明确标注来源与许可。 |
| **3. 名称与商标**                   | ⚠️ 「三国杀」是注册商标。建议**更换名称和图标**，并明确标注「社区非商业移植，与游卡桌游无关」。                |

### 我的推荐路径

```
① 用 TestFlight 做内测
   ↓（合规压力最小、成本最低、快速看到成果）
② 验证技术跑通 + 收集反馈
   ↓
③ 评估 GPL 与审核合规后
   ↓
④ 提交 App Store 正式上架
```

### 最终建议

> **如果你有 Mac（或能借到），iOS 是比微信小程序好得多的选择。**  
> 技术上顺、资质上松、成本上低，而且这个项目的代码**本来就为 iOS 准备好了**。
>
> **如果没有 Mac，那先解决 Mac 问题 —— 它是这条路唯一的门槛。**

---

## 附录 A：关键文件路径速查

| 用途                 | 路径                                                    |
| ------------------ | ----------------------------------------------------- |
| Capacitor 配置       | `apps/mobile/capacitor.config.ts`                     |
| **平台预加载脚本（核心改造点）** | `apps/mobile/src/preload.ts`                          |
| 同步脚本               | `apps/mobile/afterSync.ts`                            |
| 安卓构建脚本             | `apps/mobile/buildAndroid.ts`                         |
| **iOS 代码路径（现成可用）** | `apps/core/noname/init/cordova.js`（509-520 行 iOS 状态栏） |
| 设备判定               | `apps/core/noname/util/index.js`（24-31 行）             |
| 文件系统抽象接口           | `apps/core/noname/library/fs/adapter.ts`              |
| 老 API 安装器          | `apps/core/noname/library/fs/legacy.ts`               |
| 游戏入口               | `apps/core/noname/entry.ts`                           |
| 构建脚本               | `apps/core/scripts/build.ts`                          |
| 许可证                | `LICENSE`（GPL-3.0）                                    |
| 环境要求文档             | `docs/how-to-start.md`                                |

## 附录 B：常用链接

| 用途                      | 链接                                                            |
| ----------------------- | ------------------------------------------------------------- |
| Apple Developer 注册      | `https://developer.apple.com/programs/enroll`                 |
| App Store Connect       | `https://appstoreconnect.apple.com`                           |
| App 审核指南（中文）            | `https://developer.apple.com/cn/app-store/review/guidelines/` |
| TestFlight              | `https://testflight.apple.com`                                |
| Capacitor 官方文档          | `https://capacitorjs.com/docs`                                |
| Capacitor iOS 文档        | `https://capacitorjs.com/docs/ios`                            |
| Capacitor Filesystem 插件 | `https://capacitorjs.com/docs/apis/filesystem`                |
| 无名杀官方仓库                 | `https://github.com/libnoname/noname`                         |

---

> 📢 **免责说明**  
> 本报告中的 Apple 政策、审核指南条款（4.1 / 4.2 / 4.7）、开发者账号要求等内容**基于 2026 年 9 月的公开信息整理**。  
> Apple 的审核指南会持续更新（最近一次修订为 2025 年 11 月 13 日），**具体以 Apple 官方最新文档为准**。  
> 涉及 **GPL-3.0 与 App Store 条款的兼容性**、**商标（三国杀）风险**、**中国大陆地区游戏版号要求** 等法律问题，**本报告不构成法律意见**，建议在正式投入前咨询专业人士。
