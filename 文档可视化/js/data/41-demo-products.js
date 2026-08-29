/**
 * DOC_VIZ.demoProducts
 * 归属：文档可视化 / 内容层
 * 切片自：js/data.js 原 4373-4635 行（已按分层规范拆出，原单文件不再维护）
 *
 * 约定：本文件只承载这一段内容。改这一段，只读/只改本文件，不必读全量。
 */
DOC_VIZ.demoProducts = [
  {
    id: "p1",
    category: "给水管",
    name: "ppr25水管",
    remark: "6分管",
    brands: [
      {
        name: "得亿",
        specs: [
          {
            model: "dn25*3.5",
            remark: "非标",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "根", base: false, rate: 3 }
            ],
            sales: [
              { unit: "米", type: "零售价", price: "12.80" },
              { unit: "米", type: "工程价", price: "12.80" },
              { unit: "根", type: "零售价", price: "38.40" }
            ],
            purchases: [
              { unit: "米", channel: "华南管业", price: "8.20" },
              { unit: "米", channel: "本地批发", price: "8.00" },
              { unit: "根", channel: "华南管业", price: "24.60" }
            ]
          }
        ]
      },
      {
        name: "伟星",
        isDefault: true,
        specs: [
          {
            model: "dn25*3.5",
            remark: "国标 GB/T 18742.2",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "根", base: false, rate: 4 }
            ],
            sales: [
              { unit: "米", type: "零售价", price: "15.60" },
              { unit: "米", type: "工程价", price: "15.60" },
              { unit: "米", type: "批发价", price: "15.60" },
              { unit: "根", type: "零售价", price: "46.80" }
            ],
            purchases: [
              { unit: "米", channel: "伟星管道", price: "10.50" },
              { unit: "米", channel: "华南管业", price: "10.80" },
              { unit: "根", channel: "伟星管道", price: "31.50" }
            ]
          },
          {
            model: "S5 dn25",
            remark: "企标 双层 S5",
            units: [{ name: "米", base: true, rate: 1 }],
            sales: [{ unit: "米", type: "零售价", price: "16.80" }],
            purchases: [{ unit: "米", channel: "伟星管道", price: "11.20" }]
          }
        ]
      },
      {
        name: "日丰",
        specs: [
          {
            model: "dn25*3.5",
            remark: "国标 GB/T 18742.2",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "件", base: false, rate: 1 }
            ],
            sales: [
              { unit: "米", type: "零售价", price: "13.90" },
              { unit: "米", type: "工程价", price: "13.90" },
              { unit: "件", type: "零售价", price: "13.90" }
            ],
            purchases: [
              { unit: "米", channel: "日丰经销", price: "9.10" },
              { unit: "件", channel: "日丰经销", price: "9.10" }
            ]
          }
        ]
      },
      {
        name: "金牛",
        specs: [
          {
            model: "dn25*3.5",
            remark: "企标 Q/JN 01",
            units: [{ name: "米", base: true, rate: 1 }],
            sales: [
              { unit: "米", type: "零售价", price: "12.20" },
              { unit: "米", type: "工程价", price: "12.20" }
            ],
            purchases: [
              { unit: "米", channel: "金牛管业", price: "7.60" },
              { unit: "米", channel: "本地批发", price: "7.40" }
            ]
          }
        ]
      },
      {
        name: "皮尔萨",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "14.20" }], purchases: [{ unit: "米", channel: "本地批发", price: "9.40" }] }]
      },
      {
        name: "金德",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "11.80" }], purchases: [{ unit: "米", channel: "本地批发", price: "7.20" }] }]
      },
      {
        name: "中财",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "11.40" }], purchases: [{ unit: "米", channel: "本地批发", price: "7.00" }] }]
      },
      {
        name: "永高",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "11.10" }], purchases: [{ unit: "米", channel: "本地批发", price: "6.80" }] }]
      },
      {
        name: "白蝶",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "13.20" }], purchases: [{ unit: "米", channel: "本地批发", price: "8.60" }] }]
      },
      {
        name: "亚细亚",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "12.60" }], purchases: [{ unit: "米", channel: "本地批发", price: "8.10" }] }]
      },
      {
        name: "天力",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "12.00" }], purchases: [{ unit: "米", channel: "本地批发", price: "7.80" }] }]
      },
      {
        name: "正基",
        specs: [{ model: "dn25*3.5", units: [{ name: "米", base: true, rate: 1 }], sales: [{ unit: "米", type: "零售价", price: "10.90" }], purchases: [{ unit: "米", channel: "本地批发", price: "6.60" }] }]
      }
    ]
  },
  {
    id: "p2",
    category: "给水管",
    name: "ppr32水管",
    brands: [
      {
        name: "伟星",
        specs: [
          {
            model: "dn32*4.4",
            remark: "国标 GB/T 18742.2",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "根", base: false, rate: 4 }
            ],
            sales: [
              { unit: "米", type: "零售价", price: "22.40" },
              { unit: "根", type: "零售价", price: "89.60" }
            ],
            purchases: [
              { unit: "米", channel: "伟星管道", price: "15.20" }
            ]
          }
        ]
      }
    ]
  },
  {
    id: "p3",
    category: "排水管",
    name: "pvc75排水管",
    brands: [
      {
        name: "联塑",
        specs: [
          {
            model: "dn75",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "根", base: false, rate: 4 }
            ],
            sales: [{ unit: "米", type: "零售价", price: "9.80" }],
            purchases: [{ unit: "米", channel: "本地批发", price: "6.40" }]
          }
        ]
      },
      {
        name: "顾地",
        specs: [
          {
            model: "dn75",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "根", base: false, rate: 4 }
            ],
            sales: [{ unit: "米", type: "零售价", price: "8.60" }],
            purchases: [{ unit: "米", channel: "本地批发", price: "5.90" }]
          }
        ]
      }
    ]
  },
  {
    id: "p4",
    category: "燃气管",
    name: "不锈钢波纹管",
    brands: [
      {
        name: "日丰",
        specs: [
          {
            model: "dn20",
            remark: "国标 GB/T 18742.2",
            units: [{ name: "米", base: true, rate: 1 }],
            sales: [{ unit: "米", type: "零售价", price: "28.00" }],
            purchases: [{ unit: "米", channel: "日丰经销", price: "18.50" }]
          }
        ]
      }
    ]
  },
  {
    id: "p5",
    category: "给水管",
    name: "ppr盘管",
    remark: "盘管",
    brands: [
      {
        name: "伟星",
        specs: [
          {
            model: "dn20",
            remark: "国标 GB/T 18742.2",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "包", base: false, rate: 200, display: true }
            ],
            sales: [
              { unit: "米", type: "零售价", price: "8.50" },
              { unit: "包", type: "零售价", price: "1700.00" }
            ],
            purchases: [
              { unit: "米", channel: "伟星管道", price: "5.20" },
              { unit: "包", channel: "伟星管道", price: "1040.00" }
            ]
          },
          {
            model: "dn25",
            remark: "企标 双层 S5",
            units: [
              { name: "米", base: true, rate: 1 },
              { name: "包", base: false, rate: 100, display: true }
            ],
            sales: [
              { unit: "米", type: "零售价", price: "12.80" },
              { unit: "包", type: "零售价", price: "1280.00" }
            ],
            purchases: [
              { unit: "米", channel: "伟星管道", price: "8.10" },
              { unit: "包", channel: "伟星管道", price: "810.00" }
            ]
          }
        ]
      }
    ]
  }
];
