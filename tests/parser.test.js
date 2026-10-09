/**
 * parser 单元测试：*、数值、范围、列表、步长、组合各一条。
 * 运行：node --test tests/（先执行 npm run build 生成 dist/）
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { parseExpression, CronParseError } = require('../dist/parser');

/** 生成 0..n-1 的连续数组 */
const range = (n) => Array.from({ length: n }, (_, i) => i);

test('parser: * 匹配字段全部合法值', () => {
  const { fields } = parseExpression('* * * * *');
  assert.deepEqual(fields.minute, range(60));
  assert.deepEqual(fields.hour, range(24));
  assert.deepEqual(fields.dayOfMonth, Array.from({ length: 31 }, (_, i) => i + 1));
  assert.deepEqual(fields.month, Array.from({ length: 12 }, (_, i) => i + 1));
  assert.deepEqual(fields.dayOfWeek, range(7));
  // 5 字段表达式不输出 second/year
  assert.equal(fields.second, undefined);
  assert.equal(fields.year, undefined);
});

test('parser: 单个数值', () => {
  const { fields } = parseExpression('30 * * * *');
  assert.deepEqual(fields.minute, [30]);
});

test('parser: 范围 a-b 展开为闭区间', () => {
  const { fields } = parseExpression('0 0 1-5 * *');
  assert.deepEqual(fields.dayOfMonth, [1, 2, 3, 4, 5]);
});

test('parser: 列表展开为多个离散值', () => {
  const { fields } = parseExpression('0 0 * * 1,3,5');
  assert.deepEqual(fields.dayOfWeek, [1, 3, 5]);
});

test('parser: 步长 */n 从字段最小值起等距取值', () => {
  const { fields } = parseExpression('*/15 * * * *');
  assert.deepEqual(fields.minute, [0, 15, 30, 45]);
});

test('parser: 组合 1,5-10,*/15 合并、去重并升序', () => {
  const { fields } = parseExpression('1,5-10,*/15 * * * *');
  assert.deepEqual(fields.minute, [0, 1, 5, 6, 7, 8, 9, 10, 15, 30, 45]);
});

test('parser: day-of-week 的 7 归一化为 0', () => {
  const { fields } = parseExpression('0 0 * * 7');
  assert.deepEqual(fields.dayOfWeek, [0]);
});

test('parser: 非法表达式抛出 CronParseError', () => {
  assert.throws(() => parseExpression('invalid expr'), CronParseError);
});
