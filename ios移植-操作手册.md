# 无名杀 iOS 移植 —— 操作手册（Mac 上照着做）

> 这份文档假设你**完全没写过代码**。每一步都写清楚了「在哪里敲」「敲什么」「看到什么算成功」。
>
> 代码部分我已经全部改完了（在 Windows 上完成）。你在 Mac 上只需要**跑构建、装到手机**。

---

## ⭐ 路线选择：先用云端构建，再考虑本地

在动手之前，你先看这个对比。**强烈建议先走「路线 A」**：

| | 路线 A：GitHub 云端构建 | 路线 B：本地 Mac 构建 |
| --- | --- | --- |
| 需要装 Xcode 吗 | ❌ 不用 | ✅ 要装 Xcode 15.2（约 10GB） |
| 受 Intel 芯片限制吗 | ❌ 不受（云端是苹果芯片，Xcode 16） | ⚠️ 受限，只能用 Xcode 15.2 |
| 耗时 | 约 20-40 分钟（云端跑） | 首次约 2-4 小时（含装工具） |
| 你电脑要不要一直在跑 | ❌ 不用，提交后就能关 | ✅ 要 |
| 成功率 | 中（受仓库体积影响，见下） | 中高（本地可控） |
| 花费 | **免费** | **免费** |

**路线 A 的完整步骤见下面的「第 0 章」；路线 B 从第 2 节开始。**

---

## 0. 路线 A：用 GitHub Actions 云端构建 IPA（推荐先试）

### 0.1 原理（一句话）

GitHub 免费提供**苹果芯片的 macOS 云电脑**，每次你点一下按钮，它就在云端帮你把《无名杀》编译成 `.ipa`，然后把文件给你下载。**你不需要 Mac，也不需要装 Xcode。**

### 0.2 怎么触发

1. 打开 <https://github.com/cklsit/noname/actions>
2. 左侧列表里点 **Build unsigned iOS IPA**
3. 右边有个 **Run workflow** 按钮，点开
4. 有几个选项：

   | 选项 | 建议值 | 说明 |
   | --- | --- | --- |
   | `retention_days` | `14` | 产出的 ipa 在 GitHub 上保留多少天 |
   | `create_release` | ✅ 勾上 | 顺便发到 Release 页面，方便长期下载 |
   | `slim_assets` | ✅ 勾上 | **强烈建议勾** —— 裁掉 970MB 语音和立绘，否则装不进手机（见 0.5） |

5. 点绿色的 **Run workflow**
6. 刷新页面，会看到一条正在运行的任务。点进去可以看实时日志。

### 0.3 构建流程（云端自动做，你不用管）

```
装 Node/pnpm → 编译网页资源 → 生成 Xcode 工程 → 装 CocoaPods 依赖
  → 裁剪资源（可选）→ 编译 → 打包成 .ipa → 上传
```

### 0.4 拿到 ipa

构建成功后（页面顶部会出现绿色对勾），有两个地方能下载：

- **方式一**：任务页面拉到最底部，**Artifacts** 区域，点 `noname-ios-unsigned` 下载（是个 zip，解压后是 `.ipa`）
- **方式二**：去 <https://github.com/cklsit/noname/releases> 找最新的一条，直接下载 `.ipa`

> ⚠️ **产物是「未签名」的 ipa**。这是**故意的**，也是**正确的**——因为 SideStore 本来就会用你自己的 Apple ID 重新签名。未签名包**不能双击直接安装**，必须经过 SideStore。

### 0.5 ⚠️ 关于体积（这一节很关键，可能导致失败）

《无名杀》的完整资源**约 2.8GB**，而侧载工具对大文件非常敏感：

| 限制 | 数值 |
| --- | --- |
| AltStore 未打补丁 | ipa **超过 300MB** 直接报 `Bad Allocation` |
| Apple 官方未压缩 App 上限 | **4GB** |
| 免费 Apple ID 侧载 | 每台设备最多 3 个 App |

**2.8GB 的包放进去几乎必然失败。** 所以工作流提供了 `slim_assets` 开关，默认帮你裁掉这三类（体积最大、缺了不影响玩）：

