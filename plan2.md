# Chaterm DB-AI SQL 安全分类与执行路由修复计划

## 0. 一句话结论

`execute_write_query` 把「只读 Guard 未通过」当成「这是写 SQL，可以执行」。这个反集推导是错的：

```text
not(readonly) != write
```

Guard 返回失败可能意味着确定的写操作，也可能意味着语法错误、多语句、可执行注释、复杂度超限、方言不匹配或无法静态验证。当前实现把后面这些全部当成「写 SQL」交给 driver 执行。

---

## 1. 实测基线（本次重新测量，修正了旧版文档）

测量方式：用 esbuild 单独编译 `sql-readonly-guard.ts` 与 `execute-write-query.ts`，注入 mock driver 统计 `executeQuery` 实际调用次数。`node_modules` 未安装，因此没有走 vitest。

### 1.1 写工具路由实测

| SQL | 结果 | driver 调用 | 说明 |
| --- | --- | --- | --- |
| `SELECT 1; DROP TABLE users` | EXECUTED | 1 | **多语句被执行** |
| `SELECT 1 /*! INTO OUTFILE '/tmp/x' */` | EXECUTED | 1 | **可执行注释被执行** |
| `nestedWith(400)`（`E_COMPLEXITY_LIMIT`） | EXECUTED | 1 | **复杂度超限被执行** |
| `BEGIN dbms_output.put_line('x'); END;` | EXECUTED | 1 | Oracle 匿名块被执行 |
| `CALL sp()` | EXECUTED | 1 | 无法验证副作用 |
| `PRAGMA table_info(users)`（MySQL） | EXECUTED | 1 | 方言不匹配 |
| `SELECT 1 UNION SHOW TABLES` | EXECUTED | 1 | 语法错误 |
| `SELECT outfile FROM logs` | EXECUTED | 1 | **只读查询流入写通道** |
| `SELECT * FROM outfile` | EXECUTED | 1 | 同上 |
| `SELECT x AS outfile FROM logs` | EXECUTED | 1 | 同上 |
| `SELECT t.outfile FROM logs t` | EXECUTED | 1 | 同上 |
| `UPDATE t SET a=1` | EXECUTED | 1 | 预期行为 |
| `SELECT 1` | refused | 0 | `E_INVALID_PARAM`，唯一的拒绝路径 |

**关键修正：旧版文档 §1 表格把 `E_COMPLEXITY_LIMIT` 和 `E_EXECUTABLE_COMMENT` 标注为「已 fail closed」，这是错的。** 那份标注来自一份已丢失的未提交改动（`isUnverifiableRejection()`）。在干净 HEAD 上，写工具唯一的拒绝条件是 `guard.ok === true`，其余全部执行。

因此严重性排序也要跟着改：**多语句执行是本次最高危项，不是已修项。** `SELECT 1; DROP TABLE users` 被 Guard 明确判定为危险，写工具却正因为 Guard 判定失败而执行它。

### 1.2 Guard 直接调用实测

| SQL | dialect | Guard 结果 |
| --- | --- | --- |
| `SELECT outfile FROM logs` | mysql | `E_NOT_WHITELISTED`（误拒） |
| `SELECT dumpfile FROM logs` | mysql | `E_NOT_WHITELISTED`（误拒） |
| `SELECT into_count FROM logs` | mysql | ok（正确，说明只有 `outfile`/`dumpfile` 裸标识符受影响） |
| `SELECT * FROM t FOR UPDATE` | mysql | **ok（锁定读被当普通只读放行）** |
| `SELECT * FROM t FOR NO KEY UPDATE` | postgresql | **ok** |
| `SELECT * FROM t FOR SHARE` | mysql | **ok** |
| `SELECT * FROM t LOCK IN SHARE MODE` | mysql | **ok** |
| `EXPLAIN EXPLAIN SELECT 1` | mysql | **ok（双重 EXPLAIN 前缀）** |
| `SHOW TABLES` | mysql | ok（`explain_plan` 会拼成 `EXPLAIN SHOW TABLES`） |
| `DESC users` | mysql | ok（同上） |
| `SELECT pg_advisory_lock(1)` | postgresql | ok（文本分类器无法判定，见 §7） |
| `SELECT GET_LOCK('a',1)` | mysql | ok（同上） |
| `BEGIN NULL; END;` | oracle | `E_MULTIPLE_STATEMENTS`（内部分号，非 `E_NOT_WHITELISTED`） |
| `SELECT 'x; DROP TABLE users` | mysql | **ok（未闭合字面量吞掉分号，只读工具会执行）** |
| `UPDATE t SET a='unterminated` | mysql | `E_NOT_WHITELISTED`（**不是** `E_UNTERMINATED_LITERAL`） |

最后两行是步骤 1 实施过程中发现的 stripper fail-open，成因与修复见 §1.5。

### 1.3 复杂度预算实测

预算由 `MAX_RECURSION_DEPTH = 32` 和 `MAX_TOTAL_WORK = 2_000_000` 构成，只在递归路径（CTE body、顶层 set operand、EXPLAIN target）上消耗。

