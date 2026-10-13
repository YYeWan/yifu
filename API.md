# 生成服务适配

在 `.env` 中分别选择图片/视频预设，填写对应基础 URL、API Key、模型名后重启。所有带凭据的请求都由 Node.js 后端发出。

## 通用配置

| 配置 | 含义 |
| --- | --- |
| `IMAGE_PROVIDER` | `openai`（模板默认）、`openai-edits`、`seedream` |
| `IMAGE_BASE_URL` / `IMAGE_API_KEY` / `IMAGE_MODEL` | 图片基础地址、密钥、模型或接入点 ID |
| `VIDEO_PROVIDER` | `grok`（默认）、`seedance` |
| `VIDEO_BASE_URL` / `VIDEO_API_KEY` / `VIDEO_MODEL` | 视频基础地址、密钥、模型或接入点 ID |
| `IMAGE_SIZE` | 可选，按所选模型格式填写；Seedream 默认 `2K` |
| `IMAGE_MAX_INPUTS` | 可选，参考图总数（含人物），1–17；默认 OpenAI 为 16、旧代理 17、Seedream 10；不得超过模型上限 |
| `VIDEO_LAST_FRAME` | 默认发送相同首尾参考；不支持尾帧的模型设 `false` |
| `MEDIA_ALLOWED_HOSTS` | 额外可信 CDN 域名，逗号分隔，可用 `*.your-cdn.example` |

省略图片预设时沿用旧版 `openai-edits`；新模板显式选择 `openai`。旧 `CODEX_IMAGE_BASE_URL`、`CODEX_IMAGE_API_KEY`、`CODEX_IMAGE_MODEL` 和 `GROK_VIDEO_*` 作为后备，新字段优先。Seedream/Seedance 不设默认模型 ID，须填写自己账号可调用的 ID。类型拼写错误会报错，不会偷偷切到其他接口。

## 图片预设

### `openai`：OpenAI 官方图片编辑

`POST {base}/images/edits`，Bearer 认证、multipart 文件。发送 `model`、`prompt`、`n=1` 及重复的 `image[]` 字段。GPT Image 默认返回 Base64，不发送旧式 `response_format`。可选 `size` 来自 `IMAGE_SIZE`。

### `openai-edits`：现有兼容代理

同一路径、Bearer 认证；发送重复 `image` 文件字段和 `response_format=b64_json`，保留旧版接入协议。只支持聊天补全的所谓“OpenAI 兼容”服务不属于图片编辑兼容服务。

### `seedream`：火山方舟 JSON 图生图

`POST {base}/images/generations`，基础 URL 通常是 `https://ark.cn-beijing.volces.com/api/v3`。发送 JSON：

```json
{
  "model":"your-enabled-seedream-model-id",
  "prompt":"应用生成的换装/提取/白底整理提示词",
  "image":["data:image/jpeg;base64,...","data:image/jpeg;base64,..."],
  "size":"2K",
  "response_format":"b64_json",
  "stream":false,
  "watermark":false
}
```

仅有一张参考时 `image` 为字符串，多张时为数组。只请求单张输出，不启用组图。适配 Seedream 4.x/5.x 的图像编辑接口；不同模型图片数量上限不同，默认以 10 张参考图为保守上限，配置不能代替模型能力。

### 结果统一

三种预设均读取 `data[0].b64_json`，或下载 `data[0].url`。Base64/图片下载大小有限制；结果后端归一化为白底竖版 WebP。输入像素和 4 MB 总 JSON 限制仍保留。

## 视频预设

预设把提交结果统一为 `{request_id}`，查询结果统一为 `pending` / `done` + `video.url` / `failed`。不限定上游编号必须以 `video_` 开头，支持官方 UUID 和方舟任务 ID。

### `grok`：xAI 官方 / Grok 风格代理

- 提交：`POST {base}/videos/generations`。
- 查询：`GET {base}/videos/{request_id}`。
- JSON 字段：`model`、`duration=10`、`resolution=720p`、`aspect_ratio=3:4`、`image.url`、`last_frame.url`、`prompt`。
- `expired` / `cancelled` 与 `failed` 一样作为失败终态。
- 官方视频 CDN `vidgen.x.ai` 可直接下载，不向 CDN 转发 Key；原代理同源 `/v1/media/videos/<文件名>` 仍带 Bearer 下载。

### `seedance`：火山方舟图生视频

- 提交：`POST {base}/contents/generations/tasks`，读取 `id`。
- 查询：`GET {base}/contents/generations/tasks/{id}`。
- 请求如下；`VIDEO_LAST_FRAME=false` 时不发送尾帧。

```json
{
  "model":"your-enabled-seedance-model-id",
  "content":[
    {"type":"text","text":"共享的雕像旋转提示词"},
    {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."},"role":"first_frame"},
    {"type":"image_url","image_url":{"url":"data:image/jpeg;base64,..."},"role":"last_frame"}
  ],
  "duration":10,
  "resolution":"720p",
  "ratio":"3:4",
  "watermark":false
}
```

`queued` / `running` 为处理中，`succeeded` 读取 `content.video_url`，`failed` / `cancelled` / `expired` 为失败。选择支持这些图生视频参数的模型；预设不保证所有 Seedance 版本支持尾帧或同样的分辨率。

## CDN 与已有任务

API URL 是提交生成任务的基础地址，不是 CDN 下载地址。同源媒体按适配器规则认证；跨源只允许 HTTPS、已知官方 CDN 或 `MEDIA_ALLOWED_HOSTS` 中的域名，不发送 API Key、不自动跟随重定向。签名下载链接保持完整。额外区域/代理 CDN 需显式补充可信域名。

任务记录绑定当时的视频预设、URL、模型与尾帧模式；配置变化后，旧任务查询/下载会提示恢复原配置，避免把旧任务交给另一家服务。已经保存到浏览器的原视频不受影响。状态未知时不自动重复生成。

## 官方参考与验证范围

- [OpenAI 图片编辑](https://developers.openai.com/api/reference/resources/images/methods/edit)
- [Seedream 图片生成 API](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh)
- [Seedance 视频生成指南](https://docs.volcengine.com/docs/ark/video-generation-tutorial?lang=zh)
- [火山方舟官方 SDK](https://github.com/volcengine/ark-runtime-python)
- [xAI 视频生成](https://docs.x.ai/developers/model-capabilities/video/generation)

新增适配采用模拟请求/响应验证，未调用真实收费生成。不承诺任意第三方“同名模型”与这些官方协议一致。

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
