/**
 * Snowflake 分布式 ID 生成器（前端）
 *
 * 与后端 `shared/utils/snowflake` 同算法，用于：
 * - 离线/乐观创建时的本地临时 ID（落库前由后端权威 ID 覆盖）
 * - 前端生成的草稿、附件占位等场景
 *
 * 位布局（64 位）：1 符号 | 41 时间戳 | 5 数据中心 | 5 工作节点 | 12 序列
 * 前端默认 workerId=31（预留给客户端），datacenterId=31，避免与后端实例冲突。
 */

export interface SnowflakeOptions {
  workerId?: number;
  datacenterId?: number;
  epoch?: number;
}

const DEFAULT_EPOCH = Date.UTC(2024, 0, 1);

const WORKER_ID_BITS = 5n;
const DATACENTER_ID_BITS = 5n;
const SEQUENCE_BITS = 12n;

const MAX_WORKER_ID = (1n << WORKER_ID_BITS) - 1n;
const MAX_DATACENTER_ID = (1n << DATACENTER_ID_BITS) - 1n;
const SEQUENCE_MASK = (1n << SEQUENCE_BITS) - 1n;

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
    const workerId = BigInt(opts.workerId ?? 31);
    const datacenterId = BigInt(opts.datacenterId ?? 31);
    if (workerId < 0n || workerId > MAX_WORKER_ID) {
      throw new Error(`workerId 必须在 0..${MAX_WORKER_ID} 之间`);
    }
    if (datacenterId < 0n || datacenterId > MAX_DATACENTER_ID) {
      throw new Error(`datacenterId 必须在 0..${MAX_DATACENTER_ID} 之间`);
    }
    this.workerId = workerId;
    this.datacenterId = datacenterId;
  }

  nextId(): bigint {
    let ts = BigInt(Date.now());
    if (ts < this.lastTimestamp) {
      throw new Error('Snowflake 时钟回拨，拒绝生成 ID');
    }
    if (ts === this.lastTimestamp) {
      this.sequence = (this.sequence + 1n) & SEQUENCE_MASK;
      if (this.sequence === 0n) {
        while (ts <= this.lastTimestamp) ts = BigInt(Date.now());
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
}

/** 前端默认实例：客户端占位 ID 生成器 */
export const snowflake = new SnowflakeGenerator();
