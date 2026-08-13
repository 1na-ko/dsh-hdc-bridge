# Third-Party Notices

`dsh-hdc-bridge` reuses mature external resources wherever possible. This file records
every third-party resource that is incorporated, derived from, or referenced by this
package, together with its license status. The machine-readable source of truth is
`notices.json`; the `license-check` script (`pnpm run license-check` / `npm run license-check`)
verifies that both files stay consistent and that only whitelisted licenses are involved.

License whitelist for anything that ships inside this package or is adapted from a
third-party source: MIT, Apache-2.0, CC-BY-4.0 (with attribution), ISC, BSD-2-Clause,
BSD-3-Clause, 0BSD. Resources without a license, or under GPL/AGPL/LGPL, are never
copied, adapted, or redistributed — they are referenced by link and name only.

## 1. Incorporated dependencies (installed alongside the plugin)

| ID | Package | Version | License | Copyright | Usage |
| --- | --- | --- | --- | --- | --- |
| deveco-cli | `@deveco/deveco-cli` | ^1.2.2 | MIT | Copyright (c) 2026 Huawei Device Co., Ltd. | Optional backend for build/sign/lint/docs tools (`hms_build`, `hms_lint`, `hms_docs`). Declared as an `optionalDependency` so it installs alongside the plugin; never bundled into the tarball. |

## 2. Derived content (adapted, not verbatim)

| ID | Name | License | Copyright | Source |
| --- | --- | --- | --- | --- |
| deveco-cli-skill | `deveco-cli` runtime skill (`lib/skills.mjs`) | MIT | Copyright (c) 2026 Huawei Device Co., Ltd. | <https://gitcode.com/openharmony-sig/deveco-cli/blob/develop/SKILL.md> |

The skill is a translated summary of the official SKILL.md command reference, not a
verbatim copy. The copyright and permission notice is reproduced in the skill content.

## 3. Reference-only (never redistributed)

| ID | Resource | Reason |
| --- | --- | --- |
| harmony-next-skills | linhay/harmony-next.skills | No license file in the repository; linked in README/skill text only. |
| codelinter-rules | DevEco Studio codelinter rules (Apache-2.0, Copyright (c) 2024 Huawei Device Co., Ltd.) | Read from the user's local DevEco Studio install at runtime (`hms_lint` rules); never redistributed. |
| sdk-dts | HarmonyOS SDK `.d.ts` API declarations in a local DevEco Studio install | Read from the user's local SDK install at runtime (`hms_api`); never redistributed. |
| hypium-hamock | `@ohos/hypium`, `@ohos/hamock` (Apache-2.0, distributed via ohpm/Gitee) | Referenced by name in guidance only. |
| open-deveco | open-deveco/\* (deveco-toolbox and its skills repositories) | No license in the repositories; excluded entirely. |
