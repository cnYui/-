快速接入高德地图 MCP Server
最后更新时间: 2025年06月23日
支持任意 MCP 协议的客户端（如：Cursor、Claude、Cline）可方便使用高德地图 MCP server。目前支持Streamable HTTP,  SSE 和 Node.js I/O 三种接入方式(推荐用户使用Streamable HTTP)。

1、Cursor 平台 Streamable HTTP 方式接入 MCP 服务（推荐）
1.1 安装 Cursor
建议使用最新版本的 Cursor 客户端，安装 Cursor。

注意
请登录您的 Cursor 个人账户，以使用大模型功能

1.2 进入 Cursor 设置界面配置 Streamable HTTP 连接
1.3 添加一个新的 MCP  Server 配置
获取key

{
  "mcpServers": {
    "amap-maps-streamableHTTP": {
      "url": "https://mcp.amap.com/mcp?key=您在高德官网上申请的key"
    }
  }
}

1.4 返回 Cursor 设置界面查看 MCP 服务工具状态


1.5 选择配置 Cursor 大模型让你拥有更好的服务体验，建议选择 claude-4-sonnet


1.6 模型交互模式 ：选择 Agent 方式
按下 CTRL/CMD + L 快捷键，即可在编辑器右侧打开对话框



1.7 开始使用
了解如何使用高德 MCP 进行规划方案设计和地图可视化场景的生成，请参考 应用案例

2、Cursor 平台 SSE 方式接入 MCP 服务
2.1 安装 Cursor
建议使用最新版本的 Cursor 客户端，安装 Cursor。

注意
请登录您的 Cursor 个人账户，以使用大模型功能

2.2 进入 Cursor 设置界面配置 SSE 连接
2.3 添加一个新的 MCP  Server 配置
获取key

{
  "mcpServers": {
    "amap-amap-sse": {
      "url": "https://mcp.amap.com/sse?key=您在高德官网上申请的key"
    }
  }
}

2.4 返回 Cursor 设置界面查看 MCP 服务工具状态


2.5 选择配置 Cursor 大模型让你拥有更好的服务体验，建议选择 claude-4-sonnet


2.6 模型交互模式 ：选择 Agent 方式
按下 CTRL/CMD + L 快捷键，即可在编辑器右侧打开对话框



2.7 开始使用
了解如何使用高德 MCP 进行规划方案设计和地图可视化场景的生成，请参考 应用案例

3、Spring AI SSE 方式接入 MCP 服务
3.1 配置如下
spring.ai.mcp.client.connection-timeout=60s
spring.ai.mcp.client.type=ASYNC
#注意不要在配置文件中填写高德sse 连接

3.2 增加配置类
@Configuration
public class McpConfig {

    @Bean
    public List<NamedClientMcpTransport> mcpClientTransport() {
        McpClientTransport transport = HttpClientSseClientTransport
                .builder("https://mcp.amap.com")
                .sseEndpoint("/sse?key=<your_key>")
                .objectMapper(new ObjectMapper())
                .build();

        return Collections.singletonList(new NamedClientMcpTransport("amap", transport));
    }
    
}

3.3 使用方法
@Autowired
List<McpAsyncClient> mcpAsyncClients;

@RequestMapping("/test")
public Mono<McpSchema.CallToolResult> test() {
    var mcpClient = mcpAsyncClients.get(0);
    
    return mcpClient.listTools()
            .flatMap(tools -> {
                logger.info("tools: {}", tools);
                
                return mcpClient.callTool(
                        new McpSchema.CallToolRequest(
                                "maps_weather",
                                Map.of("city", "北京")
                        )
                );
            });
}

3.4 开始使用
了解如何使用高德 MCP 进行规划方案设计和地图可视化场景的生成，请参考 应用案例

4、Cursor 平台 Node.js I/O 模式接入 MCP 服务
4.1 安装 Node.js
下载适用于操作系统的 Node 应用程序

提示
请确保已安装 Node.js，并检查本地 Node.js 版本是否为 v22.14.0 或更高版本。建议下载使用 v22.14.0 及以上版本以获得最佳兼容性和性能。
检查 npm 镜像源是否为默认镜像源（https://registry.npmjs.org/）
查看命令：

npm config get registry

4.2 安装 Cursor
建议使用最新版本的 Cursor 客户端，安装 Cursor。

注意
请登录您的 Cursor 个人账户，以使用大模型功能

4.3 进入 Cursor 设置界面配置 MCP Server
4.4 添加一个新的 MCP  Server 配置
获取key

{
  "mcpServers": {
    "amap-maps": {
      "command": "npx",
      "args": ["-y", "@amap/amap-maps-mcp-server"],
      "env": {
        "AMAP_MAPS_API_KEY": "您在高德官网上申请的key"
      }
    }
  }
}

配置如下：



4.5 返回 Cursor 设置界面查看 MCP 服务工具状态


4.6 选择配置 Cursor 大模型让你拥有更好的服务体验，建议选择 claude-4-sonnet


4.7 模型交互模式 ：选择 Agent 方式
按下 CTRL/CMD + L 快捷键，即可在编辑器右侧打开对话框



4.8 开始使用
了解如何使用高德 MCP 进行规划方案设计和地图可视化场景的生成，请参考 应用案例