```text
嵌套 400 层 CTE      -> E_COMPLEXITY_LIMIT
扁平 400 个 CTE      -> ok        ← 合法 SQL，必须放行
扁平 400 段 UNION    -> ok        ← 合法 SQL，必须放行
```

写复杂度测试时必须用仓库现有测试的构造形式，否则测不到预算：

```ts
// 会递归，消耗预算
const nestedWith = (n) => { let s = 'SELECT 1'; for (let i=0;i<n;i++) s = `WITH c${i} AS (${s}) SELECT * FROM c${i}`; return s }
const nestedUnion = (n) => { let s = 'SELECT 1'; for (let i=0;i<n;i++) s = `(${s}) UNION ALL (SELECT ${i})`; return s }

// 不会递归：Guard 不下钻 FROM 子查询，返回 ok
let s = 'SELECT 1'; for (let i=0;i<400;i++) s = `SELECT * FROM (${s} UNION SELECT 1) x${i}`
```

不要断言「任意 400 层结构必然超限」。

### 1.4 性能实测（50KB 工具上限内）

| 输入 | 耗时 |
| --- | --- |
| 50 KB 最坏情况 literal 密度 | 12.8 ms |
| 50 KB 普通 SELECT | 2.2 ms |

`stripCommentsAndLiterals()` 每次 `blankRange()` 重建整串，确实是二次复杂度，但工具层 50KB 硬上限把最坏情况压到 13 ms 量级，不构成主进程阻塞。**stripper 线性化属于代码整洁性改进，不属于本次安全修复**，不进入本计划的任何步骤。

---

## 2. 目标架构：三态分类

用三态分类替代布尔 Guard，最终形态：

```ts
export type SqlDisposition =
  | { kind: 'readonly'; skeleton: string }
  | { kind: 'requires_approval'; operation: 'dml' | 'ddl' | 'lock' | 'session' | 'other_stateful'; skeleton: string }
  | { kind: 'reject'; errorCode: GuardErrorCode; reason: string }

export function classifySql(sql: string, dialect: GuardDialect): SqlDisposition
```

路由矩阵：

| 分类 | `execute_readonly_query` | `execute_write_query` |
| --- | --- | --- |
| `readonly` | 执行 | 拒绝，提示改用只读工具 |
| `requires_approval` | 拒绝 | 审批后执行 |
| `reject` | 拒绝 | 拒绝，不弹审批、不调 driver |

核心原则：**写操作必须靠正向识别（明确的动词允许表），不能靠只读判定取反。** 未知动词默认 `reject`。

---

## 3. 分步修复计划

六个步骤，每步独立可 review、可发布、可回滚。顺序按实测严重性排列，**定点安全修复全部排在大重构之前**。

步骤依赖关系：

```text
步骤 1（写工具 fail closed）──┐
步骤 2（OUTFILE 误拒）────────┤
                              ├──▶ 步骤 5（三态分类 + 正向路由）──▶ 步骤 6（explain_plan）
步骤 3（审批前预检）──────────┤
步骤 4（锁定读）──────────────┘
```

步骤 1-4 互相独立，可并行开发、按任意顺序发布。步骤 5 依赖 1-4 全部落地。

---

## 步骤 1：写工具对「无法验证」的 SQL fail closed ✅ 已完成

**为什么排第一**：改动最小（一个常量集合 + 一个判断），却一次性切断多语句、可执行注释、复杂度超限三条最高危路径。实测这三条当前都会调用 driver。

### 1.1 修复目标

`execute_write_query` 遇到「Guard 无法安全验证」的失败原因时拒绝执行，而不是当成写 SQL。

### 1.2 涉及文件

- `src/main/services/database-ai/sql-readonly-guard.ts`
- `src/main/agent/core/task/db-tools/execute-write-query.ts`
- `src/main/agent/core/task/db-tools/shared.ts`

### 1.3 改动内容

Guard 中新增导出，把「无法验证」从「确定是写」中分离：

```ts
const UNVERIFIABLE_ERROR_CODES: ReadonlySet<GuardErrorCode> = new Set([
  'E_EXECUTABLE_COMMENT',
  'E_UNTERMINATED_LITERAL',
  'E_NESTED_BLOCK_COMMENT',
  'E_MULTIPLE_STATEMENTS',
  'E_COMPLEXITY_LIMIT',
  'E_EMPTY_STATEMENT'
])

export function isUnverifiableRejection(errorCode: GuardErrorCode): boolean {
  return UNVERIFIABLE_ERROR_CODES.has(errorCode)
}
```

`shared.ts` 新增错误码：

```ts
| 'E_SQL_UNVERIFIABLE'
```

`execute-write-query.ts` 在 `guard.ok` 判断之后增加：

```ts
if (!guard.ok && isUnverifiableRejection(guard.errorCode)) {
  return {
    ok: false,
    errorCode: 'E_SQL_UNVERIFIABLE',
    errorMessage: 'SQL cannot be safely verified and will not be executed.'
  }
}
```

`execute-readonly-query.ts` 同步把这些错误码映射为 `E_SQL_UNVERIFIABLE`（当前统一映射成 `E_SQL_NOT_READONLY`，语义不准）。

