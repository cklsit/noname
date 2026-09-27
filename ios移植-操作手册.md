# 无名杀 iOS 移植 —— 操作手册（Mac 上照着做）

> 这份文档假设你**完全没写过代码**。每一步都写清楚了「在哪里敲」「敲什么」「看到什么算成功」。
>
> 代码部分我已经全部改完了（在 Windows 上完成）。你在 Mac 上只需要**跑构建、装到手机**。

---

## 0. 先说清楚你这台 Mac 的情况

你的 Mac 是 **Intel Core i5（2017 款）+ macOS Ventura 13.7.8**。

这个配置带来一个硬约束，也是本方案的核心：

| 项目 | 情况 |
| --- | --- |
| 最高能装的 Xcode | **Xcode 15.2**（要求 macOS 13.5+，你的 13.7 够） |
| 装不了的 Xcode | Xcode 16+（要 macOS 14.5+）、Xcode 26+（要 M1 芯片 + macOS 15.6+） |
| 因此 Capacitor 版本 | **固定在 6.x**（Capacitor 8 要求 Xcode 26，你装不了） |
| iOS 部署目标 | iOS 13.0+（Capacitor 6 的要求） |

**所以代码已经帮你降到 Capacitor 6 了**，你不用管这件事，照着下面做就行。

---

## 1. 进度总览

| 阶段 | 状态 |
| --- | --- |
| 修改源码让它支持 iOS | ✅ 已完成 |
| 降级到 Capacitor 6（适配你的 Intel Mac） | ✅ 已完成 |
| 在 Mac 上装 Xcode / CocoaPods | ⬜ 待你做 |
| 生成 Xcode 工程 | ⬜ 待你做 |
| 编译出 .ipa 文件 | ⬜ 待你做 |
| 用 SideStore 装进 iPhone | ⬜ 待你做 |

**已经改了什么**（了解即可，不用你动手）：

- 新增 `apps/mobile/src/fs/ios.ts` —— iOS 的文件读写实现（存档、扩展、导出文件全走这里）
- 新增 `apps/mobile/src/fs/types.ts`、`legacy-api.ts` —— 把安卓和 iOS 的差异抽出来，两边共用一套映射
- 改写 `apps/mobile/src/preload.ts` —— 拆掉「只支持 Android」的硬编码，改成按平台自动分流
- 新增 `apps/mobile/buildIos.ts` —— iOS 一键构建脚本
- `apps/mobile/afterSync.ts` —— 新增资源清单生成（iOS 必需，见第 9 节说明）
- `apps/mobile/package.json` —— Capacitor 相关依赖全部固定到 6.x

---

## 2. 在 Mac 上装必备工具

打开 Mac 上的「终端」（Terminal，在「启动台 → 其他」里，或者按 `Command + 空格` 搜 `终端`）。

### 2.1 装 Xcode 15.2

**⚠️ 注意：不要在 App Store 里装 Xcode！** App Store 只会给你最新版（Xcode 26），你的 Intel Mac 装不了。

正确做法是去 Apple 开发者网站下载旧版：

1. 浏览器打开：https://developer.apple.com/download/all/
2. 用你的 Apple ID 登录（免费账号就行）
3. 在搜索框输入 `Xcode 15.2`
4. 找到 **Xcode 15.2**，点右边的下载按钮，得到一个 `.xip` 文件（约 4 GB）

下载完成后：

1. 双击那个 `.xip` 文件，它会解压出一个 `Xcode.app`
2. 把 `Xcode.app` 拖进「应用程序」文件夹
3. **一定要打开一次 Xcode**，它会让你同意许可协议、安装额外组件，照着点「Agree / Install」

装完在终端里验证：

```bash
xcodebuild -version
```

看到 `Xcode 15.2` 就是成功。

> 如果提示 `xcode-select: error`，执行这行把路径指过去：
> ```bash
> sudo xcode-select -s /Applications/Xcode.app
> ```

### 2.2 装 CocoaPods

Capacitor 6 用 CocoaPods 管理 iOS 依赖，必须装。

终端里执行：

