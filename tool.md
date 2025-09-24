ChatermClient Agent 搜索工具落地方案（Glob + Grep）

目标
- 提供两类高阶工具：
  - 文件检索（Glob）按文件名/路径匹配
  - 内容查找（Grep）按正则匹配文件内容
- 对外参数清晰、结果结构化；在实现层面将执行后端融合到现有远程终端能力中，保持最小依赖与一致行为。

适配前提
- 不使用 ripgrep（rg），统一基于系统 grep 实现内容查找；必要时本地可回退 JS 读取方案。
- 不依赖 Git 仓库能力（不使用 git grep、不依赖 .git 索引）。
- 忽略策略：本地可选尊重 `.clineignore`；默认不强制 `.gitignore`；远程不应用 `.clineignore/.gitignore`。

对外工具接口（LLM 可调用）
- 工具名（新增）
  - `glob_search`：根据 glob pattern 返回匹配文件列表
  - `grep_search`：根据正则在文件内容中查找匹配

- 参数与返回（TypeScript 约定，主进程实现使用）：

```
// 文件检索（Glob）
export interface GlobSearchParams {
  pattern: string                 // 例如 "src/**/*.ts"、"**/*.md"
  path?: string                   // 起始目录（相对工作区），缺省为工作区根
  ip?: string                     // 目标主机；省略或本机 → 本地实现；其它 → 远程
  limit?: number                  // 结果上限（默认 2000）
  sort?: 'path' | 'none'          // 默认 'path'（按路径字母序）；远程不做 mtime 排序
}

export interface GlobMatch { path: string; mtimeMs?: number; size?: number }
export interface GlobSearchResult {
  files: GlobMatch[]
  total: number                   // 未截断总数（若可得）
  truncated: boolean
  ignored?: { git?: number; cline?: number }
}

// 内容查找（Grep）
export interface GrepSearchParams {
  pattern: string                 // 正则（默认忽略大小写）
  path?: string                   // 起始目录，相对工作区
  ip?: string                     // 目标主机
  include?: string                // 文件过滤 glob（如 "*.{ts,tsx}"、"src/**"）
  case_sensitive?: boolean        // 默认 false（与 grep 的 -i 对应：false => 添加 -i 忽略大小写；true => 不添加 -i）
  context_lines?: number          // 上下文行数（默认 0 或 1）
  max_matches?: number            // 最大匹配数（每主机，默认 500）
}

export interface GrepMatch { file: string; line: number; text: string }
export interface GrepSearchResult {
  matches: GrepMatch[]
  total: number                   // 未截断总数（若可得）
  truncated: boolean
}
```

- 文本摘要（用于 LLM 上下文）：
  - Glob：`Found 27 files matching "src/**/*.ts" in ./src (sorted by path)`
  - Grep：`Found 134 matches for /getUser\s*\(/ in ./src (filter: "*.ts")`

执行后端设计
- 本地（优先复用已有服务）
  - Glob：基于 globby 列出匹配文件，可选尊重 `.gitignore` 与 `.clineignore`；按路径排序，支持 limit。
    - 参考：`ChatermClient/src/main/agent/services/glob/list-files.ts:1`
    - 新增导出：`globSearch(cwd: string, params: GlobSearchParams, ignore?: ChatermIgnoreController): Promise<GlobSearchResult>`（已实现）
  - Grep：基于系统 grep（`grep -RInE`）实现，必要时回退为 JS 逐文件读取匹配（小范围/开发机）。
    - 新增本地模块：`ChatermClient/src/main/agent/services/grep/index.ts`（已实现）
      - 导出：`regexSearchMatches(cwd, path, regex, include?, max?, ctx?, cs?) => GrepSearchResult`（大小写映射到 `-i`）

- 远程（融合 RemoteTerminalManager）
  - 统一通过 `RemoteTerminalManager` 执行命令，并解析为结构化结果。
  - 新文件：`ChatermClient/src/main/agent/services/search/remote.ts:1`（骨架已提交）
    - `globSearchRemote(ip: string, params: GlobSearchParams): Promise<GlobSearchResult>`
      1) Bash glob：`bash -lc 'shopt -s nullglob dotglob globstar; cd "<path>"; for f in <pattern>; do printf "%s\n" "$(realpath "$f")"; done'`
      2) find：必要时将 glob 转换为 `find` 的 `-name/-path` 组合（如 `*.log`、`*suffix*` 等）
    - `grepSearchRemote(ip: string, params: GrepSearchParams): Promise<GrepSearchResult>`
      1) `grep -RInE <csFlag> -m <max> --binary-files=without-match --exclude-dir={proc,sys,dev} --include "<include>" "<pattern>" "<path>"`
         - csFlag：当 `case_sensitive=false` 时使用 `-i`；为 `true` 时不添加该参数（已提供命令构建器）
    - 同时提供命令构建与输出解析函数（便于集成 RemoteTerminalManager）：
      - `buildRemoteGlobCommand(...)` + `parseRemoteGlobOutput(...)`
      - `buildRemoteGrepCommand(...)` + `parseRemoteGrepOutput(...)`
    - 解析：
      - grep：`file:line:content`（注意文件名、内容中冒号的解析）

忽略与边界
- 本地：
  - `.gitignore`：默认不强制。
  - `.clineignore`：默认开启，通过 `ChatermIgnoreController.validateAccess()` 过滤（`ChatermClient/src/main/agent/core/ignore/ChatermIgnoreController.ts:1`）。