> **这是过渡实现，不是最终形态。** 这里用的是「拒绝名单」，步骤 5 会用「动词允许表」正向替换它。之所以先做名单：它能立刻止血，且不需要等三态重构。步骤 5 完成后 `isUnverifiableRejection()` 应被删除，不保留兼容层。

### 1.4 测试

`src/main/agent/core/task/db-tools/__tests__/db-tools.test.ts`：

| 输入 | 期望 errorCode | 断言 |
| --- | --- | --- |
| `SELECT 1; DROP TABLE users` | `E_SQL_UNVERIFIABLE` | `expect(executeQuery).not.toHaveBeenCalled()` |
| `SELECT 1 /*! INTO OUTFILE '/tmp/x' */` | `E_SQL_UNVERIFIABLE` | 同上 |
| `nestedWith(400)` | `E_SQL_UNVERIFIABLE` | 同上 |
| `SELECT 1 /* unterminated` | `E_SQL_UNVERIFIABLE` | 同上 |
| `UPDATE t SET a=1` | ok | driver 调用 1 次（不得被误拦） |
| `INSERT INTO t VALUES (1)` | ok | driver 调用 1 次 |
| `DELETE FROM t WHERE id=1` | ok | driver 调用 1 次 |

`sql-readonly-guard.test.ts`：`isUnverifiableRejection()` 对上述 6 个码返回 true，对 `E_NOT_WHITELISTED` / `E_WITH_CONTAINS_DML` / `E_EXPLAIN_ANALYZE` 返回 false。

### 1.5 实施中发现的额外 fail-open（已一并修复）

写这一步的测试时，`UPDATE t SET a='unterminated` 这条用例没有按预期返回
`E_UNTERMINATED_LITERAL`，而是返回 `E_NOT_WHITELISTED` 并被写工具执行。追查后
发现 stripper 的四个引号分支都用同一个不可达判断来检测未闭合字面量：

```ts
let j = i + 1
while (j < len) { ... }          // 循环上界就是 len
if (j > len) return { hardFail: 'E_UNTERMINATED_LITERAL' }   // 永远为 false
```

`j` 最大只能等于 `len`，所以 `j > len` 恒假，**未闭合的引号字面量、反引号
标识符、双引号标识符和 `E'...'` 全部不会触发 `E_UNTERMINATED_LITERAL`**，
而是被静默清空到字符串末尾。（未闭合的块注释、`$tag$` 和 `q'[` 走 `indexOf`
分支，不受影响，所以这个缺口一直没暴露。）

后果比步骤 1 原定范围更严重：清空从引号到末尾的内容会把 `;` 一起抹掉，
`hasExtraStatement()` 因此看不到第二条语句，**只读工具会直接执行
`SELECT 'x; DROP TABLE users`**。实测该输入在修复前返回 `ok=true`。

修复方式是把「有没有见到闭合定界符」显式记下来，替换掉那个不可达的边界比较：

```ts
let terminated = false
while (j < len) {
  if (sql[j] === quote) { ...; j++; terminated = true; break }
  j++
}
if (!terminated) return { skeleton: sql, hardFail: 'E_UNTERMINATED_LITERAL' }
```

四个分支同改。之所以纳入本步而非单独排期：`E_UNTERMINATED_LITERAL` 本就在
§1.3 的 unverifiable 集合里，Guard 无法产出该码会让步骤 1 的保证变成空头承诺。

### 1.6 验收标准

- [x] 多语句 SQL 在写工具中被拒绝，driver 调用 0 次
- [x] 可执行注释 SQL 在写工具中被拒绝，driver 调用 0 次
- [x] `E_COMPLEXITY_LIMIT` 在写工具中被拒绝，driver 调用 0 次
- [x] 未闭合字面量在写工具中被拒绝，driver 调用 0 次（§1.5）
- [x] `SELECT 'x; DROP TABLE users` 不再被只读工具执行（§1.5）
- [x] 正常 DML（INSERT/UPDATE/DELETE/DROP/CREATE）不受影响，仍可执行
- [x] 合法字面量（`''` 转义、反引号/双引号转义、`E'...'`、`q'[...]'`、`$tag$`）未被误拒
- [x] 只读工具对上述输入返回 `E_SQL_UNVERIFIABLE` 而非 `E_SQL_NOT_READONLY`
- [x] `E_EXPLAIN_ANALYZE` 映射保持不变
- [x] lint / typecheck / 全量单测通过（3849 passed，0 failed；基线 3835 passed）
- [x] 错误消息不回显原始 SQL（测试断言不含 `DROP` / `OUTFILE`）

实际改动：6 个文件，+210/−8。`sql-readonly-guard.ts`（unverifiable 集合 +
predicate + 4 处 stripper 修复）、`shared.ts`（新错误码）、两个工具文件（路由）、
两个测试文件（+14 个用例）。

### 1.7 回滚

revert 单个提交。不涉及 schema 与持久化格式。

