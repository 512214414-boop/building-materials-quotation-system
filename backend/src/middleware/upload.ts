import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { config } from '../config/index.js';
import { Errors } from '../utils/errors.js';

if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true });
}

// 产品图片子目录（v11.0：imageProcessor 直接写入，multer 不再落盘）
const productUploadDir = path.join(config.upload.dir, 'products');
if (!fs.existsSync(productUploadDir)) {
  fs.mkdirSync(productUploadDir, { recursive: true });
}

/**
 * v11.0：文件名生成（crypto.randomUUID + 原扩展名）
 *
 * 用于通用上传（非产品图片），产品图片改用 memoryStorage + imageProcessor。
 */
function generateFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const uuid = crypto.randomUUID();
  return `${uuid}${ext}`;
}

// 通用上传：磁盘存储
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.upload.dir),
  filename: (_req, file, cb) => {
    cb(null, generateFilename(file.originalname));
  },
});

// v11.0 生产级：产品图片专用 memoryStorage
//   不再由 multer 落盘，而是把 buffer 传给 imageProcessor
//   imageProcessor 用 SHA-256 hash 命名 + sharp 生成三版本 WebP
//   内存占用：前端已预压缩到 1MB 以内，50 人并发最多 50MB，可接受
const productStorage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback,
) => {
  const ext = path.extname(file.originalname).toLowerCase().replace('.', '');
  if (!config.upload.allowedTypes.includes(ext)) {
    return cb(new Error('不支持的文件类型'));
  }
  cb(null, true);
};

export const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter,
});

// v2.1 产品图片专用 upload 实例
export const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: config.upload.maxFileSize },
  fileFilter,
});

/** 统一处理 multer 错误为 AppError */
export function handleUploadError(
  err: unknown,
  _req: Express.Request,
  _res: Express.Response,
  next: (e?: unknown) => void,
) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(Errors.tooLarge('文件超过大小限制'));
    }
    return next(Errors.badRequest('文件上传失败: ' + err.message));
  }
  if (err instanceof Error && err.message === '不支持的文件类型') {
    return next(Errors.badRequest('不支持的文件类型', 42201));
  }
  next(err);
}
