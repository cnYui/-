# 小红书数据迁移指南 📸

本文档说明如何将小红书图片和数据文件迁移到新服务器。

## 📍 当前数据位置

根据你的 `.env` 配置：

```env
# 小红书图片目录
XHS_IMAGES_ROOT=D:/CodeWorkSpace/MediaCrawler/data/xhs/images

# 小红书 CSV 数据
XHS_CSV_PATH=D:/CodeWorkSpace/MediaCrawler/data/xhs/jsonl/search_contents_image_author_tags_title_content_time_top50_2026-03-19_clean.csv
```

### 目录结构
```
D:/CodeWorkSpace/MediaCrawler/data/xhs/
├── images/                          # 图片目录
│   ├── 5e75a6990000000001001886/   # 笔记ID目录
│   │   ├── 0.jpg                   # 第1张图片
│   │   ├── 1.jpg                   # 第2张图片
│   │   └── ...
│   ├── 644505c4000000002700359f/   # 另一个笔记
│   │   └── ...
│   └── ...
└── jsonl/                           # CSV/JSON 数据
    └── search_contents_*.csv
```

---

## 🎯 迁移方案

### 方案 A：完整迁移（推荐）

适合：需要保留所有小红书数据

#### 1. 在旧服务器上打包

```powershell
# Windows PowerShell
cd D:\CodeWorkSpace\MediaCrawler\data\xhs

# 打包图片目录（可能很大，几GB）
Compress-Archive -Path "images" -DestinationPath "xhs-images.zip"

# 打包 CSV 数据
Compress-Archive -Path "jsonl" -DestinationPath "xhs-jsonl.zip"

# 查看文件大小
Get-ChildItem xhs-*.zip | Format-Table Name, @{Name="Size(MB)";Expression={[math]::Round($_.Length/1MB,2)}}
```

```bash
# Linux/Mac
cd /path/to/MediaCrawler/data/xhs

# 打包图片目录
tar -czf xhs-images.tar.gz images/

# 打包 CSV 数据
tar -czf xhs-jsonl.tar.gz jsonl/

# 查看文件大小
ls -lh xhs-*.tar.gz
```

#### 2. 传输到新服务器

```bash
# 使用 scp（Linux/Mac）
scp xhs-images.tar.gz user@new-server:/path/to/destination/
scp xhs-jsonl.tar.gz user@new-server:/path/to/destination/

# 或使用 FTP/SFTP 工具（Windows）
# 如 FileZilla, WinSCP 等
```

#### 3. 在新服务器上解压

**选项 1：放在项目外部（推荐）**

```bash
# 创建数据目录
mkdir -p /data/xhs
cd /data/xhs

# 解压
tar -xzf xhs-images.tar.gz
tar -xzf xhs-jsonl.tar.gz

# 目录结构
/data/xhs/
├── images/
│   ├── 5e75a6990000000001001886/
│   └── ...
└── jsonl/
    └── search_contents_*.csv
```

**选项 2：放在项目内部**

```bash
# 在项目根目录
cd /path/to/明日旅途
mkdir -p data/xhs
cd data/xhs

# 解压
tar -xzf xhs-images.tar.gz
tar -xzf xhs-jsonl.tar.gz

# 目录结构
明日旅途/
├── backend/
├── frontend/
└── data/
    └── xhs/
        ├── images/
        └── jsonl/
```

#### 4. 更新 `.env` 配置

编辑 `backend/.env`：

```env
# 选项 1：项目外部
XHS_IMAGES_ROOT=/data/xhs/images
XHS_CSV_PATH=/data/xhs/jsonl/search_contents_*.csv

# 选项 2：项目内部（相对路径）
XHS_IMAGES_ROOT=../../data/xhs/images
XHS_CSV_PATH=../../data/xhs/jsonl/search_contents_*.csv

# 选项 2：项目内部（绝对路径）
XHS_IMAGES_ROOT=/path/to/明日旅途/data/xhs/images
XHS_CSV_PATH=/path/to/明日旅途/data/xhs/jsonl/search_contents_*.csv
```

#### 5. 验证配置

