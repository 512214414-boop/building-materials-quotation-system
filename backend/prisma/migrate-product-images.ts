// v11.0 一次性迁移脚本：回填 product_image 表的 v11.0 多版本字段
//
// 使用方法：npx tsx prisma/migrate-product-images.ts
//
// 行为：
//   1. 查询所有 mediumUrl 为空或 hash 为空的 product_image 记录（旧记录）
//   2. 读取对应物理文件
//   3. 调用 imageProcessor.processProductImage 生成三版本 WebP + 计算 hash + 提取元数据
//   4. 更新 DB 行：imageUrl/mediumUrl/thumbnailUrl/width/height/size/hash
//   5. 删除旧物理文件（旧格式文件名，新格式以 hash 命名）
//
// 幂等设计：
//   - hash 已存在的记录跳过
//   - 文件读取失败的记录跳过（仅日志）
//   - 重复执行安全

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { processProductImage } from '../src/utils/imageProcessor.js';
import { config } from '../src/config/index.js';

const prisma = new PrismaClient();

const UPLOAD_ROOT = path.resolve(config.upload.dir);

function resolveLocalPath(imageUrl: string): string | null {
  if (!imageUrl) return null;
  if (/^https?:\/\//i.test(imageUrl)) return null;
  if (!imageUrl.startsWith('/uploads/')) return null;

  const relativePath = imageUrl.slice('/uploads/'.length);
  const absPath = path.resolve(UPLOAD_ROOT, relativePath);

  if (!absPath.startsWith(UPLOAD_ROOT + path.sep) && absPath !== UPLOAD_ROOT) {
    return null;
  }
  return absPath;
}

async function main() {
  console.log('=== v11.0 product_image 多版本字段回填 ===\n');

  // 查询需要迁移的记录（hash 为空或 mediumUrl 为空）
  const legacyImages = await prisma.product_image.findMany({
    where: {
      OR: [{ hash: '' }, { mediumUrl: '' }],
    },
    select: {
      id: true,
      imageUrl: true,
      mediumUrl: true,
      thumbnailUrl: true,
      hash: true,
      brandId: true,
    },
  });

  console.log(`共 ${legacyImages.length} 条记录需要回填\n`);

  if (legacyImages.length === 0) {
    console.log('✓ 无需迁移');
    return;
  }

  let success = 0;
  let failed = 0;
  let skippedMissing = 0;
  const oldFilesToDelete: string[] = [];

  for (const img of legacyImages) {
    console.log(`处理 #${img.id} (brandId=${img.brandId}): ${img.imageUrl}`);

    const absPath = resolveLocalPath(img.imageUrl);
    if (!absPath) {
      console.log(`  ✗ 跳过：非本地路径或防穿越校验失败`);
      failed++;
      continue;
    }

    if (!fs.existsSync(absPath)) {
      console.log(`  ⚠ 跳过：文件不存在`);
      skippedMissing++;
      continue;
    }

    try {
      const buffer = await fs.promises.readFile(absPath);
      const processed = await processProductImage(buffer);

      await prisma.product_image.update({
        where: { id: img.id },
        data: {
          imageUrl: processed.imageUrl,
          mediumUrl: processed.mediumUrl,
          thumbnailUrl: processed.thumbnailUrl,
          width: processed.width,
          height: processed.height,
          size: processed.size,
          hash: processed.hash,
        },
      });

      // 旧文件路径与新生成的不同 → 加入待删除列表
      // 新文件以 hash 命名（{hash}_orig.webp 等）
      // 旧文件可能是 *.jpg / *.png 等格式
      const newPath = resolveLocalPath(processed.imageUrl);
      if (newPath && newPath !== absPath) {
        oldFilesToDelete.push(absPath);
      }

      console.log(`  ✓ 已回填 hash=${processed.hash.slice(0, 12)}...`);
      success++;
    } catch (e) {
      console.log(`  ✗ 失败: ${(e as Error).message}`);
      failed++;
    }
  }

  // 删除旧文件
  console.log(`\n清理旧物理文件 ${oldFilesToDelete.length} 个...`);
  let deleted = 0;
  for (const oldPath of oldFilesToDelete) {
    try {
      await fs.promises.unlink(oldPath);
      deleted++;
    } catch {
      // 忽略
    }
  }

  console.log(`\n=== 迁移完成 ===`);
  console.log(`成功: ${success}`);
  console.log(`失败: ${failed}`);
  console.log(`跳过(文件缺失): ${skippedMissing}`);
  console.log(`清理旧文件: ${deleted}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error('迁移脚本执行失败:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