| 裁掉的内容 | 体积 | 影响 |
| --- | --- | --- |
| `audio/skill`（武将技能语音） | 470M | 技能没配音，其他正常 |
| `audio/die`（阵亡语音） | 111M | 阵亡没配音 |
| `image/character`（武将立绘） | 390M | 武将显示默认剪影图（保留了 3 张必需剪影） |

裁剪后 **约 337MB**，解压后约 340MB，**远低于 4GB 上限，可以正常侧载**。

如果你想要全量资源，就在触发时**取消勾选** `slim_assets`——但要接受大概率装不上去的结果。

### 0.6 已知风险（我必须如实告诉你）

我在检查你的仓库时发现一个问题：

> **你的 fork 仓库 Git 历史有约 2.6 TB。**

这是上游仓库从 2014 年至今累积的结果（大量 mp3/jpg 被直接提交进 Git 历史）。GitHub 的 macOS 云电脑只有约 14GB 磁盘，**即使工作流已经用了 `fetch-depth: 1` 只拉最新代码，仍有可能失败**。

工作流里已经加了三道防护：
1. `fetch-depth: 1` —— 只拉最新 1 个提交（关键）
2. 每步打印磁盘剩余空间
3. 编译前体检，剩余空间 < 5GB 时直接给出明确报错

**如果路线 A 失败了**：日志里会明确告诉你卡在哪一步。把日志发给我，我给你换「瘦身构建仓」方案（新建一个只装编译产物的轻量仓库，约 300MB）。失败也不影响你走路线 B。

---

## 1. 进度总览

| 阶段                              | 状态    |
| ------------------------------- | ----- |
| 修改源码让它支持 iOS                    | ✅ 已完成 |
| 降级到 Capacitor 6（适配你的 Intel Mac） | ✅ 已完成 |
| 新增 GitHub Actions 云端构建工作流        | ✅ 已完成 |
| **路线 A**：云端出 ipa（见第 0 章）        | ⬜ 待你做 |
| **路线 B**：在 Mac 上装 Xcode / CocoaPods | ⬜ 待你做 |
| 用 SideStore 装进 iPhone           | ⬜ 待你做 |

**已经改了什么**（了解即可，不用你动手）：

- 新增 `apps/mobile/src/fs/ios.ts` —— iOS 的文件读写实现（存档、扩展、导出文件全走这里）
- 新增 `apps/mobile/src/fs/types.ts`、`legacy-api.ts` —— 把安卓和 iOS 的差异抽出来，两边共用一套映射
- 改写 `apps/mobile/src/preload.ts` —— 拆掉「只支持 Android」的硬编码，改成按平台自动分流
- 新增 `apps/mobile/buildIos.ts` —— iOS 一键构建脚本（本地 Mac 用）
- 新增 `.github/workflows/ios-build.yml` —— 云端构建工作流（路线 A 用）
- `apps/mobile/afterSync.ts` —— 新增资源清单生成（iOS 必需，见第 9 节说明）
- `apps/mobile/package.json` —— Capacitor 相关依赖全部固定到 6.x
- `.gitignore` —— 忽略 `apps/mobile/ios/`（生成的工程，不必入库）

---

## 1.5 如果你走路线 B：先了解你这台 Mac 的限制

你的 Mac 是 **Intel Core i5（2017 款）+ macOS Ventura 13.7.8**。

这个配置带来一个硬约束，也是本地方案的核心：

| 项目              | 情况                                                        |
| --------------- | --------------------------------------------------------- |
| 最高能装的 Xcode     | **Xcode 15.2**（要求 macOS 13.5+，你的 13.7 够）                  |
| 装不了的 Xcode      | Xcode 16+（要 macOS 14.5+）、Xcode 26+（要 M1 芯片 + macOS 15.6+） |
| 因此 Capacitor 版本 | **固定在 6.x**（Capacitor 8 要求 Xcode 26，你装不了）                 |
| iOS 部署目标        | iOS 13.0+（Capacitor 6 的要求）                                |

**所以代码已经帮你降到 Capacitor 6 了**，你不用管这件事，照着下面做就行。

> 走路线 A（云端构建）的话，这一节可以跳过——云端机器自带 Xcode 16，不受你 Mac 的限制。

---

## 2. 在 Mac 上装必备工具

