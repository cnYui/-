#!/bin/bash
# 导出项目用于迁移到新服务器
# 使用方法: bash scripts/export-for-migration.sh

set -e

echo "🚀 开始导出项目用于迁移..."
echo ""

# 创建导出目录
EXPORT_DIR="mingri-lvtu-export-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$EXPORT_DIR"

echo "📦 1. 复制项目文件（排除 node_modules）..."
rsync -av --progress \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='backend/pgdata' \
  --exclude='*.log' \
  ./ "$EXPORT_DIR/"

echo ""
echo "💾 2. 导出数据库..."
# 查找 PostgreSQL 容器
CONTAINER=$(docker ps --filter "ancestor=postgres" --format "{{.Names}}" | head -n 1)

if [ -z "$CONTAINER" ]; then
  echo "⚠️  未找到运行中的 PostgreSQL 容器，跳过数据库导出"
else
  echo "   找到容器: $CONTAINER"
  docker exec "$CONTAINER" pg_dump -U postgres mingri_lvtu > "$EXPORT_DIR/database_backup.sql"
  echo "   ✅ 数据库已导出到 $EXPORT_DIR/database_backup.sql"
fi

echo ""
echo "📝 3. 创建迁移说明..."
cat > "$EXPORT_DIR/MIGRATION_INSTRUCTIONS.txt" << 'EOF'
===========================================
明日旅途 - 服务器迁移说明
===========================================

在新服务器上执行以下步骤：

1. 安装依赖
   cd backend && npm install
   cd ../frontend && npm install

2. 启动 Docker 数据库
   docker-compose up -d

3. 导入数据库（如果有 database_backup.sql）
   docker exec -i <容器名> psql -U postgres mingri_lvtu < database_backup.sql

4. 或者初始化空数据库
   cd backend
   node src/database/init.js

5. 配置环境变量
   编辑 backend/.env，填入你的 API Keys

6. 启动应用
   # 后端
   cd backend && npm run dev
   
   # 前端（新终端）
   cd frontend && npm run dev

7. 访问应用
   前端: http://localhost:5173
   后端: http://localhost:3001

详细说明请查看 SERVER_MIGRATION_GUIDE.md
EOF

echo ""
echo "📦 4. 打包..."
tar -czf "${EXPORT_DIR}.tar.gz" "$EXPORT_DIR"

echo ""
echo "✅ 导出完成！"
echo ""
echo "📦 导出文件: ${EXPORT_DIR}.tar.gz"
echo "📊 文件大小: $(du -h "${EXPORT_DIR}.tar.gz" | cut -f1)"
echo ""
echo "🚀 下一步："
echo "   1. 将 ${EXPORT_DIR}.tar.gz 传输到新服务器"
echo "   2. 解压: tar -xzf ${EXPORT_DIR}.tar.gz"
echo "   3. 按照 MIGRATION_INSTRUCTIONS.txt 中的步骤操作"
echo ""

# 清理临时目录
rm -rf "$EXPORT_DIR"