注意：`npm run lint` 是 `eslint . --fix`（会写全仓），本次只对改动的 6 个文件
跑 eslint，避免污染无关文件。`npm test` 是裸 `vitest`（watch 模式），CI/本地
校验需用 `vitest run`。另外跑 typecheck 会重新生成 `src/main/auto-imports.d.ts`
和 `src/renderer/auto-imports.d.ts`（新增 oxlint/oxfmt 头注释），与本修复无关，
已 revert。

---

## 步骤 2：修复 `OUTFILE` / `DUMPFILE` 标识符误拒

**为什么排第二**：唯一「只读查询被降级到写通道执行」的路径，破坏信任边界。改动只有一个正则。

### 2.1 修复目标

`outfile` / `dumpfile` 作为普通列名或表名时不再触发写判定；`SELECT ... INTO OUTFILE/DUMPFILE` 仍然被判定为非只读。

### 2.2 涉及文件

- `src/main/services/database-ai/sql-readonly-guard.ts`（`hasTopLevelInto()`，约 576-590 行）

### 2.3 改动内容

根因是把 `outfile` / `dumpfile` 当成独立触发词：

```ts
// 现状：裸标识符 outfile / dumpfile 直接触发
const intoWord = /\b(into|outfile|dumpfile)\b/iy
```

改为只以顶层 `INTO` 为触发点。`INTO OUTFILE` 和 `INTO DUMPFILE` 都包含 `INTO`，所以写检测能力不下降：

```ts
const intoWord = /\binto\b/iy
```

已用独立脚本验证该改法：8 个误拒用例全部转为 false，5 个真实写用例全部保持 true，子查询内 `INTO`（depth > 0）仍不触发。

### 2.4 测试

`sql-readonly-guard.test.ts` 中必须恢复为只读：

```sql
SELECT outfile FROM logs
SELECT dumpfile FROM logs
SELECT * FROM outfile
SELECT x AS outfile FROM logs
SELECT t.outfile FROM logs t
SELECT outfile, dumpfile FROM logs
SELECT * FROM logs WHERE outfile IS NOT NULL
```

必须保持非只读（回归保护，防止修过头）：

```sql
SELECT * INTO new_table FROM t
SELECT * FROM t INTO OUTFILE '/tmp/x'
SELECT * FROM t INTO DUMPFILE '/tmp/x'
SELECT a INTO @v FROM t
SELECT * FROM t INTO outfile '/tmp/x'      -- 小写变体
```

深度边界：`SELECT * FROM (SELECT 1 INTO x) y` 保持现有行为（depth > 0 不触发）。

写工具侧：`SELECT outfile FROM logs` 走到写工具应返回 `E_INVALID_PARAM`（只读 SQL 用错工具），driver 调用 0 次。

### 2.5 验收标准

- [ ] 7 个 `outfile`/`dumpfile` 标识符查询恢复为只读
- [ ] 5 个 `SELECT ... INTO` 变体仍判定为非只读
- [ ] `SELECT outfile FROM logs` 不再被写工具执行
- [ ] `SELECT into_count FROM logs` 等含 `into` 子串的标识符不受影响
- [ ] `npm run lint && npm run typecheck && npm test` 通过

### 2.6 回滚

revert 单个提交。风险点是修过头导致真实 `SELECT INTO` 漏判，由 §2.4 回归用例守住。

---

## 步骤 3：审批前预检 + 执行前复检

**为什么排第三**：修正顺序倒置，让用户不再审批无效或不可验证的 SQL；同时为步骤 4/5 建立「分类先于审批」的骨架。

### 3.1 修复目标

分类发生在弹审批框之前；执行前再分类一次，形成第二道防线。

### 3.2 涉及文件

- `src/main/agent/core/task/index.ts`（`handleDbWriteToolUse()`，5460-5519 行；`askApproval` 在 5482 行）
- 新增纯函数模块（建议 `src/main/agent/core/task/db-tools/preflight.ts`）

### 3.3 改动内容

当前顺序：

```text
取 sql → askApproval(5482) → getOrCreateDbAiSession → runExecuteWriteQuery(5489)
```

改为：

```text
取 sql → 参数与大小检查 → preflightWriteSql(sql, dbType)
  ├─ readonly    → 拒绝，提示改用只读工具，不弹审批
  ├─ reject      → 拒绝，不弹审批
  └─ 其余        → askApproval → runExecuteWriteQuery（内部再次分类）
```

抽成纯函数便于单测，不依赖 Task 实例：

```ts
export function preflightWriteSql(sql: string, dialect: GuardDialect):
  | { ok: true }
  | { ok: false; errorCode: DbToolErrorCode; errorMessage: string }
```

预检需要 dialect，而 dialect 当前来自 `getOrCreateDbAiSession()`。审批前不应为了拿 dialect 就建连接——从 `this.dbContext` 取 dialect，不要提前建 session。若 `dbContext` 拿不到 dialect，则 fail closed 拒绝（Guard 对未知 dialect 本身也是收紧策略）。

`runExecuteWriteQuery()` 内部保留现有分类逻辑，不因为预检存在就删掉——这是有意的双重检查，不是冗余。

### 3.4 测试

Task 层测试（`preflightWriteSql` 纯函数单测）：

