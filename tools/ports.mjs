/**
 * 端口登记表 —— 全项目唯一真相源
 *
 * 为什么有这张表：
 *   此前端口散在 8 处而文档只登记 6 个，其中 8090 / 8899 是历史遗留的幽灵服务，
 *   无人认领、空跑了数天。根因不是「端口多」，而是**随手起、无人记账、停止脚本不清理**：
 *   dev.sh 的 stop_app 只管 backend 与 vite，从不碰 `python3 -m http.server`——
 *   这就是端口从 6 个涨到 8 个的机制原因。数量是症状，缺账本才是病根。
 *
 * 纪律：任何脚本、页面、文档需要端口号，一律 import 本表，禁止再写死数字。
 * 守卫：node tools/check-ports.mjs —— 扫出「在监听但没登记」与「登记了却没起」。
 *
 * 字段：
 *   zone    biz 业务（交付给客户的系统）/ tool 开发期工具（生产不带）
 *   deploy  是否随生产部署。承载用户裁决：业务系统与外围工具**不是一个东西**
 *   public  是否在局域网/公网对外暴露
 *   optional 按需启动（开发时才起）。守卫不会因为它没起而报警——
 *            「该起没起」只对常驻服务有意义，按需服务没起是正常的。
 *
 * 用法：
 *   import { PORTS, portOf } from './ports.mjs'
 *   node tools/ports.mjs --shell     # 输出 shell 赋值语句，供 dev.sh / 开工.sh eval
 */
const PORTS = {
  // ── 业务区 · 用户裁决合理，一律不动 ──
  backend: {
    port: 3000,
    name: '后端接口',
    zone: 'biz',
    deploy: true,
    public: true,
    desc: '业务接口，员工端与客户端都走它',
  },
  staff: {
    port: 8080,
    name: '员工端（日常）',
    zone: 'biz',
    deploy: true,
    public: true,
    desc: '生产包，秒开；公网映射的就是它',
  },
  staffDev: {
    port: 8081,
    name: '员工端（开发）',
    zone: 'biz',
    deploy: false,
    public: true,
    optional: true,
    desc: '改代码热更新，开发时看效果（按需启动）',
  },

  // ── 外围区 · 开发期工具，生产部署不带 ──
  // 三个工具（掌控台 / 文档站 / 登记表配置台）合并进一个进程、一个端口。
  // 8898 不在表内——配置台已降级为进程内模块，不再占端口。
  hub: {
    port: 8124,
    name: '工具台',
    zone: 'tool',
    deploy: false,
    public: true,
    optional: true,
    desc: '掌控台 / 文档站 / 配置台的统一入口，开发环境专用（按需启动）',
  },

  // 仅手动 `node tools/meta-studio.mjs` 独立调试时临时占用。
  // 正常用法是工具台进程内调用，根本不占端口——标 optional，守卫才不会把它当幽灵。
  metaStandalone: {
    port: 8898,
    name: '登记表配置台（独立运行）',
    zone: 'tool',
    deploy: false,
    public: false,
    optional: true,
    desc: '仅手动单独启动时临时占用；正常由工具台 /meta/ 进程内提供',
  },

  // 配置层预览（草稿期）：npm run layer 按需启动。
  // 纯静态服务 + 页面轮询真源文件，零生成器——配置层定稿前不接项目（用户裁决）。
  layerPreview: {
    port: 8899,
    name: '配置层预览',
    zone: 'tool',
    deploy: false,
    public: true,
    optional: true,
    desc: '配置预览面板的静态服务（按需启动），页面实时读 配置预览/config-layer/ 真源',
  },
};

/** 生产部署要带的服务 */
export const deployPorts = () => Object.values(PORTS).filter((p) => p.deploy);

/** 按 key 取端口号 */
export const portOf = (key) => PORTS[key]?.port;

/** 登记表全部条目（守卫比对用） */
export const allPorts = () => Object.entries(PORTS).map(([key, v]) => ({ key, ...v }));

export { PORTS };

/* ------------------------- CLI：给 shell 用的导出 ------------------------- */
// dev.sh / 开工.sh 是 bash，没法直接 import ESM。用这个模式把端口喂给它们，
// 避免又出现第二处硬编码——仓库外（~/.bmq/）的脚本尤其容易被漏改。
if (process.argv[1] && process.argv[1].endsWith('ports.mjs')) {
  const arg = process.argv[2];
  if (arg === '--shell') {
    const lines = Object.entries(PORTS).map(
      ([key, v]) => `export PORT_${key.toUpperCase()}=${v.port}`,
    );
    console.log(lines.join('\n'));
  } else if (arg === '--deploy') {
    // 生产部署需要的端口，一行一个，供部署脚本读取
    console.log(deployPorts().map((p) => p.port).join('\n'));
  } else if (arg === '--json') {
    console.log(JSON.stringify(PORTS, null, 2));
  } else {
    console.log(
      [
        '端口登记表（唯一真相源）',
        '',
        ...allPorts().map(
          (p) =>
            `  ${String(p.port).padEnd(5)} ${p.name.padEnd(14)} ` +
            `[${p.zone === 'biz' ? '业务' : '工具'}] ` +
            `${p.deploy ? '生产带' : '生产不带'} ` +
            `${p.public ? '对外' : '仅本机'}  ${p.desc}`,
        ),
        '',
        '用法：--shell（输出 shell 赋值） / --deploy（生产端口） / --json',
      ].join('\n'),
    );
  }
}
