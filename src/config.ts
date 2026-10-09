/**
 * 计算资源限制配置
 *
 * 可通过环境变量覆盖默认值：
 *   CRON_MAX_COUNT  单次最多返回的执行次数，默认 10000
 *   CRON_MAX_YEARS  最大查找年限（从起始时间起），默认 4
 *
 * 环境变量未设置或为空时使用默认值；设置为非正整数等非法值时抛出
 * ConfigError（由 cli 转换为退出码 2）。
 *
 * 采用惰性求值（函数形式）而非模块加载时常量，确保非法环境变量在
 * main 的错误处理流程中被捕获，而不是在 import 阶段直接崩溃。
 */

/** 默认 count 上限 */
export const DEFAULT_MAX_COUNT = 10000;
/** 默认最大查找年限 */
export const DEFAULT_MAX_YEARS = 4;

/** 环境变量配置非法错误（对应退出码 2） */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** 读取正整数型环境变量；未设置/为空返回默认值，非法时抛 ConfigError */
function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return defaultValue;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new ConfigError(`环境变量 ${name} 必须是 >= 1 的整数，当前值为 "${raw}"`);
  }
  return value;
}

/** 单次请求 count 上限（可由 CRON_MAX_COUNT 覆盖） */
export function getMaxCount(): number {
  return readPositiveIntEnv('CRON_MAX_COUNT', DEFAULT_MAX_COUNT);
}

/** 最大查找年限（可由 CRON_MAX_YEARS 覆盖） */
export function getMaxYears(): number {
  return readPositiveIntEnv('CRON_MAX_YEARS', DEFAULT_MAX_YEARS);
}
