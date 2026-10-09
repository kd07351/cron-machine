/**
 * 执行时间预测器
 *
 * 给定已解析的 cron 表达式与起始时间（UTC），按 年/月/日/时/分/秒
 * 逐级跳过不匹配的字段，计算未来 N 次执行时间。不逐秒遍历，即使表达式
 * 非常稀疏（如每年执行一次）也能快速得到结果。
 *
 * - 5 字段表达式：秒固定为 0，起始时间按分钟截断后推进，行为与标准 cron 一致；
 * - 6/7 字段表达式：秒字段参与匹配，起始时间按秒截断后推进；
 * - 7 字段表达式：年份字段参与匹配。
 *
 * 日字段遵循标准 cron 语义：
 *   - day-of-month 与 day-of-week 均被限制（都不是 *）时，二者满足其一即可（OR）；
 *   - 否则取交集（AND），* 的字段天然匹配任意值。
 */

import { ParsedCron } from './types';
import { getMaxYears } from './config';

/** 表达式在最大查找年限内无任何匹配（永不触发），对应退出码 2 */
export class NeverMatchesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NeverMatchesError';
  }
}

/** 判断某一天是否满足 day-of-month / day-of-week 条件 */
function dayMatches(parsed: ParsedCron, date: Date): boolean {
  const { fields } = parsed;
  const domOk = fields.dayOfMonth.includes(date.getUTCDate());
  const dowOk = fields.dayOfWeek.includes(date.getUTCDay());

  if (parsed.dayOfMonthRestricted && parsed.dayOfWeekRestricted) {
    return domOk || dowOk;
  }
  return domOk && dowOk;
}

/**
 * 计算从 startTime 之后（不含 startTime 本身）开始的 count 次执行时间。
 * 时间一律按 UTC 处理。
 */
export function computeNextTimes(parsed: ParsedCron, startTime: Date, count: number): Date[] {
  const result: Date[] = [];
  const { fields } = parsed;
  const seconds = fields.second ?? [0];
  const years = fields.year;
  const hasSeconds = fields.second !== undefined;

  // 截断到分钟（5 字段）或秒（6/7 字段）起点；若起始时间恰好落在整数边界上，
  // 向后推进一个单位，保证结果严格晚于起始时间（不含起始时间本身）。
  const cur = new Date(startTime.getTime());
  if (hasSeconds) {
    cur.setUTCMilliseconds(0);
    if (cur.getTime() <= startTime.getTime()) {
      cur.setUTCSeconds(cur.getUTCSeconds() + 1);
    }
  } else {
    cur.setUTCSeconds(0, 0);
    if (cur.getTime() <= startTime.getTime()) {
      cur.setUTCMinutes(cur.getUTCMinutes() + 1);
    }
  }

  // 最大查找年限（默认 4 年，可由 CRON_MAX_YEARS 覆盖）
  const maxYears = getMaxYears();

  // 搜索上限：起始时间 + maxYears 年（闰年 2 月 29 日加整年可能自动顺延到 3 月 1 日）
  const upperBound = Date.UTC(
    startTime.getUTCFullYear() + maxYears,
    startTime.getUTCMonth(),
    startTime.getUTCDate(),
    startTime.getUTCHours(),
    startTime.getUTCMinutes(),
    startTime.getUTCSeconds(),
  );

  const failNeverMatches = (): never => {
    throw new NeverMatchesError(
      `表达式 "${parsed.expression}" 自 ${startTime.toISOString()} 起 ${maxYears} 年内 never matches（不存在满足条件的日期，可能永不触发，例如 2 月 30/31 日，或年份字段不含未来年份）`,
    );
  };

  // 搜索终止：到达查找年限或年份字段耗尽时，已找到的结果照常返回（可能少于
  // count）；只有一次都没找到时才判定为 never matches。
  const finishOrFail = (): Date[] => {
    if (result.length > 0) {
      return result;
    }
    // failNeverMatches 返回 never，可作为 Date[] 返回（此路径必然抛错）
    return failNeverMatches();
  };

  while (result.length < count) {
    // 边界取等：恰好在起始时间 + maxYears 年整的时刻仍算范围内，超过即停止搜索
    if (cur.getTime() > upperBound) {
      return finishOrFail();
    }

    // 1) 年份不匹配（仅 7 字段）：跳到下一个合法年份的 1 月 1 日 00:00:00
    if (years !== undefined) {
      const year = cur.getUTCFullYear();
      if (!years.includes(year)) {
        const nextYear = years.find((y) => y > year);
        if (nextYear === undefined) {
          return finishOrFail();
        }
        cur.setUTCFullYear(nextYear, 0, 1);
        cur.setUTCHours(0, 0, 0, 0);
        continue;
      }
    }

    // 2) 月份不匹配：跳到下一个月的 1 号 00:00:00
    const month = cur.getUTCMonth() + 1;
    if (!fields.month.includes(month)) {
      cur.setUTCMonth(cur.getUTCMonth() + 1, 1);
      cur.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // 3) 日不匹配：跳到次日 00:00:00
    if (!dayMatches(parsed, cur)) {
      cur.setUTCDate(cur.getUTCDate() + 1);
      cur.setUTCHours(0, 0, 0, 0);
      continue;
    }

    // 4) 小时不匹配：跳到下一小时的 00 分 00 秒
    const hour = cur.getUTCHours();
    if (!fields.hour.includes(hour)) {
      cur.setUTCHours(hour + 1, 0, 0, 0);
      continue;
    }

    // 5) 分钟不匹配：跳到本小时内下一个合法分钟的 00 秒
    const minute = cur.getUTCMinutes();
    if (!fields.minute.includes(minute)) {
      const nextMinute = fields.minute.find((m) => m > minute);
      if (nextMinute === undefined) {
        // 本小时已无合法分钟，进入下一小时重新逐级判断
        cur.setUTCHours(hour + 1, 0, 0, 0);
        continue;
      }
      cur.setUTCMinutes(nextMinute, 0, 0);
      continue;
    }

    // 6) 秒：当前秒合法即命中；否则跳到本分钟内下一个合法秒；
    //    没有则进入下一分钟重新逐级判断。5 字段时 seconds 恒为 [0]。
    const second = cur.getUTCSeconds();
    if (seconds.includes(second)) {
      result.push(new Date(cur.getTime()));
      cur.setUTCSeconds(second + 1, 0);
      continue;
    }

    const nextSecond = seconds.find((s) => s > second);
    if (nextSecond === undefined) {
      cur.setUTCMinutes(minute + 1, 0, 0);
      continue;
    }
    cur.setUTCSeconds(nextSecond, 0);
  }

  return result;
}
