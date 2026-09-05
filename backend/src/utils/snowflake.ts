/**
 * Snowflake 分布式 ID 生成器（后端）
 *
 * 用途：替换现有反范式主键（autoincrement BigInt / `P+时间戳+随机` 业务编码），
 * 为千万级 SKU 生产运行提供全局唯一、时间有序、可水平扩展的 64 位整型主键。
 *
 * 位布局（64 位，符号位恒为 0）：
 *   1 位符号 | 41 位时间戳(ms) | 5 位数据中心 | 5 位工作节点 | 12 位序列号
 *   总计 63 位有效位，最大值 < 2^63，可安全存入 BIGINT UNSIGNED。
 *
 * 设计要点：
 * - 默认 epoch = 2024-01-01，可用 69 年不溢出。
 * - workerId / datacenterId 支持环境变量注入（容器化多实例部署时区分）。
 * - 时钟回拨直接抛错（宁可失败也不产生重复 ID）。
 * - 同毫秒内序列号溢出时自旋等待下一毫秒，保证严格唯一。
 */

export interface SnowflakeOptions {
  /** 工作节点 ID，0..31 */
  workerId?: number;
  /** 数据中心 ID，0..31 */
  datacenterId?: number;
  /** 自定义 epoch（毫秒时间戳），默认 2024-01-01 UTC */
  epoch?: number;
}

const DEFAULT_EPOCH = Date.UTC(2024, 0, 1);

const WORKER_ID_BITS = 5n;
const DATACENTER_ID_BITS = 5n;
const SEQUENCE_BITS = 12n;

const MAX_WORKER_ID = (1n << WORKER_ID_BITS) - 1n; // 31
const MAX_DATACENTER_ID = (1n << DATACENTER_ID_BITS) - 1n; // 31
const SEQUENCE_MASK = (1n << SEQUENCE_BITS) - 1n; // 4095

const WORKER_ID_SHIFT = SEQUENCE_BITS;
const DATACENTER_ID_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS;
const TIMESTAMP_SHIFT = SEQUENCE_BITS + WORKER_ID_BITS + DATACENTER_ID_BITS;

export class SnowflakeGenerator {
  private readonly epoch: bigint;
  private readonly workerId: bigint;
  private readonly datacenterId: bigint;
  private sequence = 0n;
  private lastTimestamp = -1n;

  constructor(opts: SnowflakeOptions = {}) {
    this.epoch = BigInt(opts.epoch ?? DEFAULT_EPOCH);

    const workerId = BigInt(
      opts.workerId ?? Number(process.env.SNOWFLAKE_WORKER_ID ?? 0),
    );
    const datacenterId = BigInt(
      opts.datacenterId ?? Number(process.env.SNOWFLAKE_DATACENTER_ID ?? 0),
    );

    if (workerId < 0n || workerId > MAX_WORKER_ID) {
      throw new Error(`workerId 必须在 0..${MAX_WORKER_ID} 之间，收到 ${workerId}`);
    }
    if (datacenterId < 0n || datacenterId > MAX_DATACENTER_ID) {
      throw new Error(`datacenterId 必须在 0..${MAX_DATACENTER_ID} 之间，收到 ${datacenterId}`);
    }

    this.workerId = workerId;
    this.datacenterId = datacenterId;
  }

  /** 生成下一个全局唯一 ID（BigInt，可安全存入 BIGINT UNSIGNED） */
  nextId(): bigint {
    let ts = this.currentTimeMillis();

    if (ts < this.lastTimestamp) {
      throw new Error(
        `Snowflake 时钟回拨，拒绝生成 ID（回拨 ${this.lastTimestamp - ts}ms）`,
      );
    }

    if (ts === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & SEQUENCE_MASK;
      if (this.sequence === 0n) {
        // 当前毫秒序列耗尽，自旋到下一毫秒
        ts = this.waitNextMillis(this.lastTimestamp);
      }
    } else {
      this.sequence = 0n;
    }

    this.lastTimestamp = ts;

    return (
      ((ts - this.epoch) << TIMESTAMP_SHIFT) |
      (this.datacenterId << DATACENTER_ID_SHIFT) |
      (this.workerId << WORKER_ID_SHIFT) |
      this.sequence
    );
  }

  /** 从 ID 反解出生成时间（UTC ms），用于排查与时间相关的线上问题 */
  parseTimestamp(id: bigint): number {
    return Number((id >> TIMESTAMP_SHIFT) + this.epoch);
  }

  private waitNextMillis(last: bigint): bigint {
    let ts = this.currentTimeMillis();
    while (ts <= last) {
      ts = this.currentTimeMillis();
    }
    return ts;
  }

  private currentTimeMillis(): bigint {
    return BigInt(Date.now());
  }
}

/** 单例：默认单节点部署（workerId=0, datacenterId=0）。多实例部署请通过环境变量区分。 */
export const snowflake = new SnowflakeGenerator();