| 输入 | 期望 |
| --- | --- |
| `SELECT 1` | 拒绝，`E_INVALID_PARAM` |
| `SELECT 1; DROP TABLE users` | 拒绝，`E_SQL_UNVERIFIABLE` |
| `nestedWith(400)` | 拒绝，`E_SQL_UNVERIFIABLE` |
| `UPDATE t SET a=1` | 通过 |
| dialect 缺失 + `UPDATE t SET a=1` | 拒绝（fail closed） |

`handleDbWriteToolUse()` 集成测试，mock `askApproval` 与 session：

| 输入 | `askApproval` 调用 | `executeQuery` 调用 |
| --- | --- | --- |
| `SELECT 1` | 0 次 | 0 次 |
| 多语句 | 0 次 | 0 次 |
| `E_COMPLEXITY_LIMIT` | 0 次 | 0 次 |
| `UPDATE t SET a=1` | 1 次 | 审批通过后 1 次 |
| `UPDATE t SET a=1`（用户拒绝审批） | 1 次 | 0 次 |

额外断言：被预检拒绝时不应调用 `getOrCreateDbAiSession()`（不建立多余连接）。

### 3.5 验收标准

- [ ] 只读 SQL 走写工具时不弹审批框
- [ ] 不可验证 SQL 不弹审批框
- [ ] 预检拒绝路径不建立数据库连接
- [ ] 用户拒绝审批时 driver 调用 0 次
- [ ] `runExecuteWriteQuery()` 内部仍独立分类（删除预检后单测仍能拦住）
- [ ] `npm run lint && npm run typecheck && npm test` 通过

### 3.6 回滚

revert 单个提交，恢复为审批在前。步骤 1 的写工具内部拦截仍然生效，不会退回到完全无防护状态。

---

## 步骤 4：明确处理锁定读

**为什么排第四**：实测四种锁定读全部被当普通只读放行，会在事务内持锁影响其他会话。当前代码搜不到任何相关处理。

### 4.1 修复目标

锁定读不再被判定为只读；改为需要审批（默认）或拒绝。

### 4.2 涉及文件

- `src/main/services/database-ai/sql-readonly-guard.ts`

### 4.3 改动内容

在顶层 SELECT、每个 set operand、CTE tail 中识别（仅 paren depth 0）：

```sql
FOR UPDATE
FOR NO KEY UPDATE
FOR SHARE
FOR KEY SHARE
LOCK IN SHARE MODE
```

**产品决策点：** 默认按 `requires_approval`（`operation: 'lock'`）处理。步骤 5 之前 Guard 还是布尔的，所以本步落地形式是「判定为非只读」，配合步骤 3 的预检 → 审批 → 执行链路，效果即为需审批。若产品决定完全不支持锁定查询，改为 `reject` 分支，但**不得继续按普通只读放行**。

注意不要把 `FOR` 的其他合法用法误判，例如字符串已被 stripper 清空、`for` 作为标识符的场景需要用词边界 + depth 0 双重约束。

不要把 30 秒查询 timeout 当作锁持有上限：已开启事务时锁可能持续到事务结束或连接关闭。

### 4.4 测试

必须判定为非只读（四种 dialect 各自覆盖适用语法）：

```sql
SELECT * FROM t FOR UPDATE
SELECT * FROM t FOR NO KEY UPDATE          -- postgresql
SELECT * FROM t FOR SHARE
SELECT * FROM t FOR KEY SHARE              -- postgresql
SELECT * FROM t LOCK IN SHARE MODE         -- mysql
SELECT * FROM t FOR UPDATE NOWAIT
SELECT * FROM t FOR UPDATE SKIP LOCKED
SELECT 1 UNION SELECT 2 FOR UPDATE         -- set operand 位置
WITH c AS (SELECT 1) SELECT * FROM c FOR UPDATE   -- CTE tail 位置
```

必须保持只读（防止误判）：

```sql
SELECT * FROM t                            -- 无锁子句
SELECT for_update FROM t                   -- 标识符含 for
SELECT * FROM t WHERE note = 'for update'  -- 字符串内（stripper 已清空）
SELECT * FROM (SELECT 1 FOR UPDATE) x      -- depth > 0，按现有 depth 策略决定，需明确断言
```

最后一条必须在实现时明确取舍并写入断言：子查询内的锁定读同样会持锁，建议一并识别；若决定只查 depth 0，则测试需如实断言现状并在注释里说明缺口。

路由测试：锁定读在只读工具被拒绝，在写工具经审批后执行，无审批不得执行。

### 4.5 验收标准

- [ ] 9 个锁定读用例全部判定为非只读
- [ ] 4 个防误判用例保持只读
- [ ] 锁定读在只读工具中被拒绝
- [ ] 锁定读不再无审批执行
- [ ] 子查询内锁定读的行为有明确断言（识别或已知缺口）
- [ ] MySQL / PostgreSQL / SQLite / Oracle 四种 dialect 均有覆盖
- [ ] `npm run lint && npm run typecheck && npm test` 通过

### 4.6 回滚

revert 单个提交。风险是误判导致正常查询被拒，由 §4.4 防误判用例守住。

