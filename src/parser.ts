/**
 * Cron 表达式解析器
 *
 * 支持 5/6/7 字段：
 *   5 字段: 分 时 日 月 周
 *   6 字段: 秒 分 时 日 月 周
 *   7 字段: 秒 分 时 日 月 周 年
 *
 * 支持语法：
 *   *            匹配该字段所有合法值
 *   5            单个数值
 *   1-5          范围
 *   1,3,5        列表（各项可分别为 *、单值、范围、带步长形式）
 *   星号/5        从最小值到最大值按步长取值（如 每5 个单位）
 *   1-10/2       范围步长
 * 以上形式可自由组合，如 1,5-10,星号/15
 *
 * 月份支持别名 JAN-DEC，星期支持别名 SUN-SAT（不区分大小写），
 * 别名可用于单值、范围与列表，如 MON-FRI、JAN,JUN。
 *
 * 快捷表达式（等价于对应 5 字段表达式）：
 *   @hourly   0 * * * *      每小时第 0 分钟
 *   @daily    0 0 * * *      每天 00:00
 *   @weekly   0 0 * * 0      每周日 00:00
 *   @monthly  0 0 1 * *      每月 1 号 00:00
 *   @yearly   0 0 1 1 *      每年 1 月 1 日 00:00
 */

import { CronFieldValues, FieldRange, ParsedCron } from './types';

/** 年份字段合法范围 */
export const YEAR_MIN = 1970;
export const YEAR_MAX = 2100;

/** 各字段的取值范围定义 */
export const FIELD_RANGES: Record<string, FieldRange> = {
  second: { name: 'second', min: 0, max: 59 },
  minute: { name: 'minute', min: 0, max: 59 },
  hour: { name: 'hour', min: 0, max: 23 },
  dayOfMonth: { name: 'day-of-month', min: 1, max: 31 },
  month: { name: 'month', min: 1, max: 12 },
  dayOfWeek: { name: 'day-of-week', min: 0, max: 6, allowSevenAsSunday: true },
  year: { name: 'year', min: YEAR_MIN, max: YEAR_MAX },
};

/** 快捷表达式 -> 等价 5 字段表达式 */
export const SHORTCUTS: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
};

/** 月份别名（不区分大小写） */
const MONTH_ALIASES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** 星期别名（不区分大小写），7 仍由数值规则接受并归一化为 0 */
const DOW_ALIASES: Record<string, number> = {
  SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6,
};

/** 单个 token 的合法形式：*、数值、数值-数值，三者后均可接 /步长 */
const TOKEN_RE = /^(\*|\d+(-\d+)?)(\/\d+)?$/;

/** 解析错误 */
export class CronParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CronParseError';
  }
}

/**
 * 将字段文本中的别名（JAN-DEC / SUN-SAT，不区分大小写）替换为数值。
 * 别名可出现在单值、范围与列表中。
 *
 * @param raw       字段原始文本，如 "MON-FRI"
 * @param map       别名表
 * @param fieldName 字段名（用于错误信息）
 */
function normalizeAliases(raw: string, map: Record<string, number>, fieldName: string): string {
  return raw.replace(/[A-Za-z]+/g, (word) => {
    const value = map[word.toUpperCase()];
    if (value === undefined) {
      throw new CronParseError(`字段 ${fieldName} 包含无法识别的别名: "${word}"`);
    }
    return String(value);
  });
}

/**
 * 解析单个字段文本，返回升序去重后的合法取值数组。
 *
 * @param raw  字段原始文本（月/周字段应先完成别名归一化），如 "1,5-10,星号/15"
 * @param spec 字段取值范围
 */
