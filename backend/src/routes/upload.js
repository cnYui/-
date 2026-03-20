import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = Router();

// 确保上传目录存在
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 配置 multer 使用内存存储（先不保存到磁盘）
const storage = multer.memoryStorage();

// 文件过滤器：只允许图片
const fileFilter = (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
        return cb(null, true);
    } else {
        cb(new Error('只允许上传图片文件 (jpeg, jpg, png, gif, webp)'));
    }
};

// 配置 multer
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 限制 10MB（压缩前）
    },
    fileFilter: fileFilter
});

/**
 * 压缩和缩放图片
 * @param {Buffer} buffer - 原始图片buffer
 * @param {string} originalName - 原始文件名
 * @returns {Promise<{buffer: Buffer, filename: string}>}
 */
async function compressAndResizeImage(buffer, originalName) {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    
    console.log(`📐 原始图片尺寸: ${metadata.width}x${metadata.height}, 格式: ${metadata.format}`);
    
    // 生成唯一文件名
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = 'image-' + uniqueSuffix + '.jpg'; // 统一输出为jpg
    
    // 计算缩放尺寸（保持宽高比，最大边不超过2048）
    let resizeOptions = {};
    if (metadata.width > 2048 || metadata.height > 2048) {
        resizeOptions = {
            width: 2048,
            height: 2048,
            fit: 'inside', // 保持宽高比，不裁切
            withoutEnlargement: true // 不放大小图
        };
        console.log(`🔧 缩放图片到 2048x2048 以内（保持宽高比）`);
    }
    
    // 压缩图片
    let processedImage = image;
    
    if (Object.keys(resizeOptions).length > 0) {
        processedImage = processedImage.resize(resizeOptions);
    }
    
    // 转换为JPEG格式并压缩
    const compressedBuffer = await processedImage
        .jpeg({
            quality: 85, // 质量85，平衡文件大小和画质
            progressive: true, // 渐进式JPEG
            mozjpeg: true // 使用mozjpeg优化
        })
        .toBuffer();
    
    const originalSize = (buffer.length / 1024).toFixed(2);
    const compressedSize = (compressedBuffer.length / 1024).toFixed(2);
    const ratio = ((1 - compressedBuffer.length / buffer.length) * 100).toFixed(1);
    
    console.log(`✅ 压缩完成: ${originalSize}KB -> ${compressedSize}KB (减少${ratio}%)`);
    
    return {
        buffer: compressedBuffer,
        filename
    };
}

/**
 * POST /api/upload/image - 上传图片
 */
router.post('/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: '没有上传文件' });
        }

        console.log(`📤 开始处理上传图片: ${req.file.originalname}`);
        
        // 压缩和缩放图片
        const { buffer, filename } = await compressAndResizeImage(
            req.file.buffer,
            req.file.originalname
        );
        
        // 保存到磁盘
        const filePath = path.join(uploadDir, filename);
        await fs.promises.writeFile(filePath, buffer);
        
        // 返回文件访问 URL
        const fileUrl = `/uploads/${filename}`;

        console.log(`✅ 图片上传成功: ${filename}`);

        res.json({
            success: true,
            data: {
                url: fileUrl,
                filename: filename,
                size: buffer.length,
                mimetype: 'image/jpeg'
            }
        });
    } catch (error) {
        console.error('❌ 图片上传失败:', error);
        res.status(500).json({ success: false, error: '图片上传失败: ' + error.message });
    }
});

// 错误处理中间件
router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ success: false, error: '文件大小超过限制（最大5MB）' });
        }
        return res.status(400).json({ success: false, error: error.message });
    } else if (error) {
        return res.status(400).json({ success: false, error: error.message });
    }
    next();
});

export default router;