```bash
sudo gem install cocoapods
```

会让你输 Mac 登录密码（**输入时不显示字符，这是正常的**，输完直接回车）。

装完验证：

```bash
pod --version
```

看到版本号（比如 `1.15.2`）就行。

> 如果 `sudo gem install` 报错或很慢，改用 Homebrew：
> ```bash
> brew install cocoapods
> ```

### 2.3 装 Node.js

去 https://nodejs.org/ 下载 **LTS 版本**（左边那个按钮），双击安装。

装完验证：

```bash
node -v
```

看到 `v22.x.x` 之类的版本号就行。

### 2.4 装 pnpm

终端里粘贴这行，回车：

```bash
corepack enable pnpm
```

验证：

```bash
pnpm -v
```

---

## 3. 把代码弄到 Mac 上

代码已经推送到你自己的 GitHub 仓库了。终端里执行：

```bash
cd ~/Documents
git clone https://github.com/cklsit/noname.git noname
cd noname
```

然后装依赖（第一次会比较慢，几分钟）：

```bash
pnpm install
```

---

## 4. 生成 iOS 工程

在 `noname/apps/mobile` 目录里执行：

```bash
cd apps/mobile
npx cap add ios
```

成功的话会生成一个 `apps/mobile/ios/` 文件夹。

> ⚠️ 这一步**只需要做一次**。以后重新构建不用再跑。

---

## 5. 查你的 Team ID

1. 打开 https://developer.apple.com/account
2. 用你的 Apple ID 登录
3. 进 **Membership details** 页面
4. 找 **Team ID**，是一串 10 位字符（例如 `A1B2C3D4E5`）

**把这串字符记下来**，下一步要用。

> 如果你**没有付费的开发者账号**（$99/年），用免费 Apple ID 也能出 .ipa，但描述文件 **7 天就过期**，且最多只能装 3 台设备。对自用测试够用。
>
> 免费账号拿 Team ID 的方法：打开 Xcode → 菜单 `Xcode` → `Settings` → `Accounts`，登录你的 Apple ID，右边的 Team 列表里会显示类似 `你的名字 (Personal Team)`。

---

## 6. 一键构建 .ipa

还是在 `noname/apps/mobile` 目录，执行：

```bash
pnpm build:ios -- --team=你刚才记下的TeamID
```

比如 Team ID 是 `A1B2C3D4E5`，就写：

```bash
pnpm build:ios -- --team=A1B2C3D4E5
```

这个脚本会自动帮你做这几件事：
1. 构建网页部分（`dist/`）
2. 同步资源到 iOS 工程（顺带生成资源清单）
3. 跑 `pod install` 装 iOS 依赖
4. 用 `xcodebuild` 编译并导出 `.ipa`

**这一步会编译很久**（游戏资源很大，Intel 机器更慢，可能要 30 分钟以上）。终端会滚很多字，这是正常的。

成功后最后几行会显示：

```
iOS archive: /Users/你/Documents/noname/apps/mobile/ios/build/noname.xcarchive
iOS IPA exported to: /Users/你/Documents/noname/apps/mobile/ios/build/export
用 SideStore / AltStore 把这个 .ipa 装进 iPhone 即可。
```

**你的 .ipa 文件就在** `apps/mobile/ios/build/export/` 目录里。

### 常用附加参数

| 参数 | 作用 |
| --- | --- |
| `--method=development` | 默认。适合侧载（SideStore / AltStore） |
| `--method=ad-hoc` | 需要先在 Apple 后台登记设备 UDID |
| `--method=app-store-connect` | 用于上架 App Store 或 TestFlight |
| `--configuration=Release` | 出正式版（体积更小、跑得更快），默认是 Debug |
| `--skip-web-build` | 复用已有的 `dist`，不重新构建网页部分（改完代码后想快点出包时用） |

---

## 7. 装进 iPhone

用你已装好的 **SideStore**：

1. 把 `export/` 里的 `.ipa` 文件传到手机上（隔空投送 AirDrop 最方便）
2. 打开 SideStore，点 `+`，选那个 `.ipa` 文件
3. 等它装完，桌面上就会出现无名杀的图标

