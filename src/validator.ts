/**
 * 输入校验：校验从 stdin 读入的 JSON 是否符合请求格式。
 * 表达式本身的语法校验由 parser 负责。
 */

import { CronRequest } from './types';
import { getMaxCount } from './config';

/** 输入非法错误（对应退出码 2） */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * 校验并归一化请求对象。
 * 非法时抛出 ValidationError。
 */
export function validateRequest(input: unknown): CronRequest {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new ValidationError('输入必须是一个 JSON 对象');
  }

  const obj = input as Record<string, unknown>;

  if (typeof obj.expression !== 'string' || obj.expression.trim().length === 0) {
    throw new ValidationError('字段 expression 必须是非空字符串');
  }

  if (typeof obj.startTime !== 'string' || obj.startTime.length === 0) {
    throw new ValidationError('字段 startTime 必须是 ISO 时间字符串');
  }
  const startMs = Date.parse(obj.startTime);
  if (Number.isNaN(startMs)) {
    throw new ValidationError(`字段 startTime 不是合法的时间字符串: "${obj.startTime}"`);
  }

  if (
    typeof obj.count !== 'number' ||
    !Number.isInteger(obj.count) ||
    obj.count < 1
  ) {
    throw new ValidationError('字段 count 必须是 >= 1 的整数');
  }
  const maxCount = getMaxCount();
  if (obj.count > maxCount) {
    throw new ValidationError(`字段 count 超过上限，最多支持 ${maxCount} 次（当前为 ${obj.count}）；可通过环境变量 CRON_MAX_COUNT 调整`);
  }

  return {
    expression: obj.expression,
    startTime: new Date(startMs),
    count: obj.count,
  };
}
