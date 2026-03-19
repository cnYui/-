# 明日旅途

前后端分离项目

## 端口配置

- **前端**: `http://localhost:5173` (Vite 开发服务器)
- **后端**: `http://localhost:3001` (Express API 服务器)
- **API 代理**: 前端 `/api` 请求自动代理到后端 `http://localhost:3001/api`

## 项目结构

```
├── frontend/          # 前端项目
│   ├── src/
│   │   ├── pages/     # 页面
│   │   ├── components/# 组件
│   │   ├── styles/    # 样式
│   │   ├── js/        # 脚本
│   │   └── assets/    # 静态资源
│   └── package.json
├── backend/           # 后端项目
│   ├── src/
│   │   ├── routes/    # 路由
│   │   ├── controllers/# 控制器
│   │   ├── services/  # 服务
│   │   ├── models/    # 数据模型
│   │   ├── middleware/# 中间件
│   │   └── utils/     # 工具函数
│   └── package.json
├── proxy/             # 反向代理配置
│   └── nginx.conf     # Nginx 配置示例
├── docs/              # 项目文档
│   ├── api/           # API 接口文档
│   ├── design/        # 设计文档
│   └── deployment/    # 部署文档
└── package.json       # 根配置
```

## 快速开始

```bash
# 安装所有依赖
npm run install:all

# 同时启动前后端开发服务器
npm run dev

# 仅启动前端
npm run dev:frontend

# 仅启动后端
npm run dev:backend

# 构建前端
npm run build

# 生产模式启动后端
npm run start
```