---

## 步骤 5：引入三态分类并改为正向路由

**为什么排第五**：改动面最大。前四步已把高危路径逐条切断，此步做结构性收口，把「拒绝名单」换成「允许表」。

### 5.1 修复目标

- 新增 `classifySql()` 作为唯一分类入口
- 写工具改为正向识别副作用动词，未知动词一律 `reject`
- 删除步骤 1 的过渡名单 `isUnverifiableRejection()`
- 禁止任何生产代码使用 `!isReadOnlySql(...).ok` 推导写操作

### 5.2 涉及文件

- `src/main/services/database-ai/sql-readonly-guard.ts`
- `src/main/agent/core/task/db-tools/execute-write-query.ts`
- `src/main/agent/core/task/db-tools/execute-readonly-query.ts`
- `src/main/agent/core/task/db-tools/preflight.ts`
- `src/main/agent/core/task/index.ts`

### 5.3 改动内容

**5.3.1 公共预处理**（所有分类共享）：注释与字面量清洗、可执行注释拒绝、单语句检查、括号平衡检查、复杂度与递归预算。SQL 大小检查仍留在调用层。

**5.3.2 解析有效顶层语句**：

```ts
interface TopLevelStatement {
  verb: string
  skeleton: string
  afterCteOffset?: number
}
```

规则：跳过空白与普通注释；首动词非 `WITH` 则直接返回；首动词是 `WITH` 时复用现有 CTE body/column-list 解析，校验每个 body，返回最后一个 CTE 之后的主语句动词。解析统一消耗共享预算，解析失败或超限返回 `reject`，**不得降级为 `requires_approval`**。

这一步直接修掉「读字符串首单词」的问题：`WITH c AS (SELECT 1) INSERT INTO t SELECT * FROM c` 的有效动词是 `INSERT`。

**5.3.3 动词允许表**（dialect-aware，未知动词默认 `reject`）：

```ts
const COMMON_APPROVAL_VERBS = new Set([
  'insert', 'update', 'delete', 'merge',
  'create', 'alter', 'drop', 'truncate',
  'grant', 'revoke', 'comment',
  'set', 'lock', 'commit', 'rollback', 'savepoint'
])
```

按 dialect 扩充，每项都必须配测试：

| Dialect | 附加语句 |
| --- | --- |
| MySQL | `REPLACE`、`LOAD DATA`、`RENAME TABLE`、`LOCK/UNLOCK TABLES`、`ANALYZE/OPTIMIZE/REPAIR TABLE` |
| PostgreSQL | `COPY`、`DO`、`REFRESH MATERIALIZED VIEW`、`VACUUM`、`ANALYZE`、`REINDEX`、`CLUSTER`、`LOCK TABLE` |
| SQLite | `REPLACE`、`ATTACH`、`DETACH`、`VACUUM`、`REINDEX`、`ANALYZE` |
| Oracle | `MERGE`、`LOCK TABLE`；`BEGIN`/`DECLARE` 匿名块本阶段 `reject` |

允许表的含义是「可以进入审批」，不是「不危险」。

**5.3.4 兼容包装**：

```ts
export function isReadOnlySql(sql: string, dialect?: GuardDialect): GuardResult {
  const result = classifySql(sql, dialect)
  return result.kind === 'readonly'
    ? { ok: true, skeleton: result.skeleton }
    : { ok: false, errorCode: result.kind === 'reject' ? result.errorCode : 'E_NOT_WHITELISTED', reason: ... }
}
```

保留它是为了 `explain_plan` 等调用点在步骤 6 之前不必同步改造，**不是为了让写工具继续取反**。

**5.3.5 错误码映射**：

| 场景 | Tool Error |
| --- | --- |
| 写 SQL 调用只读工具 | `E_SQL_NOT_READONLY` |
| 只读 SQL 调用写工具 | `E_INVALID_PARAM` |
| 复杂度 / 可执行注释 / 结构异常 / 未知动词 | `E_SQL_UNVERIFIABLE` |

错误消息不得回显原始 SQL、表名、路径或参数。

**5.3.6 分类落点**：

`readonly`：普通 SELECT；只读 `WITH ... SELECT`；合法 `UNION`/`INTERSECT`/`EXCEPT`；顶层 `SHOW`/`DESC`/`DESCRIBE`；不带 `ANALYZE/ANALYSE` 的 `EXPLAIN SELECT/WITH`；仅 SQLite 白名单只读 `PRAGMA`。

`requires_approval`：DML；DDL；权限与会话状态；dialect 明确写操作；`WITH ... INSERT/UPDATE/DELETE/MERGE/REPLACE`；`SELECT ... INTO table/OUTFILE/DUMPFILE`；锁定读。

`reject`：§1.1 中除正常 DML 外的全部实测用例；括号失衡或 CTE 结构不完整；query-expression 位置出现 `SHOW`/`DESC`/`PRAGMA`/`EXPLAIN`；方言不匹配的 `PRAGMA`；未知首动词；匿名块、存储过程、多语句脚本；可变 SQLite `PRAGMA`（本阶段统一拒绝）。

### 5.4 测试

