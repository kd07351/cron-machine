/**
 * Cron 引擎公共类型定义
 */

/** 解析后各字段允许取值的集合（升序、去重）。
 *  second/year 仅在 6/7 字段表达式中出现，5 字段表达式不含这两个键，
 *  以保持与标准 5 字段 cron 输出格式的向后兼容。 */
export interface CronFieldValues {
  /** 秒（仅 6/7 字段表达式存在），0-59 */
  second?: number[];
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
  /** 年（仅 7 字段表达式存在），范围见 parser.YEAR_RANGE */
  year?: number[];
}

/** 单个字段的取值范围定义 */
export interface FieldRange {
  /** 字段名（用于错误信息） */
  name: string;
  /** 合法最小值 */
  min: number;
  /** 合法最大值 */
  max: number;
  /** 是否接受 7 表示周日（仅 day-of-week 使用），接受后归一化为 0 */
  allowSevenAsSunday?: boolean;
}

/** 解析结果 */
export interface ParsedCron {
  /** 原始表达式（快捷表达式保持用户输入原样，如 @daily） */
  expression: string;
  /** 各字段解析后的合法取值 */
  fields: CronFieldValues;
  /** 实际字段数：5（含快捷表达式）、6（含秒）或 7（含秒与年） */
  fieldCount: 5 | 6 | 7;
  /** day-of-month 字段是否被显式限制（不是 *），用于 cron 的 OR 语义 */
  dayOfMonthRestricted: boolean;
  /** day-of-week 字段是否被显式限制（不是 *），用于 cron 的 OR 语义 */
  dayOfWeekRestricted: boolean;
}

/** 经过校验的请求参数 */
export interface CronRequest {
  expression: string;
  startTime: Date;
  count: number;
}
