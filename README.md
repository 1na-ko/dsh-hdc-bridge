# dsh-hdc-bridge

> DSH 原生鸿蒙开发助手：`hdc` 设备闭环调试（看设备 → 截图 → 看图 → 改码 → 装包 → 验证）＋ 官方优先版本化知识层（离线 Tier-1 随包 + SDK 机读 + 官方文档检索）＋ 可选官方 DevEco CLI 构建/签名通道。
> A DSH-native HarmonyOS dev assistant: the hdc device loop (inspect → screenshot → view → fix → install → verify), an official-first version-classified knowledge layer (offline Tier-1 bundled + SDK-accurate reads + official docs search), and an optional official DevEco CLI build/sign backend.

## 定位

[hdc_mcp](https://github.com/yushun667/hdc_mcp) 等 MCP 服务器已覆盖 hdc 能力层。本插件不重写 hdc 协议，直接复用本机 hdc 二进制（3.x），价值在 DSH 原生层：

- 会话内工具卡片与 `read_image` 原生闭环
- 按调用会话解析沙箱策略（与 `pwsh` 工具同款路线），截图写入 `<workspace>/.dsh-hdc/screenshots/`
- 结构化的失败上报（hdc 传输层退出码不可靠，插件用输出标记 + 落盘校验兜底）
- v0.7 起面板按官方 client 插件形态集成（边栏入口 + 浮动面板 + 官方主题），新增 `hms_emulator` 模拟器控制，Tier-1 离线知识层 28 篇

## 截图 / Screenshots

浮动设备面板（点左侧边栏「鸿蒙」入口打开；设备列表 / 系统区 / 工具链徽章 / hilog 尾部，官方主题随深浅色自适应）：

![鸿蒙开发面板](docs/screenshots/panel.png)

## 工具

> 约定：所有工具**失败不抛异常**，统一返回业务值 `{ ok: false, error, hint }`（error 为可读原因，hint 为修复指引）；成功返回带 `ok: true` 的结果对象。工具描述里同时给出 error 示例。这是本插件的显式约定（官方工具层允许抛 ToolFailure，本插件为面板/技能一致性选择返回值形式并在此声明）。

| 工具 | 说明 |
| --- | --- |
| `hdc_list_targets` | 列出已连接设备/模拟器（空列表 + 连接指引） |
| `hdc_connect` | `hdc tconn`（严格 host:port 校验） |
| `hdc_shell` | 设备 shell（param get / ps / uitest dumpLayout…） |
| `hdc_screenshot` | 截图 → 拉取 JPEG → 落盘校验（API 10+ 的 snapshot_display 仅支持 .jpeg） |
| `hdc_install` | 安装 .hap（默认 -r；输出标记级失败检测） |
| `hdc_hilog` | hilog 尾部 N 行（可选域名 `-T` 过滤，如 PARAM） |
| `hdc_ui_dump` | 文本化 UI 快照：uitest 布局树 → 可见文本节点（纯文本模型的「文字截图」） |
| `hdc_ui_find` | 按文本/hint 找控件：返回 bounds 与中心坐标，配合 tap 免手算坐标 |
| `hdc_ui` | UI 操作：tap / doubleTap / longPress / swipe / input / key（Back/Home/Power/keyID），配合 dump 形成「观察 → 操作 → 验证」闭环 |
| `hdc_app` | 应用管理：query / start / stop / clear-data / uninstall（破坏性动作已标注） |
| `hdc_crash` | 崩溃抓取：faultlogger 目录里最近的 jscrash / cppcrash / appfreeze，可按包名过滤，并解析结构化摘要（错误名/信息/错误码/源码帧/已知错误码提示） |
| `hdc_diag` | 诊断：shell 口味 / hdc 路径 / 策略解析 / 探测日志 |
| 错误码提示 | install / app / build 失败按 11 条已知错误码附中文修复建议（9568332 签名未绑 UDID→AGC 登记设备、9568289/9568322 签名配置、1300002 空间不足…）；签名类错误附三类修复（AGC 证书配置 / 重装自签名 / 换 debug 签名）+ 直达 AGC 链接 |
| `hms_setup` | 环境体检：hdc / DevEco Studio / SDK(API 版本) / devecocli / 设备五项 + 目标 API 版本三源解析（项目→设备→SDK）与不一致告警 |
| `hms_build` | 官方构建/签名/运行通道：status / build / run / sign / clean；devecocli 缺失时自动回退本机 hvigorw + hdc_install + hdc_app 闭环 |
| `hms_api` | 官方优先的版本化 API 知识：读本机 SDK `.d.ts`（`@since`/`@deprecated`/`@syscap` 精确到 API 版本），按目标版本分类"可用/已废弃/不可用" |
| `hms_knowledge` | **离线随包官方知识层（Tier-1）**：OpenHarmony 官方文档（CC-BY-4.0）未改文字节选 **28 篇**高频 API 模块、窗口（window/Window 类）、导航组件 Navigation 与应用模型/ArkTS 指南（大文件按节选入，文件内附节选声明），无需 SDK/CLI/网络。catalog / read（先目录后按小节读）/ search |
| `hms_docs` | 官方本地文档检索：`devecocli docs` search / read / catalog（Tier-2：全量文档，需 devecocli） |
| `hms_api_change` | 官方跨版本破坏性变更扫描：`devecocli check compat`（versions / diff）——回答"知识在哪一版变了" |
| `hms_lint` | 官方 lint：rules（本机 57+ 条 codelinter 规则索引）/ read-rule / check（devecocli check lint） |
| `hms_emulator` | 官方模拟器控制（devecocli emulator）：list / start / stop / create / delete + 状态注入 shake / power / rotate / volume / fold / battery / geolocation / sensor / scene；未装 CLI 时按官方 SKILL.md 指路安装（第 20 个工具） |
| 运行时技能 | `hdc-bridge`（设备闭环用法）、`deveco-cli`（官方 SKILL.md 改写，MIT 声明保留）、`harmonyos-knowledge`（知识层纪律：官方优先、版本化、许可合规），模型按需加载 |
| 设备记忆 | 工具默认使用**本会话上次使用的设备**（显式 target 或面板点选设备即切换默认；掉线自动回退首台连接设备）；`hdc_list_targets` 暴露 `preferred/preferredActive` 字段 |
| 设备面板 | **官方 client 插件形态**（对齐平台 cordis 面板与社区远程控制插件）：入口挂左侧边栏 `sidebar.footer.action` 槽位——折叠 rail 态 36px 圆钮 + 状态点 + 数量角标（多条目自动竖排成图标列），展开态「鸿蒙」标签 + 设备数按官方间距紧贴前序按钮；点击经 ReactDOM portal 打开**右上角浮动面板**（拖拽 / 八向缩放 / 收起 / 归位 / × 关闭，不打断主界面）——设备列表（型号/API/电池）、一键截图、hilog 尾部、系统区、工具链徽章；主题走官方 `--dsw-alias-*` token、样式按官方 `data-plugin-css` 约定注入、层级对齐官方弹层，随平台生命周期卸载；面板打开 8s/20s、关闭降为 60s 慢轮询（入口状态点保持新鲜）；数据走 `/api2/hdc-bridge/*` 只读 REST；headless 宿主自动跳过 |
| 可选知识搭配 | Tier-2 社区包 [harmony-next.skills](https://github.com/linhay/harmony-next.skills)（无 LICENSE，不随包，用户自行 `npx skills add linhay/harmony-next.skills`） |

## 安装 / Installation

```sh
# npm 安装 / install from npm
dsh plugin --profile <name> add dsh-hdc-bridge

# 或直接从 GitHub 安装（纯 JS、无构建步骤，无需授权 prepare）/ or install straight from GitHub (plain JS, no build step, no prepare grant needed)
dsh plugin --profile <name> add github:1na-ko/dsh-hdc-bridge

# 验证组合层，然后启动 / verify the composed layer, then boot
dsh --profile <name> --dump-config   # 确认出现 dsh-hdc-bridge 层 / confirms the dsh-hdc-bridge layer
dsh --profile <name>
```

## 环境要求

- HarmonyOS 设备/模拟器；真机需开发者模式 + USB 调试
- hdc 二进制自动探测：DevEco Studio 常见 SDK 路径（`<DevEco>\sdk\<apiVer>\openharmony\toolchains\hdc.exe`，apiVer 覆盖 default/10…18）→ PATH（`where.exe` / `Get-Command` / `which`）
- 截图查看需图像输入模型；纯文本模型可用 `hdc_ui_dump` 做文本化 UI 检查
- 可选后端 `@deveco/deveco-cli`（MIT）随插件作为 optionalDependency 自动安装（pnpm 失败容忍）；构建/签名/lint 的 `--format json` 能力需本机 DevEco Studio ≥ 6.1.0（macOS/Windows，Node ≥ 18）。签名前需一次人工 `devecocli auth login`（浏览器 OAuth）
- `hms_api` / `hms_lint rules` 直接读本机 DevEco Studio/SDK 安装（零再分发）；未装 Studio 时这两项降级并给出指引
- `hms_knowledge` 的 Tier-1 官方知识节选随包内置（28 篇约 1.7MB，CC-BY-4.0 逐字节选并附署名 + 逐文件溯源），**离线可用**，无需任何本机安装
- `hms_api_change`（check compat）需要更高版本的 DevEco Studio（实测 6.1.0.830 报"min required 26.0.0.810"）；不满足时工具返回官方错误原文 + 升级指引，并提示先用 `hms_api` 的 `@since/@deprecated` 版本知识

## 依赖与许可合规

- 所有运行时依赖显式声明；本包代码保持零第三方 npm 依赖（解析器全部手写）
- 引用资源严格分四类并记录于 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)（机器源 `notices.json`）：① 随装依赖（devecocli，MIT）；② 随包内容（`knowledge/` 官方文档逐字节选，CC-BY-4.0 署名 + 逐文件溯源）；③ 改写内容（`deveco-cli` 技能改编自官方 SKILL.md，MIT 版权声明保留）；④ 仅引用不分发（SDK .d.ts、codelinter 规则、harmony-next.skills 等——本机读取或链接指路）
- 发布前跑 `npm run license-check` 门禁：白名单校验（MIT/Apache-2.0/CC-BY-4.0/ISC/BSD/0BSD）、依赖声明与 notices 一致性、改写内容版权行存在性

## 权限与沙箱

- 工具按调用会话解析沙箱策略（会话 cwd 为工作区边界）
- 截图默认写入 `<workspace>/.dsh-hdc/screenshots/`，建议加入项目 `.gitignore`
- 若部署沙箱 runner 不可用（`SandboxUnavailableError`），按 DSH 规范对单条命令以更宽模式升级重试；hvigor 构建因其用户级缓存（`~/.hvigor`、npm 缓存）在工作区外，通常需要该升级
- devecocli 内部会派生管道 stdio 子进程（签名校验、hvigor fork）：在受限沙箱会话中会报 EPERM/误报"未签名"，工具透传官方错误原文并给出沙箱外执行指引（build/run/sign 官方本就标注 [Outside sandbox]）

## 实测矩阵

| 环境 | 结果 |
| --- | --- |
| Windows + hdc 3.2.0c + 真机（API 24） | 全部工具 ✓ |
| Windows + hdc 3.2.0c + 模拟器（API 23） | 全部工具 ✓（含 `-t` 多目标覆盖） |
| 双目标（USB + TCP 模拟器） | 列表/覆盖/默认目标选择 ✓ |
| 无设备 | 结构化降级 + 连接指引 ✓ |
| 装包（签名已绑定 UDID） | 双目标安装成功 + 应用启动 + UI 文本验证 ✓ |
| 装包签名未绑定 UDID | 结构化上报 `9568332` + 修复提示 ✓ |
| v0.2 UI 操作闭环 | tap 聚焦 → input 输入 → dump 验证文本回显 ✓（模拟器实测） |
| v0.2 应用生命周期 | stop → clear-data → uninstall → install → start 全链路 ✓（模拟器实测） |
| v0.2 崩溃抓取 | jscrash 按包名过滤返回源码级堆栈 ✓（模拟器）；无崩溃时优雅返回 ✓（真机） |
| v0.2 实机登录流程 | 拉起 → dump 定位 → 分段输入 → 校验 → 点登录、请求发出 ✓（真机实测） |
| v0.7 面板三态（无头 Edge 实测） | 展开态入口贴排（6px 官方间距）、折叠态四行图标列、往返切换、浮动面板截图即时出图、层级正确 ✓ |
| v0.7 模拟器全量 | 20 工具 + 4 REST 路由 + 知识层 28 篇读取 + `hms_emulator` 降级指路 ✓（发布前回归） |

## 已知限制 / Known limitations

- `snapshot_display` 仅支持 `.jpeg`（API 10+ 实测；API 24 真机 2800×1840 已验证）
- 真机安装需签名 profile 绑定设备 UDID，否则报 `9568332 install sign info inconsistent`（应用签名问题，非插件问题）
- hdc 客户端对远端失败可能仍返回退出码 0，插件以输出标记 + 落盘校验兜底
- **UI 输入实战经验（真机实测）**：
  - 混合字符串（数字→字母→数字）注入时，IME 模式切换会稳定吞掉紧跟字母后的第一个字符；规避：分段输入 + `hdc_ui_dump` 校验 + 缺失字符单独补发
  - 软键盘会改变页面布局：每次点击/输入前使用最新 dump 的坐标，否则可能点到键盘区
  - 键盘可能遮住按钮：先 `hdc_ui action=key key=Back` 收起键盘，再按新坐标点击

## 路线图

- [x] DevEco CLI（devecocli）构建/签名封装（v0.4：可选后端 + hvigorw 降级）
- [x] 官方优先版本化知识层（v0.4：SDK .d.ts + 官方文档检索 + 跨版本变更扫描 + 官方 lint 规则）
- [x] 按 API 版本整理的官方知识节选随包内置（v0.5：`hms_knowledge`，20 个高频主题逐字节选，CC-BY-4.0 合规）
- [x] 会话头部设备面板（v0.6：web 宿主浮动面板 + /api2 REST 数据通道）
- [x] 深度优化 + 面板官方化（v0.7：全量回归 smoke 入 CI、hdc-core/errors 拆分与 11 条错误码、hms_build 工作区预检、`hms_emulator` 模拟器控制、签名三类指引、Tier-1 扩至 28 篇；面板按官方 client 插件形态重做——边栏入口 + portal 浮动面板 + 官方主题 token + 无头浏览器逐态实测）
- [ ] macOS 实机验证

## License

MIT
