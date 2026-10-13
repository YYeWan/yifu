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

打开 [本地页面](http://127.0.0.1:8767/)。首次运行是空衣柜，可直接上传并保存自己的照片、衣服、导入已有视频；AI 功能需要先填写 `.env`，然后重启服务。

Windows 可用 `copy .env.example .env` 复制配置。端口冲突时，在 `.env` 修改 `PORT`。

## API 怎么接

**先选择接口预设，再分别填写 URL、API Key、模型名。** 图片和视频可以来自不同厂商；在相同接口格式内换模型，通常不需要修改源码。

| 用途 | 预设 | 对应接口 |
| --- | --- | --- |
| 图片 | `openai` | OpenAI 官方 GPT Image 图片编辑 |
| 图片 | `openai-edits` | 常见 OpenAI 风格图片编辑代理，保留旧版本格式 |
| 图片 | `seedream` | 火山方舟 Seedream 4.x/5.x 图生图、多图参考 |
| 视频 | `grok` | xAI 官方或 Grok 风格异步视频代理 |
| 视频 | `seedance` | 火山方舟 Seedance 异步图生视频 |

最小配置示例：

```dotenv
IMAGE_PROVIDER=openai
IMAGE_BASE_URL=https://api.openai.com/v1
IMAGE_API_KEY=your-image-api-key
IMAGE_MODEL=gpt-image-2

VIDEO_PROVIDER=grok
VIDEO_BASE_URL=https://api.x.ai/v1
VIDEO_API_KEY=your-video-api-key
VIDEO_MODEL=grok-imagine-video-1.5
```

密钥是占位值，需替换为自己的。使用代理时替换对应 URL；基础 URL 通常包括 `/v1`，方舟为 `/api/v3`，不要填写完整任务地址或图片 CDN 地址。本机代理也可用 `http://127.0.0.1:端口/v1`。配置后重启服务。

方舟使用者可直接复制预设模板：

```bash
cp config-examples/seedream-seedance.env.example .env
```

再填写两个 API Key 和在自己账号中开通的模型/推理接入点 ID。也可自由组合 Seedream 图片与 Grok 视频等预设。旧的 `CODEX_IMAGE_*` / `GROK_VIDEO_*` 环境变量继续兼容，新的 `IMAGE_*` / `VIDEO_*` 优先。

**预设适配接口格式，不保证任意模型具备相同能力。** 换装需要参考图编辑、多件搭配需要多图参考；视频需要图生视频，首尾帧模式还需要模型支持尾帧。不支持尾帧时可设 `VIDEO_LAST_FRAME=false`，首尾一致性则依赖模型生成。纯文生图、即梦网页端、其他第三方自定义协议不能只改模型名就接入。

图片结果支持 Base64 或可信 CDN URL；视频提交、状态查询、结果下载由预设统一处理。额外 CDN 域名可用 `MEDIA_ALLOWED_HOSTS` 配置，跨域下载不会携带 API Key。图片参考数量和尺寸可选配，超过参考图上限会明确报错，不会静默丢弃单品。完整字段与兼容边界见 [API.md](API.md)。

不配置视频 API 也可使用图片功能；不配置图片 API 也能上传照片与导入视频。自动整理白底、提取衣服、换装会调用生图接口；非白底穿搭生成旋转时可能先调用一次生图整理。

预设依据 [OpenAI 图片编辑文档](https://developers.openai.com/api/reference/resources/images/methods/edit)、[xAI 视频文档](https://docs.x.ai/developers/model-capabilities/video/generation)及[火山方舟官方 SDK](https://github.com/volcengine/ark-runtime-python)实现。预设均有模拟协议测试；本次新增的厂商接入未调用收费真实生成。

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