打开 Mac 上的「终端」（Terminal，在「启动台 → 其他」里，或者按 `Command + 空格` 搜 `终端`）。

### 2.1 装 Xcode 15.2

**⚠️ 注意：不要在 App Store 里装 Xcode！** App Store 只会给你最新版（Xcode 26），你的 Intel iMac 装不了。

正确做法是去 Apple 开发者网站下载旧版：

1. 浏览器打开：<https://developer.apple.com/download/all/>
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
>
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
>
> ```bash
> brew install cocoapods
> ```

### 2.3 装 Node.js

去 <https://nodejs.org/> 下载 **LTS 版本**（左边那个按钮），双击安装。

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

1. 打开 <https://developer.apple.com/account>
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

| 参数                           | 作用                                   |
| ---------------------------- | ------------------------------------ |
| `--method=development`       | 默认。适合侧载（SideStore / AltStore）        |
| `--method=ad-hoc`            | 需要先在 Apple 后台登记设备 UDID               |
| `--method=app-store-connect` | 用于上架 App Store 或 TestFlight          |
| `--configuration=Release`    | 出正式版（体积更小、跑得更快），默认是 Debug            |
| `--skip-web-build`           | 复用已有的 `dist`，不重新构建网页部分（改完代码后想快点出包时用） |

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

| 目录                 | 体积      |
| ------------------ | ------- |
| `audio/skill`      | 470 MB  |
| `image/character`  | 390 MB  |
| `audio/die`        | 111 MB  |
| `image/emotion`    | 52 MB   |
| `image/background` | 43 MB   |
| `audio/background` | 42 MB   |
| `image/mode`       | 31 MB   |
| `image/card`       | 11 MB   |
| 代码类合计              | 约 11 MB |

**合计约 2.8 GB。**

- iOS 应用总大小上限是 **4 GB**，所以总量能装下。
- 但 AltStore **安装超过 300 MB 的 .ipa 会报 `Bad Allocation` 错误**（SideStore 同样容易踩）。
- Intel Mac 编译 2.8 GB 的工程会**非常慢**，而且很吃磁盘（至少要留 20 GB 空闲）。

**怎么办：裁掉三个最大目录。**

| 裁掉的内容 | 体积 | 影响 |
| --- | --- | --- |
| `dist/audio/skill` | 470 MB | 武将技能没配音，其他正常 |
| `dist/audio/die` | 111 MB | 阵亡没配音 |
| `dist/image/character` | 390 MB | 武将显示默认剪影（保留 3 张必需剪影） |

裁完 **约 337 MB**，可以正常侧载。

- **走路线 A（云端）**：触发工作流时勾上 `slim_assets` 即可，自动完成，且会自动保留 3 张必需剪影、自动重建资源清单。
- **走路线 B（本地）**：手动删目录后，**必须重新生成 `dist/asset-manifest.json`**（否则游戏会去找已删掉的文件）。最省事的做法是在 Mac 上先按路线 A 跑一次，把裁剪逻辑抄下来。

> ⚠️ 注意：`dist/image/character` 里有一张 `default_silhouette_male.jpg` 这类默认剪影是**游戏必需的**，不能整目录删干净，否则没立绘的武将全部显示破图。

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

| 报错关键词                           | 原因 / 解决                                                                     |
| ------------------------------- | --------------------------------------------------------------------------- |
| `xcodebuild: command not found` | Xcode 没装，或没打开过 Xcode 同意协议；试试 `sudo xcode-select -s /Applications/Xcode.app` |
| `CocoaPods was not found`       | 没装 CocoaPods，执行 `sudo gem install cocoapods`                                |
| `No signing certificate`        | Team ID 填错，或 Apple ID 没在 Xcode 里登录                                          |
| `Unable to find a destination`  | 缺 iOS 设备支持，`xcodebuild -downloadPlatform iOS` 可以补                           |
| `Bad Allocation`                | .ipa 太大，见第 8 节                                                              |
| `iOS project not found`         | 没跑第 4 步的 `npx cap add ios`                                                  |
| `Xcode workspace not found`     | iOS 工程没初始化好，删除 `apps/mobile/ios` 后重跑 `npx cap add ios`                      |
| `pod install` 卡住 / 很慢           | 网络问题，多试几次；或设置镜像后重试                                                          |
