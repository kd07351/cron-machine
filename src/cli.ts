#!/usr/bin/env node
/**
 * CLI 入口
 *
 * 从 stdin 读取一行 JSON：
 *   { "expression": "星号/5 * * * *", "startTime": "2026-01-01T00:00:00Z", "count": 5 }
 *
 * 成功：向 stdout 输出一行 JSON，退出码 0
 * 失败：向 stderr 输出错误原因，退出码 2
 */

import { parseExpression, CronParseError } from './parser';
import { validateRequest, ValidationError } from './validator';
import { computeNextTimes, NeverMatchesError } from './scheduler';
import { ConfigError } from './config';

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

async function main(): Promise<void> {
  const raw = (await readStdin()).trim();
  if (raw.length === 0) {
    throw new ValidationError('未从 stdin 读到输入内容');
  }

  let input: unknown;
  try {
    input = JSON.parse(raw);
  } catch {
    throw new ValidationError('输入不是合法的 JSON');
  }

  const request = validateRequest(input);
  const parsed = parseExpression(request.expression);
  const nextTimes = computeNextTimes(parsed, request.startTime, request.count);

  const output = {
    expression: parsed.expression,
    fields: parsed.fields,
    nextTimes: nextTimes.map((d) => d.toISOString()),
  };

  process.stdout.write(JSON.stringify(output) + '\n');
}

main().catch((err: unknown) => {
  const message =
    err instanceof ValidationError ||
    err instanceof CronParseError ||
    err instanceof NeverMatchesError ||
    err instanceof ConfigError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
  process.stderr.write(`错误: ${message}\n`);
  process.exit(2);
});
