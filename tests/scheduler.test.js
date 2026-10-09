/**
 * scheduler 单元测试：跨年、跨月、闰年 2-29 触发、工作日跳过周末。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseExpression } = require('../dist/parser');
const { computeNextTimes, NeverMatchesError } = require('../dist/scheduler');

/** 便捷入口：表达式 + 起始时间 -> 未来 count 次执行时间的 ISO 字符串 */
function nextTimes(expression, startTime, count) {
  const parsed = parseExpression(expression);
  return computeNextTimes(parsed, new Date(startTime), count).map((d) => d.toISOString());
}

test('scheduler: 跨年触发（每年 1 月 1 日 00:00）', () => {
  const times = nextTimes('0 0 1 1 *', '2026-01-01T00:00:00Z', 2);
  assert.deepEqual(times, ['2027-01-01T00:00:00.000Z', '2028-01-01T00:00:00.000Z']);
});

test('scheduler: 跨月触发（每月 1 号 00:00，从 1 月中旬起）', () => {
  const times = nextTimes('0 0 1 * *', '2026-01-15T10:00:00Z', 3);
  assert.deepEqual(times, [
    '2026-02-01T00:00:00.000Z',
    '2026-03-01T00:00:00.000Z',
    '2026-04-01T00:00:00.000Z',
  ]);
});

test('scheduler: 闰年 2 月 29 日触发（2026 起，下一次为 2028-02-29）', () => {
  const times = nextTimes('0 0 29 2 *', '2026-03-01T00:00:00Z', 1);
  assert.deepEqual(times, ['2028-02-29T00:00:00.000Z']);
  // 2026-03-01 是周日；2028-02-29 应为周二（getUTCDay 2）
  assert.equal(new Date(times[0]).getUTCDay(), 2);
});

test('scheduler: 工作日表达式跳过周末（2026-01-01 周四起）', () => {
  // 周四 1/1、周五 1/2，之后跳过周六 1/3、周日 1/4，直接到周一 1/5
  const times = nextTimes('0 9 * * 1-5', '2026-01-01T00:00:00Z', 3);
  assert.deepEqual(times, [
    '2026-01-01T09:00:00.000Z',
    '2026-01-02T09:00:00.000Z',
    '2026-01-05T09:00:00.000Z',
  ]);
  const weekdays = times.map((t) => new Date(t).getUTCDay());
  assert.deepEqual(weekdays, [4, 5, 1]); // 周四、周五、周一
});

test('scheduler: 可用匹配少于 count 时返回全部已匹配结果，不报错（年份字段耗尽）', () => {
  // 2026 年只剩 12-30、12-31 两个中午；请求 5 次应返回 2 次而非 never matches
  const times = nextTimes('0 0 12 * * * 2026', '2026-12-30T00:00:00Z', 5);
  assert.deepEqual(times, [
    '2026-12-30T12:00:00.000Z',
    '2026-12-31T12:00:00.000Z',
  ]);
});

test('scheduler: 可用匹配少于 count 时返回已匹配结果（4 年内 2-29 仅 1 次）', () => {
  const times = nextTimes('0 0 29 2 *', '2026-01-01T00:00:00Z', 5);
  assert.deepEqual(times, ['2028-02-29T00:00:00.000Z']);
});

test('scheduler: 永不触发的日期（2 月 31 日）在 4 年上限后报 NeverMatchesError', () => {
  assert.throws(
    () => nextTimes('0 0 31 2 *', '2026-01-01T00:00:00Z', 1),
    (err) => {
      assert.ok(err instanceof NeverMatchesError);
      assert.match(err.message, /never matches/);
      return true;
    },
  );
});

test('scheduler: 结果严格晚于起始时间（不含起始时间本身）', () => {
  // 起始时间恰好是一次触发点（00:00），第一次结果应为 00:05 而非 00:00
  const times = nextTimes('*/5 * * * *', '2026-01-01T00:00:00Z', 1);
  assert.deepEqual(times, ['2026-01-01T00:05:00.000Z']);
});
