# **JS API 安全密钥使用**最后更新时间: 2025年06月18日

本章将介绍关于安全密钥的使用，包括通过**代理服务器转发**和**明文方式设置**两种方式。

为了增强安全性，建议将安全密钥存储在服务器端，并通过服务器端生成地图 JS API 的请求 URL。这样可以避免将密钥直接以明文的方式暴露给 Web 端代码中，减少密钥被滥用的风险，如果你只是想便捷开发可以使用明文方式设置。

## **准备**

**成为开发者并创建 key**

为了正常调用 API ，请先注册成为高德开放平台开发者，并申请 web 平台（JS API）的 key 和安全密钥，点击 [具体操作](https://lbs.amap.com/api/jsapi-v2/prerequisites)。

**提示**

你在2021年12月02日以后申请的 key 需要配合你的安全密钥一起使用。

## **通过代理服务器转发**

**注意**

JS API  安全密钥通过代理服务器转发，强烈建议使用（安全）。

以Nginx反向代理为例，参考以下三个location配置，进行反向代理设置，分别对应自定义地图、Web 服务，其中自定义地图如果没有使用到相关功能也可以不设置。需要将以下配置中的**「你的安全密钥」**六个字替换为你刚刚获取的securityJsCode安全密钥。如果你使用了多个 key，需要在代理设置中根据 key 来映射不同的安全密钥。

```
server {
  listen       80;             #nginx端口设置，可按实际端口修改
  server_name  127.0.0.1;      #nginx server_name 对应进行配置，可按实际添加或修改
  # 自定义地图如果没有使用到相关功能可以不设置，但是如果需要设置顺序要与示例一致
  # 自定义地图服务代理
  location /_AMapService/v4/map/styles {
    set $args "$args&jscode=你的安全密钥";
    proxy_pass https://webapi.amap.com/v4/map/styles;
  }
  # Web服务API 代理
  location /_AMapService/ {
    set $args "$args&jscode=你的安全密钥";
    proxy_pass https://restapi.amap.com/;
  }
}
```

**nginx**

**注意**

JS API 使用<script>标签同步加载增加代理服务器设置脚本，设置代理服务器域名或地址，将下面示例代码中的**「你的代理服务器域名或地址」**替换为你的代理服务器域名或 ip 地址，其中_AMapService为代理请求固定前缀，不可省略或修改（注意你这个设置必须是在 JS API 脚本加载之前进行设置，否则设置无效）。

保存相关配置之后需要通过命令nginx -s reload命令重新加载nginx配置文件。

以JS API 脚本同步加载为例：

```
<div id="container"></div>
<script type="text/javascript">
  window._AMapSecurityConfig = {
    serviceHost: "你的代理服务器域名或地址/_AMapService",
    //例如 ：serviceHost:'http://1.1.1.1:80/_AMapService',
  };
</script>
<script
  type="text/javascript"
  src="https://webapi.amap.com/maps?v=2.0&key=你申请的key值"
></script>
<script type="text/javascript">
  //地图初始化应该在地图容器div已经添加到DOM树之后
  var map = new AMap.Map("container", {
    zoom: 12,
  });
</script>
```

**HTML**

**提示**

本例使用Nginx为例，你也可以选择其他方式代理转发 如 Java、Node 服务等。

## **通过明文方式设置**

**注意**

JS API 安全密钥以明文方式设置，不建议在生产环境使用（不安全）。

**提示**

JS API 使用<script>标签同步加载增加安全密钥设置脚本，并将**「你申请的安全密钥」**替换为你的安全密钥（注意你这个设置必须是在 JS API 脚本加载之前进行设置，否则设置无效）。

JS API 脚本同步加载为例：

```
<div id="container"></div>
<script type="text/javascript">
  window._AMapSecurityConfig = {
    securityJsCode: "「你申请的安全密钥」",
  };
</script>
<script
  type="text/javascript"
  src="https://webapi.amap.com/maps?v=2.0&key=你申请的key值"
></script>
<script type="text/javascript">
  //地图初始化应该在地图容器div已经添加到DOM树之后
  var map = new AMap.Map("container", {
    zoom: 12,
  });
</script>
```

**HTML**

[查看更多明文加载方式](https://lbs.amap.com/api/javascript-api-v2/guide/abc/load) 