**分类器单测**，三态各自覆盖。`readonly`：

```sql
SELECT 1
WITH c AS (SELECT 1) SELECT * FROM c
SELECT 1 UNION SELECT 2
SELECT outfile FROM logs                   -- 步骤 2 回归
SELECT * FROM outfile
SHOW TABLES
DESC users
PRAGMA table_info(users)                   -- 仅 sqlite
```

`requires_approval`：

```sql
INSERT INTO t VALUES (1)
UPDATE t SET a = 1
DELETE FROM t
CREATE TABLE t(id INT)
WITH c AS (SELECT 1) INSERT INTO t SELECT * FROM c
SELECT * INTO new_table FROM t
SELECT * FROM t INTO OUTFILE '/tmp/x'
SELECT * FROM t FOR UPDATE                 -- 步骤 4 回归
SELECT * FROM t LOCK IN SHARE MODE
```

`reject`：

```sql
SELECT 1 UNION SHOW TABLES
PRAGMA table_info(users)                   -- mysql / postgresql / oracle
SELECT 1 /*! INTO OUTFILE '/tmp/x' */
SELECT 1; DROP TABLE users
CALL sp()
BEGIN dbms_output.put_line('x'); END;      -- oracle 匿名块
EXPLAIN EXPLAIN SELECT 1
WITH c AS (SELECT 1                        -- 结构不完整
FROBNICATE t                               -- 未知动词
```

复杂度用例按 §1.3 的构造形式，断言：嵌套 400 CTE → `reject`；嵌套 400 UNION → `reject`；扁平 400 CTE → `readonly`；扁平 400 UNION → `readonly`。不要在普通 CI 中使用严格耗时断言。

**工具路由矩阵**（`db-tools.test.ts` + Task 审批测试）：

| 输入 | readonly tool | write tool | 弹审批 | `executeQuery` |
| --- | --- | --- | --- | --- |
| 普通 SELECT | 执行 | 拒绝 | 否 | 仅只读工具 |
| UPDATE | 拒绝 | 执行 | 是 | 审批后调用 |
| CTE + INSERT | 拒绝 | 执行 | 是 | 审批后调用 |
| SELECT INTO OUTFILE | 拒绝 | 执行 | 是 | 审批后调用 |
| 多语句 | 拒绝 | 拒绝 | 否 | 否 |
| 可执行注释 | 拒绝 | 拒绝 | 否 | 否 |
| `E_COMPLEXITY_LIMIT` | 拒绝 | 拒绝 | 否 | 否 |
| UNION SHOW | 拒绝 | 拒绝 | 否 | 否 |
| 非 SQLite PRAGMA | 拒绝 | 拒绝 | 否 | 否 |
| `CALL sp()` | 拒绝 | 拒绝 | 否 | 否 |
| Oracle 匿名块 | 拒绝 | 拒绝 | 否 | 否 |
| 锁定读 | 拒绝 | 执行 | 是 | 审批后调用 |

每个拒绝用例必须断言 `expect(executeQuery).not.toHaveBeenCalled()`。

**反向依赖检查**：全仓 grep 确认没有 `!isReadOnlySql` / `!guard.ok` 形式的写判定残留。

### 5.5 验收标准

- [ ] `classifySql()` 为唯一分类入口，三态语义明确
- [ ] `execute_write_query` 不再使用 `!guard.ok` 作为可执行条件
- [ ] 写工具基于动词允许表正向识别，未知动词 `reject`
- [ ] `isUnverifiableRejection()` 已删除，无兼容层残留
- [ ] `WITH ... INSERT` 的有效动词识别为 `INSERT`
- [ ] `CALL sp()`、Oracle 匿名块不再被写工具执行
- [ ] 所有 `reject` 结果不弹审批、不调 driver
- [ ] 写工具执行前再次分类
- [ ] 合法扁平多 CTE / 多 UNION 未被复杂度预算误拒
- [ ] 四种 dialect 分类测试齐全
- [ ] 全仓无 `!isReadOnlySql` 形式的写判定
- [ ] `npm run lint && npm run typecheck && npm test` 通过
- [ ] 50 KB 正常 SQL 无秒级同步阻塞（基线 12.8 ms，不得退化）

### 5.6 回滚

revert 本步提交后，步骤 1-4 的定点修复仍然生效，系统回到「有拒绝名单但无正向识别」的中间状态，不会退回原始不安全状态。这是把此步排在最后的主要原因。

---

## 步骤 6：收紧 `explain_plan` 输入

**为什么排最后**：属 UX 与正确性问题，不涉及信任边界破坏。实测 `EXPLAIN EXPLAIN SELECT 1`、`SHOW TABLES`、`DESC users` 都会被接受并再次拼接 `EXPLAIN`。

### 6.1 修复目标

`explain_plan` 只接受能够生成执行计划的查询表达式。

### 6.2 涉及文件

- `src/main/agent/core/task/db-tools/explain-plan.ts`（当前在 47 行复用顶层 statement Guard）
- `src/main/services/database-ai/sql-readonly-guard.ts`

### 6.3 改动内容

新增专用入口，不再复用 statement 位置的 Guard：