export function parseField(raw: string, spec: FieldRange): number[] {
  if (raw.length === 0) {
    throw new CronParseError(`字段 ${spec.name} 不能为空`);
  }

  const values = new Set<number>();

  for (const token of raw.split(',')) {
    if (!TOKEN_RE.test(token)) {
      throw new CronParseError(
        `字段 ${spec.name} 包含非法语法: "${token}"（合法形式: *、数值、范围 a-b、步长 */n 或 a-b/n、逗号列表）`,
      );
    }

    const [basePart, stepPart] = token.split('/');
    const step = stepPart === undefined ? 1 : Number(stepPart);
    if (!Number.isInteger(step) || step < 1) {
      throw new CronParseError(`字段 ${spec.name} 的步长必须是 >= 1 的整数: "${token}"`);
    }

    let low: number;
    let high: number;

    if (basePart === '*') {
      low = spec.min;
      high = spec.max;
    } else if (basePart.includes('-')) {
      const [loStr, hiStr] = basePart.split('-');
      low = Number(loStr);
      high = Number(hiStr);
      if (!Number.isInteger(low) || !Number.isInteger(high) || low > high) {
        throw new CronParseError(`字段 ${spec.name} 的范围非法: "${basePart}"（要求 a-b 且 a <= b）`);
      }
    } else {
      // 单值；若带步长（如 5/15），按从该值到字段最大值处理
      low = Number(basePart);
      high = stepPart === undefined ? low : spec.max;
    }

    // day-of-week 额外接受 7（归一化为 0），合法范围为 0-7
    const allowedHigh = spec.allowSevenAsSunday ? spec.max + 1 : spec.max;
    const rangeText = spec.allowSevenAsSunday
      ? `${spec.min}-${spec.max + 1}（7 等价于周日 0）`
      : `${spec.min}-${spec.max}`;
    if (low < spec.min || high > allowedHigh) {
      throw new CronParseError(
        `字段 ${spec.name} 的值超出合法范围 ${rangeText}: "${token}"`,
      );
    }

    // 展开取值并校验列表值不得重复（7 归一化为 0 后若与 0 同时出现也算重复）
    for (let v = low; v <= high; v += step) {
      const normalized = spec.allowSevenAsSunday && v === 7 ? 0 : v;
      if (values.has(normalized)) {
        const note = normalized !== v ? '（7 已归一化为 0）' : '';
        throw new CronParseError(
          `字段 ${spec.name} 的列表存在重复值 ${normalized}${note}: "${raw}"`,
        );
      }
      values.add(normalized);
    }
  }

  return Array.from(values).sort((a, b) => a - b);
}

/**
 * 解析 cron 表达式，支持：
 *   - 5 字段：分 时 日 月 周
 *   - 6 字段：秒 分 时 日 月 周
 *   - 7 字段：秒 分 时 日 月 周 年
 *   - @hourly/@daily/@weekly/@monthly/@yearly 快捷表达式（按 5 字段处理）
 * 非法时抛出 CronParseError。
 */
export function parseExpression(expression: string): ParsedCron {
  if (typeof expression !== 'string') {
    throw new CronParseError('表达式必须是字符串');
  }

  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    throw new CronParseError('表达式不能为空字符串');
  }

  // 快捷表达式展开为等价的 5 字段表达式（输出保留用户原始输入）
  let body = trimmed;
  if (trimmed.startsWith('@')) {
    const expanded = SHORTCUTS[trimmed.toLowerCase()];
    if (expanded === undefined) {
      throw new CronParseError(
        `不支持的快捷表达式: "${trimmed}"（支持: ${Object.keys(SHORTCUTS).join(', ')}）`,
      );
    }
    body = expanded;
  }

  const parts = body.split(/\s+/);
  if (parts.length !== 5 && parts.length !== 6 && parts.length !== 7) {
    throw new CronParseError(
      `表达式必须包含 5、6 或 7 个字段（[秒] 分 时 日 月 周 [年]），实际包含 ${parts.length} 个: "${expression}"`,
    );
  }

  // 按字段数映射：second minute hour day-of-month month day-of-week [year]
  let secondRaw: string | undefined;
  let yearRaw: string | undefined;
  let minuteRaw: string;
  let hourRaw: string;
  let domRaw: string;
  let monthRaw: string;
  let dowRaw: string;

  if (parts.length === 5) {
    [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  } else if (parts.length === 6) {
    [secondRaw, minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;
  } else {
    [secondRaw, minuteRaw, hourRaw, domRaw, monthRaw, dowRaw, yearRaw] = parts;
  }

  // 按 second → minute → hour → dom → month → dow → year 的自然顺序构建，
  // 使输出 JSON 的字段顺序与表达式书写顺序一致；second/year 缺省时不出现
  const fields: CronFieldValues = {
    ...(secondRaw !== undefined
      ? { second: parseField(secondRaw, FIELD_RANGES.second) }
      : {}),
    minute: parseField(minuteRaw, FIELD_RANGES.minute),
    hour: parseField(hourRaw, FIELD_RANGES.hour),
    dayOfMonth: parseField(domRaw, FIELD_RANGES.dayOfMonth),
    month: parseField(normalizeAliases(monthRaw, MONTH_ALIASES, 'month'), FIELD_RANGES.month),
    dayOfWeek: parseField(normalizeAliases(dowRaw, DOW_ALIASES, 'day-of-week'), FIELD_RANGES.dayOfWeek),
    ...(yearRaw !== undefined
      ? { year: parseField(yearRaw, FIELD_RANGES.year) }
      : {}),
  };

  return {
    expression: trimmed,
    fields,
    fieldCount: parts.length as 5 | 6 | 7,
    dayOfMonthRestricted: domRaw !== '*',
    dayOfWeekRestricted: dowRaw !== '*',
  };
}