```bash
# 启动后端
cd backend
npm run dev

# 检查日志，应该看到：
# 🖼️ 图片根目录: /data/xhs/images

# 测试访问图片
curl http://localhost:3001/xhs-images/5e75a6990000000001001886/0.jpg
# 应该返回图片数据
```

---

### 方案 B：按需迁移（节省空间）

适合：只迁移已导入数据库的图片

#### 1. 查询数据库中的笔记ID

```bash
cd backend

# 导出已导入的笔记ID列表
node -e "
const { getPgPool } = require('./src/database/pg-client.js');
(async () => {
  const pool = getPgPool();
  const result = await pool.query('SELECT DISTINCT source_note_id FROM posts WHERE source_platform = \\'xhs\\' AND source_note_id IS NOT NULL');
  console.log(result.rows.map(r => r.source_note_id).join('\\n'));
  process.exit(0);
})();
" > xhs_note_ids.txt
```

#### 2. 在旧服务器上打包指定笔记的图片

```powershell
# Windows PowerShell
$noteIds = Get-Content "xhs_note_ids.txt"
$sourceDir = "D:\CodeWorkSpace\MediaCrawler\data\xhs\images"
$targetDir = "xhs-images-selected"

New-Item -ItemType Directory -Path $targetDir -Force

foreach ($noteId in $noteIds) {
    $sourcePath = Join-Path $sourceDir $noteId
    if (Test-Path $sourcePath) {
        Copy-Item -Path $sourcePath -Destination $targetDir -Recurse
        Write-Host "✅ 复制: $noteId"
    }
}

Compress-Archive -Path $targetDir -DestinationPath "xhs-images-selected.zip"
```

```bash
# Linux/Mac
mkdir -p xhs-images-selected

while IFS= read -r note_id; do
    if [ -d "images/$note_id" ]; then
        cp -r "images/$note_id" xhs-images-selected/
        echo "✅ 复制: $note_id"
    fi
done < xhs_note_ids.txt

tar -czf xhs-images-selected.tar.gz xhs-images-selected/
```

#### 3. 传输并解压（同方案A）

---

### 方案 C：不迁移（最简单）

适合：不需要小红书历史数据

#### 操作

在新服务器的 `backend/.env` 中：

```env
# 注释掉或删除小红书相关配置
# XHS_IMAGES_ROOT=...
# XHS_CSV_PATH=...
```

**影响**：
- ✅ 不影响应用启动
- ✅ 不影响核心功能（发布、群聊、地图）
- ❌ 无法访问 `/xhs-images/*` 路由（返回 404）
- ❌ 无法运行数据导入脚本

---

## 📂 推荐目录结构

### 生产环境（推荐）

```
/data/
├── mingri-lvtu/              # 应用目录
│   ├── backend/
│   ├── frontend/
│   └── ...
└── xhs/                      # 数据目录（独立）
    ├── images/               # 图片
    └── jsonl/                # CSV数据
```

**优点**：
- 数据和代码分离
- 便于备份和管理
- 可以多个应用共享数据

**配置**：
```env
XHS_IMAGES_ROOT=/data/xhs/images
XHS_CSV_PATH=/data/xhs/jsonl/search_contents_*.csv
```

### 开发环境

```
明日旅途/
├── backend/
├── frontend/
└── data/                     # 数据目录（项目内）
    └── xhs/
        ├── images/
        └── jsonl/
```

**优点**：
- 所有文件在一起
- 便于开发和测试

**配置**：
```env
XHS_IMAGES_ROOT=../../data/xhs/images
XHS_CSV_PATH=../../data/xhs/jsonl/search_contents_*.csv
```

---

## 🐳 Docker 部署（可选）

如果使用 Docker 部署应用，需要挂载数据目录。

### 更新 docker-compose.yml

```yaml
version: '3.8'

services:
  postgres:
    # ... 数据库配置 ...

  app:
    build: .
    ports:
      - "3001:3001"
    volumes:
      # 挂载小红书数据目录
      - /data/xhs/images:/app/data/xhs/images:ro  # 只读
      - /data/xhs/jsonl:/app/data/xhs/jsonl:ro
    environment:
      - XHS_IMAGES_ROOT=/app/data/xhs/images
      - XHS_CSV_PATH=/app/data/xhs/jsonl/search_contents_*.csv
```

