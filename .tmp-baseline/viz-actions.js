// 自动生成 · 禁止手改 · 来源 data-source/entity-meta.yml（node tools/gen-entity-meta.mjs）
// 操作守卫动作登记：集合体文档 guard 维度渲染用（集合体只声明 action key，不复制文案）。

window.DOC_VIZ = window.DOC_VIZ || {};
DOC_VIZ.actionMeta = {
  "purchase_inbound_confirm": {
    "label": "确认采购入库",
    "guard": {
      "requires": [
        {
          "fields": [
            "supplierId"
          ],
          "reason": "请选择供应商"
        },
        {
          "fields": [
            "warehouseId"
          ],
          "reason": "请选择入库仓库"
        }
      ],
      "minSelected": {
        "n": 1,
        "reason": "请先选品，再确认入库"
      },
      "rowNumerics": [
        {
          "field": "qty",
          "op": "gt",
          "ref": 0,
          "reason": "「{productRef}」数量必须大于 0"
        },
        {
          "field": "unitCost",
          "op": "ge",
          "ref": 0,
          "reason": "「{productRef}」进价不能为负"
        }
      ]
    }
  },
  "purchase_price_batch_adjust": {
    "label": "批量调整进价",
    "guard": {
      "requires": [
        {
          "fields": [
            "supplierId",
            "brandInput",
            "categoryInput"
          ],
          "reason": "请先选择供应商、品牌、分类"
        }
      ],
      "numbers": [
        {
          "field": "oldPoint",
          "op": "gt",
          "ref": 0,
          "reason": "请填写旧点位"
        },
        {
          "field": "newPoint",
          "op": "gt",
          "ref": 0,
          "reason": "请填写新点位"
        }
      ]
    }
  },
  "inventory_adjust": {
    "label": "盘点调整",
    "guard": {
      "numbers": [
        {
          "field": "targetQty",
          "op": "ge",
          "ref": 0,
          "reason": "盘点后数量必须 ≥ 0"
        },
        {
          "field": "unitCost",
          "op": "ge",
          "ref": 0,
          "reason": "期初/盘点成本必须 ≥ 0"
        }
      ]
    }
  },
  "inventory_opening": {
    "label": "期初入库",
    "guard": {
      "requires": [
        {
          "fields": [
            "warehouseId"
          ],
          "reason": "请选择仓库"
        },
        {
          "fields": [
            "sku",
            "unit"
          ],
          "reason": "请先选品"
        }
      ],
      "numbers": [
        {
          "field": "qty",
          "op": "gt",
          "ref": 0,
          "reason": "期初数量必须大于 0"
        },
        {
          "field": "unitCost",
          "op": "ge",
          "ref": 0,
          "reason": "期初成本不能为负"
        }
      ]
    }
  },
  "staff_login": {
    "label": "员工登录",
    "guard": {
      "requires": [
        {
          "fields": [
            "username"
          ],
          "reason": "请输入用户名"
        },
        {
          "fields": [
            "password"
          ],
          "reason": "请输入密码"
        }
      ]
    }
  },
  "customer_verify": {
    "label": "授权码准入",
    "guard": {
      "requires": [
        {
          "fields": [
            "authCode"
          ],
          "reason": "请输入授权码"
        }
      ],
      "formats": [
        {
          "field": "phone",
          "pattern": "^[A-Za-z0-9_+.-]{1,200}$",
          "reason": "请输入登录账号（电话或微信）"
        }
      ]
    }
  },
  "customer_access_request": {
    "label": "申请准入",
    "guard": {
      "formats": [
        {
          "field": "phone",
          "pattern": "^[A-Za-z0-9_+.-]{1,200}$",
          "reason": "请输入登录账号（电话或微信）"
        }
      ]
    }
  },
  "refund_add_lines": {
    "label": "添退换记录",
    "guard": {
      "minSelected": {
        "n": 1,
        "reason": "请先对上已卖行"
      },
      "rowNumerics": [
        {
          "field": "qty",
          "op": "gt",
          "ref": 0,
          "reason": "{productRef} 退换数量必须大于 0"
        },
        {
          "field": "qty",
          "op": "le",
          "refField": "remaining",
          "reason": "{productRef} 不能超过剩余可退量 {remaining}"
        }
      ]
    }
  },
  "refund_add_single": {
    "label": "单个添退换",
    "guard": {
      "requires": [
        {
          "fields": [
            "selectedSold"
          ],
          "reason": "请先对上已卖行"
        }
      ]
    }
  },
  "refund_edit_line": {
    "label": "改退换数量",
    "guard": {
      "numbers": [
        {
          "field": "refundQty",
          "op": "gt",
          "ref": 0,
          "reason": "退换数量必须大于 0"
        }
      ]
    }
  },
  "quote_recognize": {
    "label": "识别开单文本",
    "guard": {
      "requires": [
        {
          "fields": [
            "recognizeText"
          ],
          "reason": "请粘贴订单文本"
        }
      ]
    }
  },
  "payment_quick_add": {
    "label": "快捷记收款",
    "guard": {
      "numbers": [
        {
          "field": "amount",
          "op": "gt",
          "ref": 0,
          "reason": "金额必须为正数"
        }
      ]
    }
  },
  "detail_add_to_doc": {
    "label": "加入订单",
    "guard": {
      "numbers": [
        {
          "field": "qty",
          "op": "gt",
          "ref": 0,
          "reason": "请输入有效数量"
        }
      ]
    }
  },
  "inbound_set_target": {
    "label": "设置目标仓库",
    "guard": {
      "requires": [
        {
          "fields": [
            "target"
          ],
          "reason": "请选择目标仓库"
        }
      ]
    }
  },
  "price_edit_add": {
    "label": "新增价格",
    "guard": {
      "requires": [
        {
          "fields": [
            "specBrandId",
            "unitId"
          ],
          "reason": "请先选择产品与单位"
        }
      ],
      "numbers": [
        {
          "field": "inputValue",
          "op": "gt",
          "ref": 0,
          "reason": "请先输入有效价格"
        }
      ]
    }
  },
  "price_archive_confirm": {
    "label": "价格写入档案",
    "guard": {
      "requires": [
        {
          "fields": [
            "selectedPriceTypeId"
          ],
          "reason": "请选择价格类型"
        }
      ]
    }
  },
  "unit_quick_add": {
    "label": "单位快建",
    "guard": {
      "requires": [
        {
          "fields": [
            "name"
          ],
          "reason": "请先输入单位名"
        }
      ]
    }
  },
  "archive_sales": {
    "label": "定档销售",
    "guard": {
      "states": {
        "allow": [
          true
        ],
        "reason": "请先完成 V9 店长汇总确认"
      }
    }
  },
  "archive_logistics": {
    "label": "定档物流",
    "guard": {
      "states": {
        "allow": [
          true
        ],
        "reason": "请先完成 V9 店长汇总确认"
      }
    }
  },
  "archive_costs": {
    "label": "定档成本",
    "guard": {
      "states": {
        "allow": [
          true
        ],
        "reason": "请先完成 V9 店长汇总确认"
      }
    }
  },
  "purchase_recognize": {
    "label": "识别订单文字",
    "guard": {
      "requires": [
        {
          "fields": [
            "recognizeText"
          ],
          "reason": "请粘贴订单文字"
        }
      ]
    }
  },
  "purchase_commit_qty": {
    "label": "提交数量",
    "guard": {
      "numbers": [
        {
          "field": "newQty",
          "op": "gt",
          "ref": 0,
          "reason": "数量必须大于 0"
        }
      ]
    }
  },
  "purchase_submit_demand": {
    "label": "提交需求",
    "guard": {
      "minSelected": {
        "n": 1,
        "reason": "请先添加物料"
      }
    }
  },
  "product_save": {
    "label": "保存产品",
    "guard": {
      "requires": [
        {
          "fields": [
            "productName"
          ],
          "reason": "请输入产品名称"
        }
      ]
    }
  },
  "document_recognize": {
    "label": "识别订单文本",
    "guard": {
      "requires": [
        {
          "fields": [
            "recognizeText"
          ],
          "reason": "请粘贴订单文本"
        }
      ]
    }
  },
  "allocation_source_quick_add": {
    "label": "配货来源快建",
    "guard": {
      "requires": [
        {
          "fields": [
            "kw"
          ],
          "reason": "先打名称再新建"
        }
      ]
    }
  },
  "quick_create_confirm": {
    "label": "快速建档确认",
    "guard": {
      "requires": [
        {
          "fields": [
            "productName"
          ],
          "reason": "请输入产品名称"
        }
      ]
    }
  },
  "supplier_quick_add": {
    "label": "供应商快建",
    "guard": {
      "requires": [
        {
          "fields": [
            "keyword"
          ],
          "reason": "先输入供应商名称"
        }
      ]
    }
  },
  "reimbursement_save": {
    "label": "保存报销单",
    "guard": {
      "minSelected": {
        "n": 1,
        "reason": "至少保留一行有效商品"
      }
    }
  },
  "customer_quick_add": {
    "label": "客户快建",
    "guard": {
      "requiresAny": [
        {
          "fields": [
            "phone",
            "name"
          ],
          "reason": "姓名与联系方式至少填一个"
        }
      ]
    }
  },
  "sale_price_apply": {
    "label": "价格类型应用",
    "guard": {
      "rowUnique": [
        {
          "in": "unitSalePrices",
          "keys": [
            {
              "field": "priceTypeId",
              "against": "nextId"
            }
          ],
          "reason": "价格类型「{name}」已存在，可在上方行直接编辑"
        }
      ]
    }
  },
  "purchase_price_edit_supplier": {
    "label": "改供应商进价",
    "guard": {
      "rowUnique": [
        {
          "in": "purchasePrices",
          "keys": [
            {
              "field": "supplierId",
              "against": "newId"
            },
            {
              "field": "unitIdx",
              "against": "unitIdx"
            }
          ],
          "except": {
            "field": "rowKey",
            "against": "rowKey"
          },
          "reason": "供应商「{newName}」已存在，不可重复"
        }
      ]
    }
  },
  "purchase_price_add_derived": {
    "label": "派生供应商进价",
    "guard": {
      "rowUnique": [
        {
          "in": "purchasePrices",
          "keys": [
            {
              "field": "supplierId",
              "against": "supplierId"
            },
            {
              "field": "unitIdx",
              "against": "unitIdx"
            }
          ],
          "reason": "供应商「{sname}」已存在，可直接编辑"
        }
      ]
    }
  },
  "spec_rename": {
    "label": "改规格",
    "guard": {
      "rowUnique": [
        {
          "in": "specs",
          "keys": [
            {
              "field": "specModel",
              "against": "newName"
            }
          ],
          "except": {
            "field": "id",
            "against": "specId"
          },
          "reason": "规格「{newName}」已存在"
        }
      ]
    }
  },
  "dict_item_add": {
    "label": "字典项新增",
    "guard": {
      "rowUnique": [
        {
          "in": "items",
          "keys": [
            {
              "field": "name",
              "against": "trimmed"
            }
          ],
          "reason": "{entityName}「{trimmed}」已存在"
        }
      ]
    }
  },
  "dict_item_rename": {
    "label": "字典项改名",
    "guard": {
      "rowUnique": [
        {
          "in": "items",
          "keys": [
            {
              "field": "name",
              "against": "trimmed"
            }
          ],
          "reason": "{entityName}「{trimmed}」已存在"
        }
      ]
    }
  }
};
