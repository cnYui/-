# PowerShell 脚本 - 导出项目用于迁移到新服务器
# 使用方法: .\scripts\export-for-migration.ps1

Write-Host "🚀 开始导出项目用于迁移..." -ForegroundColor Green
Write-Host ""

# 创建导出目录
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportDir = "mingri-lvtu-export-$timestamp"
New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

Write-Host "📦 1. 复制项目文件（排除 node_modules）..." -ForegroundColor Cyan

# 要排除的目录和文件
$excludeDirs = @(
    "node_modules",
    ".git",
    "pgdata",
    ".vscode"
)

$excludeFiles = @(
    "*.log"
)

# 复制文件
Get-ChildItem -Path . -Recurse | Where-Object {
    $item = $_
    $shouldExclude = $false
    
    # 检查是否在排除目录中
    foreach ($dir in $excludeDirs) {
        if ($item.FullName -like "*\$dir\*" -or $item.Name -eq $dir) {
            $shouldExclude = $true
            break
        }
    }
    
    # 检查是否是排除的文件类型
    foreach ($pattern in $excludeFiles) {
        if ($item.Name -like $pattern) {
            $shouldExclude = $true
            break
        }
    }
    
    -not $shouldExclude
} | ForEach-Object {
    $relativePath = $_.FullName.Substring((Get-Location).Path.Length + 1)
    $targetPath = Join-Path $exportDir $relativePath
    
    if ($_.PSIsContainer) {
        New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
    } else {
        $targetDir = Split-Path $targetPath -Parent
        if (-not (Test-Path $targetDir)) {
            New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
        }
        Copy-Item $_.FullName -Destination $targetPath -Force
    }
}

Write-Host "   ✅ 项目文件已复制" -ForegroundColor Green
Write-Host ""

Write-Host "💾 2. 导出数据库..." -ForegroundColor Cyan

# 查找 PostgreSQL 容器
$containers = docker ps --format "{{.Names}}" | Select-String "postgres"

if ($containers) {
    $containerName = $containers[0].ToString()
    Write-Host "   找到容器: $containerName" -ForegroundColor Yellow
    
    $backupFile = Join-Path $exportDir "database_backup.sql"
    docker exec $containerName pg_dump -U postgres mingri_lvtu | Out-File -FilePath $backupFile -Encoding UTF8
    
    Write-Host "   ✅ 数据库已导出到 $backupFile" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  未找到运行中的 PostgreSQL 容器，跳过数据库导出" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "📝 3. 创建迁移说明..." -ForegroundColor Cyan

$instructions = @"
===========================================
明日旅途 - 服务器迁移说明
===========================================

在新服务器上执行以下步骤：

1. 安装依赖
   cd backend
   npm install
   cd ..\frontend
   npm install

2. 启动 Docker 数据库
   docker-compose up -d

3. 导入数据库（如果有 database_backup.sql）
   Get-Content database_backup.sql | docker exec -i <容器名> psql -U postgres mingri_lvtu

4. 或者初始化空数据库
   cd backend
   node src/database/init.js

5. 配置环境变量
   编辑 backend\.env，填入你的 API Keys

6. 启动应用
   # 后端（终端1）
   cd backend
   npm run dev
   
   # 前端（终端2）
   cd frontend
   npm run dev

7. 访问应用
   前端: http://localhost:5173
   后端: http://localhost:3001

详细说明请查看 SERVER_MIGRATION_GUIDE.md
"@

$instructions | Out-File -FilePath (Join-Path $exportDir "MIGRATION_INSTRUCTIONS.txt") -Encoding UTF8

Write-Host "   ✅ 迁移说明已创建" -ForegroundColor Green
Write-Host ""

Write-Host "📦 4. 打包..." -ForegroundColor Cyan

$zipFile = "$exportDir.zip"
Compress-Archive -Path $exportDir -DestinationPath $zipFile -Force

$fileSize = (Get-Item $zipFile).Length / 1MB
Write-Host "   ✅ 打包完成" -ForegroundColor Green
Write-Host ""

Write-Host "✅ 导出完成！" -ForegroundColor Green
Write-Host ""
Write-Host "📦 导出文件: $zipFile" -ForegroundColor Cyan
Write-Host "📊 文件大小: $([math]::Round($fileSize, 2)) MB" -ForegroundColor Cyan
Write-Host ""
Write-Host "🚀 下一步：" -ForegroundColor Yellow
Write-Host "   1. 将 $zipFile 传输到新服务器"
Write-Host "   2. 解压: Expand-Archive -Path $zipFile -DestinationPath ."
Write-Host "   3. 按照 MIGRATION_INSTRUCTIONS.txt 中的步骤操作"
Write-Host ""

# 清理临时目录
Remove-Item -Path $exportDir -Recurse -Force

Write-Host "按任意键退出..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
