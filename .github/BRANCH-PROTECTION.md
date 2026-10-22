# 分支保护规则（branch protection）

> 声明文件：[`branch-protection.json`](./branch-protection.json) ｜ 应用脚本：[`../tools/protect-branch.mjs`](../tools/protect-branch.mjs)

## 重要前提：规则不在 git 仓库里

Branch protection 存在 **GitHub 服务端**，不在仓库中，**`git push` 推不上去**。
所以本目录下的 JSON 只是**期望声明**（source of truth for intent），
真正生效要靠脚本调 GitHub REST API 写入：

```
PUT /repos/{owner}/{repo}/branches/{branch}/protection
```

`.github/` 下的任何文件（Actions、PR 模板、CODEOWNERS）都**管不到**它。

## 为什么要做成文件

规则写进版本库的好处：

1. 变更走 code review，diff 里能看清改了哪条守卫；
2. 新机器 / 新协作者跑一次 `npm run protect:branch` 就能对齐；
3. 规则本身成为项目文档的一部分，不能被悄悄改掉。

**代价（必须知道）**：改了文件不等于生效，**要重新跑一次 `--apply` 并把文件一起 commit**，两者要一致。

## 用法

```bash
npm run protect:branch                      # dry-run：只打印将要提交的载荷 + 等价 curl
npm run protect:branch -- --branch main     # 只看某个分支
npm run protect:branch -- --apply           # 真写（需 GITHUB_TOKEN）
npm run protect:branch -- --apply --yes     # 非交互环境（CI）跳过确认
```

### token 权限

| 类型 | 权限 |
| --- | --- |
| fine-grained PAT | 仓库 **Administration → Write** |
| classic PAT | `repo` scope |

私有仓库的管理员级操作需要该仓库 admin 身份。token 只从环境变量读
（`GITHUB_TOKEN` 或 `GH_TOKEN`），**不写进任何文件、不打进日志**。

## 预设档位

| 档 | 内容 | 适用 |
| --- | --- | --- |
| `safe` | 禁强推、禁删除、管理员也受约束。**不要求 PR、不要求 CI** | 单人项目默认 |
| `strict` | 全部改动走 PR + 1 approve + 线性历史 + 需解决对话 | 有协作者 |
| `ci` | `safe` + 必须通过指定状态检查 | 已有 GitHub Actions |

> ⚠️ **`strict` 在单人仓库慎用**：你会无法直接 push main，只能开 PR 自审自合。
> 真要用，得配 GitHub App / PAT 让机器人账号可 bypass。
>
> ⚠️ **`ci` 档暂不可用**：本项目**目前没有 `.github/workflows/`**，
> `required_status_checks` 的 context 名必须与 workflow 里的 job 名完全一致，
> 否则 PR 会**永久卡住**（GitHub 找不到那个 check）。要启用先把
> `npm run check` 做成 CI workflow。

## 通配符分支不被支持

配置里可以写 `release/*` 这样的模式，但 **branch protection API 只接受精确分支名**。
脚本会**明确跳过**并提示改用 [Repository Rulesets](https://docs.github.com/repos/administering-your-repository/creating-and-managing-rulesets)
（Settings → Rules → Rulesets → New rule），而不是拿 404 让人误以为"规则没生效"。

## 安全设计

1. **默认 dry-run**，必须显式 `--apply` 才写；
2. `--apply` 前打印「现状 vs 期望」差异并要求确认；
3. token 只从环境变量读；
4. 幂等——规则没变就报「已是目标状态」并 exit 0；
5. **载荷自检**（`selfCheckPayload`）——见下。

## 载荷自检：为什么必须存在

GitHub 这个载荷里有两个**方向陷阱**：

```jsonc
{ "allow_force_pushes": { "enabled": true } }   // 含义是【允许】强推
{ "allow_deletions":    { "enabled": true } }   // 含义是【允许】删除分支
```

`enabled` 是「是否**允许**」，不是「是否启用这条保护」。写代码时若按后者理解，
就会生成 `allowForcePushes: false` → `enabled: true` 的**反向**载荷：

- 字段齐全、HTTP 200、**GitHub 不报任何警告**；
- 但规则看着有、实则把守卫**全关了**。

这是典型的**静默失效**，肉眼看 dry-run 输出很难发现（得逐字段核对语义）。
所以脚本在写入前自查：配置里写了 `allowForcePushes: false`，
载荷里对应的 `enabled` 就**必须**是 `false`，否则**中止并 exit 3**。

**已用负向验证确认该自检真的会触发**（故意注入方向错误 → 自检中止 exit 3 → 恢复后 exit 0）。