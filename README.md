# Cron 表达式解析与执行时间预测引擎

纯离线的 cron 表达式解析与未来执行时间计算工具。解析 cron 表达式（支持 5/6/7 字段、JAN-DEC/SUN-SAT 别名与 @hourly 等快捷表达式），输出结构化字段取值与未来 N 次执行时间（UTC）。

- 不访问网络，不依赖系统 cron 服务，不执行任何实际定时任务
- 不使用第三方时间库，仅使用 Node.js 内置 `Date`
- 时间统一按 **UTC** 处理

## 环境要求

- Node.js >= 16
- npm（随 Node 安装）

## 安装与构建

```bash
npm install
npm run build
```

构建产物输出到 `dist/` 目录。

## 测试

使用 Node 内置 `node:test`（无第三方测试框架），`pretest` 会先自动构建：

```bash
npm test
```

> 注：脚本使用 glob 形式 `node --test "tests/**/*.test.js"`。Node 23+ 不再把位置参数中的目录（`node --test tests/`）递归为测试目录，直接传目录会报 `MODULE_NOT_FOUND`。

## 运行方式

CLI 从 **stdin** 读取一行 JSON，将结果 JSON 输出到 **stdout**：

```bash
echo '{"expression":"*/5 * * * *","startTime":"2026-01-01T00:00:00Z","count":5}' | npm start
```

也可以直接使用 node：

```bash
echo '{"expression":"0 9 * * 1-5","startTime":"2026-01-01T00:00:00Z","count":3}' | node dist/cli.js
```

### 输入格式

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `expression` | string | 标准 5 字段 cron 表达式：`分 时 日 月 周` |
| `startTime` | string | 起始时间，ISO 8601 字符串（建议带 `Z`，按 UTC 处理） |
| `count` | number | 需要预测的执行次数，>= 1 的整数，上限 10000 |

```json
{
  "expression": "*/5 * * * *",
  "startTime": "2026-01-01T00:00:00Z",
  "count": 5
}
```

### 输出格式

```json
{
  "expression": "*/5 * * * *",
  "fields": {
    "minute": [0, 5, 10],
    "hour": [0, 1, 2],
    "dayOfMonth": [1, 2, 3],
    "month": [1, 2, 3],
    "dayOfWeek": [0, 1, 2]
  },
  "nextTimes": [
    "2026-01-01T00:05:00.000Z",
    "2026-01-01T00:10:00.000Z"
  ]
}
```

- `fields` 中为每个字段解析后的全部合法取值（升序、去重；示例中做了省略）
- `nextTimes` 严格晚于 `startTime`，**不含起始时间本身**，均为 UTC ISO 字符串

`count` 必须是 >= 1 的整数（为 0 或负数时报错），且不得超过上限（默认 10000）。

对于语法合法但永不触发的表达式（如 `0 0 31 2 *`，即 2 月 31 日），引擎从起始时间起最多向后搜索 **4 年**。到达查找上限（或 7 字段表达式的年份字段耗尽）时：若一次都未匹配则返回错误（信息含 `never matches`，退出码 2）；若已匹配到部分结果（少于 `count`），则照常返回这些结果，不报错。

## 资源限制

两项计算资源限制均可通过环境变量覆盖（未设置或为空时使用默认值；设置为非正整数等非法值时退出码 2 并提示具体变量名）：

| 环境变量 | 默认值 | 含义 |
| --- | --- | --- |
| `CRON_MAX_COUNT` | `10000` | 单次请求 `count` 的上限，超过则退出码 2 |
| `CRON_MAX_YEARS` | `4` | 从起始时间起最大查找年限；到期后 0 次匹配报 `never matches`，有部分匹配则返回部分结果 |

```bash
# 将 count 上限放宽到 50000
echo '{"expression":"* * * * *","startTime":"2026-01-01T00:00:00Z","count":20000}' \
  | CRON_MAX_COUNT=50000 npm start

# 将最大查找年限放宽到 10 年
echo '{"expression":"0 0 29 2 *","startTime":"2026-01-01T00:00:00Z","count":1}' \
  | CRON_MAX_YEARS=10 npm start
```

### 退出码

- `0`：成功
- `2`：输入非法（JSON 解析失败、字段缺失/类型错误、cron 表达式非法），或表达式在 4 年内永不触发；错误原因输出到 stderr

## Cron 语法说明

支持三种字段格式（对 5 字段完全向后兼容）：

