/**
 * 输入校验测试：合法请求通过；越界、反向范围、星号/0、重复值各一条非法。
 * 非法表达式的语法/范围校验发生在 parser，因此这里走
 * validateRequest -> parseExpression 的完整校验链路。
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const { validateRequest, ValidationError } = require('../dist/validator');
const { parseExpression, CronParseError } = require('../dist/parser');

/** 构造标准输入并执行完整校验，任一环节不合法即抛错 */
function accept(expression, count = 1) {
  const req = validateRequest({
    expression,
    startTime: '2026-01-01T00:00:00Z',
    count,
  });
  return parseExpression(req.expression);
}

test('validator: 合法请求通过并返回归一化参数', () => {
  const req = validateRequest({
    expression: '*/5 * * * *',
    startTime: '2026-01-01T00:00:00Z',
    count: 5,
  });
  assert.equal(req.expression, '*/5 * * * *');
  assert.equal(req.count, 5);
  assert.ok(req.startTime instanceof Date);
  assert.equal(req.startTime.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.doesNotThrow(() => accept('0 9 * * 1-5', 3));
});

test('validator: 字段值越界（minute 60）非法', () => {
  assert.throws(() => accept('60 * * * *'), (err) => {
    assert.ok(err instanceof CronParseError);
    assert.match(err.message, /minute/);
    assert.match(err.message, /超出合法范围/);
    return true;
  });
});

test('validator: 反向范围 3-1（a > b）非法', () => {
  assert.throws(() => accept('0 8 3-1 * *'), (err) => {
    assert.ok(err instanceof CronParseError);
    assert.match(err.message, /day-of-month/);
    assert.match(err.message, /a <= b/);
    return true;
  });
});

test('validator: 步长为 0（*/0）非法', () => {
  assert.throws(() => accept('*/0 * * * *'), (err) => {
    assert.ok(err instanceof CronParseError);
    assert.match(err.message, /步长/);
    return true;
  });
});

test('validator: 列表重复值 1,1 非法', () => {
  assert.throws(() => accept('1,1 * * * *'), (err) => {
    assert.ok(err instanceof CronParseError);
    assert.match(err.message, /重复值/);
    return true;
  });
});

test('validator: count 为 0 或负数抛 ValidationError', () => {
  const base = {
    expression: '* * * * *',
    startTime: '2026-01-01T00:00:00Z',
  };
  assert.throws(() => validateRequest({ ...base, count: 0 }), ValidationError);
  assert.throws(() => validateRequest({ ...base, count: -2 }), ValidationError);
});

test('validator: 非法 JSON 时间字符串抛 ValidationError', () => {
  assert.throws(
    () => validateRequest({ expression: '* * * * *', startTime: 'not-a-time', count: 1 }),
    ValidationError,
  );
});
