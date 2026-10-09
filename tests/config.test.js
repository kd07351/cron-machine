/**
 * 计算资源限制测试：通过子进程运行编译后的 CLI，真实设置环境变量
 * CRON_MAX_COUNT / CRON_MAX_YEARS，验证默认上限、覆盖效果与非法配置。
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'dist', 'cli.js');

/**
 * 以指定环境变量运行 CLI。
 * @param {object} extraEnv 追加/覆盖的环境变量（值为 null 表示删除）
 * @returns {{status:number, stdout:string, stderr:string}}
 */
function runCli(expression, count, extraEnv = {}) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(extraEnv)) {
    if (value === null) delete env[key];
    else env[key] = value;
  }
  const res = spawnSync(
    process.execPath,
    [CLI],
    { input: JSON.stringify({ expression, startTime: '2026-01-01T00:00:00Z', count }), env, encoding: 'utf8' },
  );
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

test('config: 默认 count 上限 10000，10001 退出码 2', () => {
  const r = runCli('* * * * *', 10001, { CRON_MAX_COUNT: null, CRON_MAX_YEARS: null });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /10000/);
});

test('config: count 99999 超过默认上限，退出码 2', () => {
  const r = runCli('* * * * *', 99999, { CRON_MAX_COUNT: null });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /超过上限/);
});

test('config: CRON_MAX_COUNT 可抬高上限（10000 在 20000 上限下通过）', () => {
  const r = runCli('* * * * *', 10000, { CRON_MAX_COUNT: '20000' });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(r.stdout);
  assert.equal(parsed.nextTimes.length, 10000);
});

test('config: CRON_MAX_COUNT 也可调低上限（101 超过 100 退出码 2；100 通过）', () => {
  const over = runCli('* * * * *', 101, { CRON_MAX_COUNT: '100' });
  assert.equal(over.status, 2);
  assert.match(over.stderr, /最多支持 100 次/);

  const ok = runCli('* * * * *', 100, { CRON_MAX_COUNT: '100' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(ok.stdout).nextTimes.length, 100);
});

test('config: 默认 4 年上限内可命中 2028 闰年 2-29', () => {
  const r = runCli('0 0 29 2 *', 1, { CRON_MAX_YEARS: null });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).nextTimes, ['2028-02-29T00:00:00.000Z']);
});

test('config: CRON_MAX_YEARS=1 时等不到 2028 闰年 2-29，报 never matches 退出码 2', () => {
  const r = runCli('0 0 29 2 *', 1, { CRON_MAX_YEARS: '1' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /1 年内 never matches/);
});

test('config: CRON_MAX_YEARS=2 不够（2026-01-01 起 2 年整为 2028-01-01，2-29 在其后）退出码 2；3 年则通过', () => {
  const tooShort = runCli('0 0 29 2 *', 1, { CRON_MAX_YEARS: '2' });
  assert.equal(tooShort.status, 2);
  assert.match(tooShort.stderr, /never matches/);

  const enough = runCli('0 0 29 2 *', 1, { CRON_MAX_YEARS: '3' });
  assert.equal(enough.status, 0, enough.stderr);
  assert.deepEqual(JSON.parse(enough.stdout).nextTimes, ['2028-02-29T00:00:00.000Z']);
});

test('config: 非法环境变量值退出码 2 并说明原因', () => {
  const badCount = runCli('* * * * *', 1, { CRON_MAX_COUNT: 'abc' });
  assert.equal(badCount.status, 2);
  assert.match(badCount.stderr, /CRON_MAX_COUNT/);

  const zeroYears = runCli('* * * * *', 1, { CRON_MAX_YEARS: '0' });
  assert.equal(zeroYears.status, 2);
  assert.match(zeroYears.stderr, /CRON_MAX_YEARS/);

  const negCount = runCli('* * * * *', 1, { CRON_MAX_COUNT: '-5' });
  assert.equal(negCount.status, 2);
});
