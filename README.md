# dsh-hdc-bridge

> DSH 原生鸿蒙设备桥：通过 `hdc` 让 Agent 在会话内完成「看设备 → 截图 → 看图 → 改码 → 装包 → 再看」的闭环调试。
> A DSH-native HarmonyOS device bridge: hdc tools for the agent loop (inspect → screenshot → view → fix → install → verify).

## 定位

[hdc_mcp](https://github.com/yushun667/hdc_mcp) 等 MCP 服务器已覆盖 hdc 能力层。本插件不重写 hdc 协议，直接复用本机 hdc 二进制（3.x），价值在 DSH 原生层：

- 会话内工具卡片与 `read_image` 原生闭环
- 按调用会话解析沙箱策略（与 `pwsh` 工具同款路线），截图写入 `<workspace>/.dsh-hdc/screenshots/`
- 结构化的失败上报（hdc 传输层退出码不可靠，插件用输出标记 + 落盘校验兜底）

## 工具

| 工具 | 说明 |
| --- | --- |
| `hdc_list_targets` | 列出已连接设备/模拟器（空列表 + 连接指引） |
| `hdc_connect` | `hdc tconn`（严格 host:port 校验） |
| `hdc_shell` | 设备 shell（param get / ps / uitest dumpLayout…） |
| `hdc_screenshot` | 截图 → 拉取 JPEG → 落盘校验（API 10+ 的 snapshot_display 仅支持 .jpeg） |
| `hdc_install` | 安装 .hap（默认 -r；输出标记级失败检测） |
| `hdc_hilog` | hilog 尾部 N 行（可选域名 `-T` 过滤，如 PARAM） |
| `hdc_ui_dump` | 文本化 UI 快照：uitest 布局树 → 可见文本节点（纯文本模型的「文字截图」） |
| `hdc_ui` | UI 操作：tap / doubleTap / longPress / swipe / input / key（Back/Home/Power/keyID），配合 dump 形成「观察 → 操作 → 验证」闭环 |
| `hdc_app` | 应用管理：query / start / stop / clear-data / uninstall（破坏性动作已标注） |
| `hdc_crash` | 崩溃抓取：faultlogger 目录里最近的 jscrash / cppcrash / appfreeze，可按包名过滤 |
| `hdc_diag` | 诊断：shell 口味 / hdc 路径 / 策略解析 / 探测日志 |
| 错误码提示 | install / app 失败时按错误码附中文修复建议（如 9568332 → 登记设备 UDID） |

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

## 权限与沙箱

- 工具按调用会话解析沙箱策略（会话 cwd 为工作区边界）
- 截图默认写入 `<workspace>/.dsh-hdc/screenshots/`，建议加入项目 `.gitignore`
- 若部署沙箱 runner 不可用（`SandboxUnavailableError`），按 DSH 规范对单条命令以更宽模式升级重试；hvigor 构建因其用户级缓存（`~/.hvigor`、npm 缓存）在工作区外，通常需要该升级

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

## 已知限制 / Known limitations

- `snapshot_display` 仅支持 `.jpeg`（API 10+ 实测；API 24 真机 2800×1840 已验证）
- 真机安装需签名 profile 绑定设备 UDID，否则报 `9568332 install sign info inconsistent`（应用签名问题，非插件问题）
- hdc 客户端对远端失败可能仍返回退出码 0，插件以输出标记 + 落盘校验兜底
- **UI 输入实战经验（真机实测）**：
  - 混合字符串（数字→字母→数字）注入时，IME 模式切换会稳定吞掉紧跟字母后的第一个字符；规避：分段输入 + `hdc_ui_dump` 校验 + 缺失字符单独补发
  - 软键盘会改变页面布局：每次点击/输入前使用最新 dump 的坐标，否则可能点到键盘区
  - 键盘可能遮住按钮：先 `hdc_ui action=key key=Back` 收起键盘，再按新坐标点击

## 路线图

- [ ] 会话头部设备面板（实验版已用动态插件形态验证；正式版走 Typert Remote 通道后发布）
- [ ] DevEco CLI（devecocli）构建/签名封装，替代裸 hvigor 的缓存升级需求
- [ ] macOS 实机验证

## License

MIT