```ts
export function isExplainableQuery(sql: string, dialect: GuardDialect): GuardResult
```

内部按 `query` 位置校验（该位置本就拒绝 `SHOW`/`DESC`/`PRAGMA`/嵌套 `EXPLAIN`），额外拒绝已带 `EXPLAIN` 前缀的输入。

只允许：`SELECT`、`WITH ... SELECT`、受支持的 set query；`VALUES` 视各 driver 验证结果可选。

必须拒绝：`SHOW`、`DESC`、`DESCRIBE`、`PRAGMA`、已带 `EXPLAIN` 的输入、所有 `requires_approval` 与 `reject` 分类。

### 6.4 测试

正常生成执行计划：`SELECT 1`、`WITH c AS (SELECT 1) SELECT * FROM c`、`SELECT 1 UNION SELECT 2`。

必须拒绝且不调用 driver：

```sql
EXPLAIN SELECT 1
EXPLAIN EXPLAIN SELECT 1
EXPLAIN (FORMAT JSON) SELECT 1
SHOW TABLES
DESC users
PRAGMA table_info(users)
UPDATE t SET a=1
SELECT 1; DROP TABLE users
```

`EXPLAIN ANALYZE SELECT 1` 保持返回 `E_EXPLAIN_ANALYZE`（不得因重构丢失该错误码）。

### 6.5 验收标准

- [ ] `explain_plan` 只接受查询表达式
- [ ] 已带 `EXPLAIN` 前缀的输入被拒绝，无双重前缀
- [ ] `SHOW`/`DESC`/`PRAGMA` 被拒绝
- [ ] 拒绝用例不调用 driver
- [ ] `E_EXPLAIN_ANALYZE` 错误码保持不变
- [ ] `npm run lint && npm run typecheck && npm test` 通过

### 6.6 回滚

revert 单个提交，`explain_plan` 回到复用 statement Guard 的状态。

---

## 4. 提交拆分

一个步骤一个提交，按步骤顺序：

1. `fix(database-ai): fail closed on unverifiable SQL in write tool` ✅ 已完成（含 §1.5 的 stripper 修复）
2. `fix(database-ai): avoid OUTFILE/DUMPFILE identifier false positives`
3. `fix(database-ai): preflight SQL before write approval`
4. `fix(database-ai): classify locking reads instead of treating them as read-only`
5. `refactor(database-ai): introduce tri-state SQL classification and positive write routing`
6. `fix(database-ai): restrict explain-plan inputs to query expressions`

测试随各自步骤提交，不单独留「补测试」提交——否则中间提交处于未验证状态。

建议从 #2500 合并点之后拉分支，新建 Follow-up PR。

---

## 5. 非本次目标

- 不实现完整 SQL Parser
- 不支持无法可靠静态验证的存储过程、匿名 PL/SQL 块、任意多语句脚本
- 不通过放宽规则解决罕见语法兼容问题；歧义场景继续拒绝
- 不重构 DB driver 或连接池
- stripper 线性化（实测最坏 12.8 ms，纯代码整洁性改进）

---

## 6. 观测与日志

只记录安全元数据，不记录原始 SQL：

```ts
logger.info('db sql classified', {
  event: 'db-ai.sql.classified',
  dialect,
  disposition: classification.kind,
  operation: classification.kind === 'requires_approval' ? classification.operation : undefined,
  errorCode: classification.kind === 'reject' ? classification.errorCode : undefined
})
```

建议观测：各 dialect 三态分类数量；`E_SQL_UNVERIFIABLE` 分布；审批请求数与拒绝比例；`E_COMPLEXITY_LIMIT` 与 `E_EXECUTABLE_COMMENT` 命中数；`explain_plan` 非查询输入拒绝数。

禁止记录 SQL 全文、表名、文件路径、连接信息。

---

## 7. 数据库层纵深防御（后续独立工作）

文本分类器无法证明任意 `SELECT` 无副作用。实测 `SELECT pg_advisory_lock(1)` 与 `SELECT GET_LOCK('a',1)` 都被判定为只读，且**本计划的六个步骤都不会改变这一点**——它们在语法上确实是 SELECT。同类问题还有 `nextval()`、`setval()`、用户自定义 volatile function、UDF、SQLite 扩展函数。

这类只能靠连接层权限拦住：

1. `execute_readonly_query` 使用独立只读账号或只读连接
2. PostgreSQL / Oracle 使用只读事务 + 最小权限角色
3. MySQL 使用只读事务和只读账号（不能只依赖事务模式处理 DDL）
4. SQLite 使用 `mode=ro` / readonly 连接
5. 写工具继续使用写连接并保留审批

这是本方案中长期价值最高的一项，但改动面涉及连接管理，不塞进本次交付。建议单独立项，优先级等同步骤 5。

---

## 8. 发布后异常处理

若出现大量合法 SQL 被拒绝：

1. **不得恢复「Guard 失败即执行」的旧逻辑**
2. 根据 telemetry 定位具体 dialect 与分类规则
3. 仅对能够明确验证的语法增加白名单并补回归测试
4. 无法确认的语法继续 fail closed