| 格式 | 字段顺序 | 示例 |
| --- | --- | --- |
| 5 字段（标准） | 分 时 日 月 周 | `0 9 * * 1-5` |
| 6 字段（加秒） | 秒 分 时 日 月 周 | `30 */5 * * * *` |
| 7 字段（加秒与年） | 秒 分 时 日 月 周 年 | `0 0 12 * * * 2026` |

字段取值范围：

| 字段 | 取值范围 | 说明 |
| --- | --- | --- |
| second（秒） | 0-59 | 仅 6/7 字段 |
| minute（分） | 0-59 | |
| hour（时） | 0-23 | |
| day-of-month（日） | 1-31 | |
| month（月） | 1-12 | 支持别名 JAN-DEC（不区分大小写） |
| day-of-week（周） | 0-6 | 0 表示周日；也接受 7 并归一化为 0；支持别名 SUN-SAT（不区分大小写） |
| year（年） | 1970-2100 | 仅 7 字段 |

- 月/周别名可用于单值、范围与列表：`MON-FRI`、`JAN,JUN`、`0 9 * * mon-fri`
- 5 字段表达式的秒固定为 0；输出 JSON 的 `fields` 仅在 6/7 字段时才包含 `second`、仅在 7 字段时包含 `year`

快捷表达式（等价于对应 5 字段表达式，秒为 0）：

| 快捷方式 | 等价表达式 | 含义 |
| --- | --- | --- |
| `@hourly` | `0 * * * *` | 每小时第 0 分钟 |
| `@daily` | `0 0 * * *` | 每天 00:00 |
| `@weekly` | `0 0 * * 0` | 每周日 00:00 |
| `@monthly` | `0 0 1 * *` | 每月 1 号 00:00 |
| `@yearly` | `0 0 1 1 *` | 每年 1 月 1 日 00:00 |

支持的语法：

| 语法 | 含义 | 示例 |
| --- | --- | --- |
| `*` | 匹配该字段所有合法值 | `*` |
| 单值 | 精确匹配 | `5` |
| 范围 `a-b` | 匹配闭区间内所有值 | `1-5` |
| 列表 `a,b,c` | 匹配所列各项（各项可为任意合法形式） | `1,3,5` |
| 步长 `*\/n` | 从最小值起每 n 个单位 | `*\/5` |
| 范围步长 `a-b/n` | 范围内每 n 个单位 | `1-10/2` |
| 组合 | 以上形式自由组合 | `1,5-10,*/15` |

校验规则：各字段值必须在合法范围内；范围要求 `a <= b`；步长必须是正整数（`*/0` 非法）；列表展开后不得出现重复值（如 `1,1`、`1-5,3`、day-of-week 的 `0,7` 均非法，因为 `7` 会归一化为 `0`）。

日与周的匹配遵循标准 cron 语义：当 day-of-month 与 day-of-week **都被显式限制**（都不是 `*`）时，二者满足其一即匹配（OR）；否则取交集（AND）。

## 示例

```bash
# 每 5 分钟
echo '{"expression":"*/5 * * * *","startTime":"2026-01-01T00:00:00Z","count":3}' | npm start

# 工作日（周一至周五）每天 09:00
echo '{"expression":"0 9 * * 1-5","startTime":"2026-01-01T00:00:00Z","count":3}' | npm start

# 6 字段（带秒）：每 5 分钟的第 30 秒
echo '{"expression":"30 */5 * * * *","startTime":"2026-01-01T00:00:00Z","count":3}' | npm start

# 7 字段（带秒与年）：2026 年每天中午 12:00:00
echo '{"expression":"0 0 12 * * * 2026","startTime":"2026-01-01T00:00:00Z","count":2}' | npm start

# 星期别名 + 快捷表达式
echo '{"expression":"0 9 * * MON-FRI","startTime":"2026-01-01T00:00:00Z","count":2}' | npm start
echo '{"expression":"@daily","startTime":"2026-01-01T00:00:00Z","count":2}' | npm start

# 非法表达式（退出码 2，错误输出到 stderr）
echo '{"expression":"invalid expr","startTime":"2026-01-01T00:00:00Z","count":1}' | npm start
```

## 项目结构

```
src/
  types.ts      公共类型定义
  config.ts     计算资源限制（CRON_MAX_COUNT / CRON_MAX_YEARS 环境变量）
  parser.ts     cron 表达式解析（展开为各字段合法取值）
  validator.ts  stdin 输入 JSON 的格式校验
  scheduler.ts  未来执行时间计算（UTC，逐级跳过不匹配字段）
  cli.ts        CLI 入口（stdin/stdout、退出码处理）
tests/          node:test 单元测试（parser / validator / scheduler / config）
```
