// Shared error-code knowledge for hdc_install / hdc_app / hdc_crash and
// build/sign guidance. Codes are curated from the official errorcode docs
// and this plugin's own live E2E findings; unknown codes pass through
// without a hint.
export const CODE_KNOWLEDGE = {
  '140112': 'ArkTS 状态管理：@Consume 找不到对应的 @Provide（如 navPathStack 未在祖先组件提供）。检查页面组件的状态注入。',
  '9568332': '应用签名：调试证书未绑定当前设备 UDID。在 AGC 证书管理中添加设备后重新签名构建。',
  '10002': '网络：URL 不可达或未声明 ohos.permission.INTERNET。检查权限与后端可用性。',
  '401': 'ArkTS 组件：参数数量不匹配或参数类型错误。',
  '201': '权限校验失败：未在 module.json5 的 requestPermissions 中声明所需权限。',
  '202': '非系统应用调用了系统级接口：换用公开 API 或移除该系统调用。',
  '801': '当前设备不支持该系统能力（SysCap）：核对能力表与目标 API 版本。',
  '9568289': '安装包解析失败：HAP 损坏或格式不被支持，清理构建产物后重新构建。',
  '9568305': '设备存储空间不足：清理设备空间后重试安装。',
  '9568344': '应用未签名或签名已损坏：重新执行签名后再安装。',
  '1300002': '目标应用未安装或 bundleName 不正确：核对 hdc_app 的 bundleName。',
}

// Signing/install problem → one-line fix path (AGC direct link included).
export const SIGN_HINT = '签名问题三步走：AGC 证书管理（https://developer.huawei.com/consumer/cn/doc/app/agc-help-add-device）登记设备 UDID → 重新签名构建 → 重新安装。';

export function codeHint(code) {
  return CODE_KNOWLEDGE[code] || '';
}

// Extract a 4-9 digit numeric code from an error string (used by install/app).
export function extractCode(text) {
  const m = /(?:code[:=]\s*|code\s)(\d{4,9})|(\d{4,9})(?:\s+install|\s+error)/i.exec(String(text || ''));
  return m ? (m[1] || m[2]) : '';
}
