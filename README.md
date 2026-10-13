# 数字衣柜 · Yifu

一个可自行运行的数字衣柜网页：上传人物照片和衣服，选择单品换装，将完成的穿搭生成可拖动查看的 360° 旋转视频。支持电脑和手机浏览器。

源码使用 MIT 许可证。仓库从空衣柜开始，不包含作者的照片、密钥、生成视频或个人数据。

## 能做什么

- **人物素材**：保存原始照片与参考模特，可提取照片中的服饰。
- **衣柜**：上传多件衣服，确认分类，反复用于不同搭配。
- **穿搭首页**：分别查看静态穿搭与已生成的 360° 穿搭。
- **旋转展示**：浏览器一次准备角度缓存，拖动显示缓存图片；自动播放使用原视频，保存当前角度使用原始清晰度。
- **重新生成**：新视频保存成功后切换展示，保留旧媒体引用与历史。

360° 来自生成视频，不是可编辑的三维模型。模型可能改变细节或姿态，实际结果需要查看确认。

## 快速开始

需要 Node.js 22.13 或以上（建议使用仓库 `.nvmrc` 指定的 Node.js 24）。

```bash
git clone https://github.com/YYeWan/yifu.git
cd yifu
npm ci
cp .env.example .env
npm start
```

打开 **http://127.0.0.1:8767/**。首次运行是空衣柜，可直接上传并保存自己的照片、衣服、导入已有视频；AI 功能需要先填写 `.env`，然后重启服务。

Windows 可用 `copy .env.example .env` 复制配置。端口冲突时，在 `.env` 修改 `PORT`。

## API 怎么接

图片和视频分别配置 URL、API Key、模型名。可以来自同一家服务，也可以来自两家：

```dotenv
CODEX_IMAGE_BASE_URL=https://your-image-provider.example/v1
CODEX_IMAGE_API_KEY=your-image-api-key
CODEX_IMAGE_MODEL=gpt-image-2

GROK_VIDEO_BASE_URL=https://your-video-provider.example/v1
GROK_VIDEO_API_KEY=your-video-api-key
GROK_VIDEO_MODEL=grok-imagine-video-1.5
```

上面是占位值，不可直接调用。URL 填基础地址，通常含 `/v1`，不要填完整的 `/images/edits` 或 `/videos/generations` 地址。本机代理也可用 `http://127.0.0.1:端口/v1`。真实密钥只写入服务端 `.env` 或环境变量，不写进网页。

**并不是任意 API 都能直接接。** 当前生图适配 OpenAI 风格的图片编辑接口；视频适配 Grok 风格的异步生成接口。具体请求和响应见 [API.md](API.md)。接口格式一致时，通常只需改上述配置；格式不一致时，需要修改 `server/public-providers.mjs` 适配器。

不配置视频 API 也可使用图片功能；不配置图片 API 也能上传照片与导入视频。自动整理白底、提取衣服、换装会调用生图接口；非白底穿搭生成旋转时可能先调用一次生图整理。

## 数据保存与使用范围

- 个人衣柜、照片、生成结果和旋转缓存保存在**当前浏览器的 IndexedDB**。不同浏览器或不同网址不自动同步；清除网站数据可能清掉个人素材，请下载保留需要的图片和视频。
- 生成任务及幂等记录保存在服务端 `.local/generation/`；临时图片结果 1 小时后不再返回。该目录不进入 Git。
- 点击 AI 功能时，相关图片会发送到你配置的生成服务；费用、速率限制与数据处理由该服务决定。
- 这份开源版是**本地自用版本**，没有每 IP 5 图/2 视频的公开体验额度，也没有作者公网演示的 Redis、账号或服务凭据。
- 服务只监听本机。若要给公众开放，需要另外实现身份验证、持久化额度、并发控制和云端存储策略。GitHub 托管源码，GitHub Pages 不能运行这里的 Node.js 生成后端。

## 开发与检查

```bash
npm test
npm run check:release
```

测试使用模拟接口，不调用付费生成。`check:release` 检查 Git 中的待发布文件，拒绝私有目录、真实配置文件、本机路径及常见凭据格式。

```text
public/             页面、衣柜流程、视频角度缓存
server/             API 适配、任务记录、服务端配置
server.mjs          仅监听本机的网页与 API 服务
.env.example        不含密钥的配置模板
tests/              模拟 API 与媒体缓存测试
```

项目不附带作者使用的第三方反代，也不提供模型访问权限或免费额度。请使用你有权访问的服务。第三方依赖遵循各自许可证。

## 许可证

[MIT](LICENSE)。可使用、修改、分发和商用，保留许可证及版权声明。关于公开仓库许可证，可参阅 [GitHub 官方说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。