- 远程：
  - 不应用 `.gitignore/.clineignore`；全局范围查找，建议配合 `path/include` 收敛范围。

集成点与改动清单（最小变更）
1) 扩展 ToolUse 协议
   - 文件：`ChatermClient/src/main/agent/core/assistant-message/index.ts:1`
   - 在 `toolUseNames` 中新增：`'glob_search' | 'grep_search'`
   - 在 `toolParamNames` 中新增：`'pattern' | 'include' | 'ip' | 'path' | 'case_sensitive' | 'limit' | 'context_lines' | 'max_matches'`

2) Task 分发逻辑
   - 文件：`ChatermClient/src/main/agent/core/task/index.ts:1`
   - 新增处理分支：
     - `handleGlobSearchToolUse(block)`：参数校验 → 根据 `ip` 走本地或远程 → `this.pushToolResult()`（文本 + 可选 JSON）
     - `handleGrepSearchToolUse(block)`：同上，支持 include/context/max 等
   - 安全：两个工具不执行任意命令，默认标记为“安全工具”，可纳入自动批准策略（`shouldAutoApproveTool`）。
   - 多主机：`ip` 支持逗号分隔，逐台执行并聚合（文本摘要中标注 host，结构化结果可携带 `host` 字段）。

3) 本地服务扩展
   - 文件：`ChatermClient/src/main/agent/services/glob/list-files.ts:1`
    - 新增 `globSearch`：
      - 使用 globby 执行 pattern；`gitignore: false`，`dot: true`；
       - 结果经 `.clineignore` 过滤；
       - 获取 mtime、size（可选）；
       - 排序与 limit；返回 `GlobSearchResult`。
   - 新增本地 grep 模块：`ChatermClient/src/main/agent/services/grep/index.ts`
     - 导出 `regexSearchMatches`：
       - 通过 `child_process.spawn('grep', ['-RInE', ...])` 执行系统 grep；
       - 支持 include/context/max/case_sensitive；
       - 解析 `file:line:content` 输出并返回 `GrepSearchResult`。

4) 远程服务新增
   - 新文件：`ChatermClient/src/main/agent/services/search/remote.ts:1`
     - 通过 `RemoteTerminalManager` 组装命令并执行；
     - 严格模板化构造命令（参数 shell-escape），避免注入；
     - 解析 grep/find 输出为统一结构，并考虑超长截断（`truncated=true`）。

5) 可选：高阶工具类（便于单测与复用）
   - 目录建议：`ChatermClient/src/main/agent/core/task/high-tools/`
   - 新增：`glob_tool.ts`、`grep_tool.ts`
   - 暴露 `static readonly name/description/parameterSchema/execute()`，内部调用本地/远程服务；Task 通过工具类执行。

验证与测试
- 单元测试（建议）：
  - 本地 glob：忽略规则、排序、limit；
  - 本地 grep：系统 grep 输出解析、context/max；
  - 远程解析：模拟 grep/find 输出，验证解析与截断；
  - 边界：空结果、非法路径、越界路径防护。
- 手动联调：
  - 本地仓库：`glob_search`、`grep_search` 在 `src/**` 目录验证；
  - 远程主机：在不同发行版/环境（忙碌的系统/权限受限路径）验证 grep/find 的稳定性与性能。

安全与注意事项
- 正则语义以 grep ERE（-E）为准；尽量提供具体 `include/path` 降低全盘扫描成本。
- 超大结果集：设置结果上限与 `truncated` 标志，并在摘要中引导二次收窄（更具体 `include`/`path`/关键字）。
- 忽略策略：本地可启用 `.clineignore`；远程不应用 `.clineignore/.gitignore`。
- 命令注入：远程命令全部通过模板化+转义构造；不透传用户原始命令。

实施里程碑
1) 协议与入口：扩展 ToolUse、Task 分发（含多主机聚合）
2) 本地能力：实现 `globSearch`、`regexSearchMatches`
3) 远程能力：实现 `remote.ts`（grep/find 策略）
4) 返回格式：统一结构化结果 + 文本摘要；渲染层可选增强（按文件分组展示）
5) 测试与文档：补充单测与 README_zh 简要指引

验收标准
- 在本地与至少一台远程主机上：
  - glob：能按 `src/**/*.ts` 返回文件列表并正确排序/截断；
  - grep：能按 `getUser\s*\(` + `include: *.ts` 返回匹配；
  - 多主机：逗号分隔 IP 聚合展示；
  - 忽略：本地 `.clineignore` 生效、远程不生效；
  - 大结果集：`truncated=true`，并返回合理摘要文本。

示例（LLM → 工具调用 → 摘要文本）
- Glob：
  - 输入：`{ pattern: "src/**/*.ts", path: "src", limit: 300 }`
  - 摘要：`Found 128 files matching "src/**/*.ts" in ./src (sorted by path)`
  - 结构：`{"files":[{"path":"src/main/index.ts","mtimeMs":...}],"total":128,"truncated":false}`
- Grep：
  - 输入：`{ pattern: "getUser\\s*\\(", include: "*.ts", path: "src", context_lines: 1 }`
  - 摘要：`Found 134 matches for /getUser\s*\(/ in ./src (filter: "*.ts")`
  - 结构：`{"matches":[{"file":"src/services/user.ts","line":42,"text":"export function getUser(id: string) {"}],"total":134,"truncated":false}`

备注
- 如未来需提升远端性能，可在不改变接口的前提下引入 fd/rg 等更快工具作为可选策略。
