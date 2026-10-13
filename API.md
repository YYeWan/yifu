# 生成服务适配

所有 provider 请求由 Node.js 后端发出，浏览器不接收 API Key。修改配置后重启 `npm start`。

## 图片接口

基础地址：`CODEX_IMAGE_BASE_URL`；密钥：`CODEX_IMAGE_API_KEY`；模型：`CODEX_IMAGE_MODEL`。

后端发送 `POST {base}/images/edits`：

- `Authorization: Bearer ...`
- `multipart/form-data`，由运行时自动设置 boundary。
- 字段：`model`、`prompt`、`n=1`、`response_format=b64_json`。
- 一个或多个重复的 `image` 文件字段（JPEG）。换装包括模特参考和所选单品。

预期响应：

```json
{"data":[{"b64_json":"BASE64_IMAGE_BYTES"}]}
```

目前不接受只有远程图片 URL 的响应；服务若只返回 URL，需要自行修改适配器。结果在后端统一为白底竖图，再压缩为 WebP。最多 16 件单品；单张输入有大小/像素校验，总 JSON 请求上限 4 MB。

## 视频接口

基础地址：`GROK_VIDEO_BASE_URL`；密钥：`GROK_VIDEO_API_KEY`；模型：`GROK_VIDEO_MODEL`。

提交：`POST {base}/videos/generations`，Bearer 认证，JSON 请求：

```json
{
  "model":"grok-imagine-video-1.5",
  "duration":10,
  "resolution":"720p",
  "aspect_ratio":"3:4",
  "image":{"url":"data:image/jpeg;base64,..."},
  "last_frame":{"url":"data:image/jpeg;base64,..."},
  "prompt":"由 public/rotation-prompt.js 读取的雕像旋转提示词"
}
```

首尾参考相同。预期提交响应包含 `request_id`，格式为 `video_...`。

轮询：`GET {base}/videos/{request_id}`。

```json
{"status":"done","video":{"url":"https://your-video-provider.example/v1/media/videos/example.mp4"}}
```

处理中返回非 `done`/`failed` 的状态；失败返回 `status=failed`。媒体 URL 必须与视频基础地址同源，路径符合 `/v1/media/videos/<文件名>`。下载由后端携带密钥转发，支持 HTTP Range。其他供应商的任务编号、状态字段、媒体路径可能不同，需要修改 `createProviders()`。

## 浏览器调用的应用接口

| 接口 | 用途 |
| --- | --- |
| `GET /api/experience` | 本地不限累计次数标志 |
| `GET /api/image-config` | 生图/视频是否已配置，不返回凭据 |
| `POST /api/image-jobs` | 提交换装、服饰提取或白底整理 |
| `GET /api/image-jobs/{UUID}` | 查询图片任务及临时结果 |
| `POST /api/rotation-jobs` | 提交旋转视频 |
| `GET /api/rotation-jobs/{UUID}` | 查询视频任务 |
| `GET /api/rotation-media/{UUID}` | 下载完成的视频 |

同一任务 UUID、同一内容会复用已有记录；同一 UUID 携带不同内容返回 409。不会因不确定的上游提交结果自动新建任务重试。主动“重新生成”使用新的 UUID，原素材在新结果成功保存前保持可用。

## 旋转提示词与缓存

服务端与页面的复制入口共同使用 `public/rotation-prompt.js`。核心设定为无生命、一体成型、没有可动关节的雕像，固定位置和机位，由机械转台原地转一圈。

浏览器为新视频生成粗略与精细角度缓存，最多 144 个角度；拖动时不反复跳转视频。高清角度按需解码，使用有上限的内存缓存；自动播放和保存使用保留的原视频。首次处理需要等待，并受设备性能与浏览器存储配额影响。