---

## 📋 迁移检查清单

### 迁移前
- [ ] 确认小红书数据位置
  - 图片：`D:/CodeWorkSpace/MediaCrawler/data/xhs/images`
  - CSV：`D:/CodeWorkSpace/MediaCrawler/data/xhs/jsonl/*.csv`
- [ ] 检查数据大小（可能几GB）
- [ ] 决定迁移方案（完整/按需/不迁移）
- [ ] 打包数据文件

### 迁移后
- [ ] 在新服务器上创建目录
- [ ] 解压数据文件
- [ ] 更新 `backend/.env` 配置
- [ ] 验证路径正确
- [ ] 测试图片访问
- [ ] 运行数据导入脚本（如需要）

### 验证步骤

```bash
# 1. 检查目录是否存在
ls -la /data/xhs/images

# 2. 检查图片数量
find /data/xhs/images -name "*.jpg" | wc -l

# 3. 启动应用
cd backend
npm run dev

# 4. 测试图片访问
curl -I http://localhost:3001/xhs-images/5e75a6990000000001001886/0.jpg
# 应该返回 200 OK

# 5. 查看后端日志
# 应该看到：🖼️ 图片根目录: /data/xhs/images
```

---

## 🔧 常见问题

### Q1: 图片目录很大，如何加速传输？

**方案1：使用 rsync（增量传输）**
```bash
rsync -avz --progress \
  D:/CodeWorkSpace/MediaCrawler/data/xhs/images/ \
  user@new-server:/data/xhs/images/
```

**方案2：分批传输**
```bash
# 按字母分批打包
tar -czf xhs-images-a-f.tar.gz images/[a-f]*
tar -czf xhs-images-g-z.tar.gz images/[g-z]*
tar -czf xhs-images-0-9.tar.gz images/[0-9]*
```

### Q2: 路径配置错误怎么办？

检查 `.env` 中的路径：
```bash
# 测试路径是否存在
cd backend
node -e "console.log(require('fs').existsSync(process.env.XHS_IMAGES_ROOT))"
# 应该输出 true
```

### Q3: 图片访问返回 404？

1. 检查路径配置
2. 检查文件权限
3. 检查后端日志
4. 测试直接访问文件系统

```bash
# 检查文件是否存在
ls -la /data/xhs/images/5e75a6990000000001001886/0.jpg

# 检查权限
chmod -R 755 /data/xhs/images
```

### Q4: 需要迁移 CSV 数据吗？

**看情况**：
- 如果数据已导入数据库 → 不需要
- 如果需要重新导入 → 需要
- 如果只是查看 → 不需要

### Q5: 可以使用云存储吗？

可以，但需要修改代码：
- 使用 OSS/S3 等对象存储
- 修改 `backend/src/index.js` 中的静态文件服务
- 或使用 CDN 加速

---

## 🎯 快速命令参考

### 打包（旧服务器）
```powershell
# Windows
cd D:\CodeWorkSpace\MediaCrawler\data\xhs
Compress-Archive -Path "images" -DestinationPath "xhs-images.zip"
Compress-Archive -Path "jsonl" -DestinationPath "xhs-jsonl.zip"
```

```bash
# Linux/Mac
cd /path/to/MediaCrawler/data/xhs
tar -czf xhs-images.tar.gz images/
tar -czf xhs-jsonl.tar.gz jsonl/
```

### 解压（新服务器）
```bash
# 创建目录
mkdir -p /data/xhs
cd /data/xhs

# 解压
tar -xzf xhs-images.tar.gz
tar -xzf xhs-jsonl.tar.gz
```

### 配置（新服务器）
```bash
# 编辑 .env
cd /path/to/明日旅途/backend
nano .env

# 添加或修改
XHS_IMAGES_ROOT=/data/xhs/images
XHS_CSV_PATH=/data/xhs/jsonl/search_contents_*.csv
```

---

**更新时间**：2026-03-20
**文档版本**：v1.0
