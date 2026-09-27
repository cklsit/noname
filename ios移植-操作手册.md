# 无名杀 iOS 移植 —— 操作手册（Mac 上照着做）

> 这份文档假设你**完全没写过代码**。每一步都写清楚了「在哪里敲」「敲什么」「看到什么算成功」。
>
> 代码部分我已经全部改完了（在 Windows 上完成）。你在 Mac 上只需要**跑构建、装到手机**。

---

## 0. 先搞清楚：现在进度到哪了

| 阶段 | 状态 |
| --- | --- |
| 修改源码让它支持 iOS | ✅ 已完成（本次） |
| 在 Mac 上生成 Xcode 工程 | ⬜ 待你在 Mac 上做 |
| 编译出 .ipa 文件 | ⬜ 待你在 Mac 上做 |
| 用 SideStore 装进 iPhone | ⬜ 待你做 |

**已经改了什么**（了解即可，不用你动手）：

- 新增 `apps/mobile/src/fs/ios.ts` —— iOS 的文件读写实现（存档、扩展、导出文件全走这里）
- 新增 `apps/mobile/src/fs/types.ts`、`legacy-api.ts` —— 把安卓和 iOS 的差异抽出来，两边共用一套映射
- 改写 `apps/mobile/src/preload.ts` —— 拆掉「只支持 Android」的硬编码，改成按平台自动分流
- 新增 `apps/mobile/buildIos.ts` —— iOS 一键构建脚本
- `apps/mobile/afterSync.ts` —— 新增资源清单生成（iOS 必需，见第 6 节说明）
- `apps/mobile/package.json` —— 加上 `@capacitor/ios` 依赖

---

## 1. 在 Mac 上装必备工具

打开 Mac 上的「终端」（Terminal，在「启动台 → 其他」里，或者按 `Command + 空格` 搜 `终端`）。

### 1.1 装 Xcode

打开 Mac 的 **App Store**，搜 `Xcode`，点安装。

> 这个下载很大（十几 GB），要等挺久。装完之后**一定要打开一次** Xcode，它会让你同意一个许可协议、再装一些组件，照着点「Agree / Install」就行。不打开的话后面命令会报错。

装完在终端里验证：

```bash
xcodebuild -version
```

看到类似 `Xcode 16.x` 就是成功。

### 1.2 装 Node.js

去 https://nodejs.org/ 下载 **LTS 版本**（左边那个按钮），双击安装。

装完验证：

```bash
node -v
```

看到 `v22.x.x` 之类的版本号就行。

### 1.3 装 pnpm

终端里粘贴这行，回车：

```bash
corepack enable pnpm
```

验证：

```bash
pnpm -v
```

---

## 2. 把代码弄到 Mac 上

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

## 3. 生成 iOS 工程

在 `noname/apps/mobile` 目录里执行：

```bash
cd apps/mobile
npx cap add ios
```

成功的话会生成一个 `apps/mobile/ios/` 文件夹，里面是 Xcode 工程。

> ⚠️ 这一步**只需要做一次**。以后重新构建不用再跑。
>
> 顺便：`apps/mobile/ios/` 这个文件夹建议加进 `.gitignore`，因为它包含本机相关的签名配置，不适合提交到仓库。（有需要我可以帮你加。）

---

## 4. 查你的 Team ID

1. 打开 https://developer.apple.com/account
2. 用你的 Apple ID 登录
3. 进 **Membership details** 页面
4. 找 **Team ID**，是一串 10 位字符（例如 `A1B2C3D4E5`）

**把这串字符记下来**，下一步要用。

> 如果你**没有付费的开发者账号**（$99/年），用免费 Apple ID 也能出 .ipa，但描述文件 **7 天就过期**，且最多只能装 3 台设备。对自用测试够用。
>
> 免费账号拿 Team ID 的方法：打开 Xcode → 左上角菜单 `Xcode` → `Settings` → `Accounts`，登录你的 Apple ID，右边的 Team 列表里会显示类似 `你的名字 (Personal Team)`，括号里或者下面的 ID 就是。

---

## 5. 一键构建 .ipa

还是在 `noname/apps/mobile` 目录，执行：

```bash
pnpm build:ios -- --team=你刚才记下的TeamID
```

比如 Team ID 是 `A1B2C3D4E5`，就写：

```bash
pnpm build:ios -- --team=A1B2C3D4E5
```

**这一步会编译十几分钟**（游戏资源很大）。终端会滚很多字，这是正常的。

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

## 6. 装进 iPhone

用你已装好的 **SideStore**：

1. 把 `export/` 里的 `.ipa` 文件传到手机上（隔空投送 AirDrop 最方便）
2. 打开 SideStore，点 `+`，选那个 `.ipa` 文件
3. 等它装完，桌面上就会出现无名杀的图标

> **7 天过期**：免费账号签的应用每 7 天要重新签一次。SideStore 会在充电 + 连 Wi-Fi 时自动续签，一般不用管。

---

## 7. 关于文件体积（重要，可能会踩坑）

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
- 但 AltStore **安装超过 300 MB 的 .ipa 会报 `Bad Allocation` 错误**（SideStore 同样容易踩）。真遇到这个，需要打补丁或改用电脑端的 AltServer。

**如果构建时因为体积太大失败**，可以先把 `dist/audio/skill`、`dist/audio/die` 这类大目录删掉再构建（游戏能启动，只是对应音效没声音）。有需要我可以帮你写一个「瘦身构建」脚本。

---

## 8. 一些说明（你可能会疑惑的地方）

**为什么 iOS 不需要像安卓那样「选一个目录」？**

安卓要用户手动授权一个可写目录（SAF 机制）；iOS 是沙盒，每个 App 有自己独立的空间，不需要授权。所以 iOS 版直接把自己沙盒里的 `Documents` 目录当作可写区，随 App 打包的资源当作只读区。存档、扩展、导出的文件都会存在 `Documents/noname/` 下。

**新增的那个 `asset-manifest.json` 是干什么的？**

游戏启动时会「列目录」去扫描有哪些武将、卡牌、模式。安卓上这是真实文件系统，能直接列出来；但 iOS 的 WebView 出于安全限制**不提供列目录能力**。所以我在构建时把 `dist/` 里所有文件的路径清单写成了一份 `asset-manifest.json` 一起打包，运行时读它来模拟列目录。这就是我在 `afterSync.ts` 里加的那段逻辑。

**为什么在 Windows 上不能构建 iOS？**

因为 `xcodebuild` 和签名工具只存在于 macOS。所以我写了清晰的报错提示，而不是让你对着一堆看不懂的错误发呆。

---

## 9. 遇到问题怎么办

把终端里的**报错原文**复制下来发给我，我来判断。常见的几类：

| 报错关键词 | 原因 |
| --- | --- |
| `xcodebuild: command not found` | Xcode 没装，或没打开过 Xcode 同意协议 |
| `No signing certificate` | Team ID 填错，或 Apple ID 没在 Xcode 里登录 |
| `Unable to find a destination` | 没装 iOS 模拟器/设备支持，`xcodebuild -downloadPlatform iOS` 可以补 |
| `Bad Allocation` | .ipa 太大，见第 7 节 |
| `iOS project not found` | 没跑第 3 步的 `npx cap add ios` |