> **7 天过期**：免费账号签的应用每 7 天要重新签一次。SideStore 会在充电 + 连 Wi-Fi 时自动续签，一般不用管。

---

## 8. 关于文件体积（重要，很可能会踩坑）

游戏资源体积分布（我实测统计的）：

| 目录 | 体积 |
| --- | --- |
| `audio/skill` | 470 MB |
| `image/character` | 390 MB |
| `audio/die` | 111 MB |
| `image/emotion` | 52 MB |
| `image/background` | 43 MB |
| `audio/background` | 42 MB |
| `image/mode` | 31 MB |
| `image/card` | 11 MB |
| 代码类合计 | 约 11 MB |

**合计约 2.8 GB。**

- iOS 应用总大小上限是 **4 GB**，所以总量能装下。
- 但 AltStore **安装超过 300 MB 的 .ipa 会报 `Bad Allocation` 错误**（SideStore 同样容易踩）。
- Intel Mac 编译 2.8 GB 的工程会**非常慢**，而且很吃磁盘（至少要留 20 GB 空闲）。

**如果构建失败或太慢**，可以先把 `dist/audio/skill`、`dist/audio/die` 这类大目录删掉再构建（游戏能启动，只是对应音效没声音）。

---

## 9. 一些说明（你可能会疑惑的地方）

**为什么必须用 Capacitor 6 而不是最新的 8？**

因为 Apple 从 Xcode 16 起逐步放弃 Intel Mac，Xcode 26 更是明确只支持 M1 以上芯片。你的 Mac 最高只能装 Xcode 15.2，而 Capacitor 8 要求 Xcode 26。Capacitor 6 要求 Xcode 15+，正好匹配。功能上完全够用。

**为什么 Xcode 不能直接从 App Store 装？**

App Store 只提供最新版。你的 Intel Mac 装不了最新版，必须去开发者网站下载旧版。

**为什么 iOS 不需要像安卓那样「选一个目录」？**

安卓要用户手动授权一个可写目录（SAF 机制）；iOS 是沙盒，每个 App 有自己独立的空间，不需要授权。所以 iOS 版直接把自己沙盒里的 `Documents` 目录当作可写区，随 App 打包的资源当作只读区。存档、扩展、导出的文件都会存在 `Documents/noname/` 下。

**新增的那个 `asset-manifest.json` 是干什么的？**

游戏启动时会「列目录」去扫描有哪些武将、卡牌、模式。安卓上这是真实文件系统，能直接列出来；但 iOS 的 WebView 出于安全限制**不提供列目录能力**。所以我在构建时把 `dist/` 里所有文件的路径清单写成了一份 `asset-manifest.json` 一起打包，运行时读它来模拟列目录。

**为什么在 Windows 上不能构建 iOS？**

因为 `xcodebuild` 和签名工具只存在于 macOS。所以我写了清晰的报错提示，而不是让你对着一堆看不懂的错误发呆。

---

## 10. 遇到问题怎么办

把终端里的**报错原文**复制下来发给我，我来判断。常见的几类：

| 报错关键词 | 原因 / 解决 |
| --- | --- |
| `xcodebuild: command not found` | Xcode 没装，或没打开过 Xcode 同意协议；试试 `sudo xcode-select -s /Applications/Xcode.app` |
| `CocoaPods was not found` | 没装 CocoaPods，执行 `sudo gem install cocoapods` |
| `No signing certificate` | Team ID 填错，或 Apple ID 没在 Xcode 里登录 |
| `Unable to find a destination` | 缺 iOS 设备支持，`xcodebuild -downloadPlatform iOS` 可以补 |
| `Bad Allocation` | .ipa 太大，见第 8 节 |
| `iOS project not found` | 没跑第 4 步的 `npx cap add ios` |
| `Xcode workspace not found` | iOS 工程没初始化好，删除 `apps/mobile/ios` 后重跑 `npx cap add ios` |
| `pod install` 卡住 / 很慢 | 网络问题，多试几次；或设置镜像后重试 |
