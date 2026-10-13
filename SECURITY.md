# 凭据与数据

- `.env`、`.env.*`（除 `.env.example`）、`.local/`、`node_modules/`、日志、私钥及 QA 素材均由 `.gitignore` 排除。
- 仓库仅提供空白配置模板，不附带任何可调用的 API Key 或作者服务地址。
- 密钥由服务端读取；`/api/image-config` 仅返回配置状态。
- 当前服务只监听本机，并检查 Host/Origin。请勿把它当作已带账号、额度和并发保护的公众服务直接开放。
- 上传 AI 生成的素材会发送给部署者自行配置的服务；个人最终素材保存在自己的浏览器。
- 提交前运行 `npm run check:release` 并检查 `git diff --cached`。扫描不能替代人工审阅。

报告安全问题时，请通过 GitHub 提供的私密安全报告入口联系维护者；请勿在公开 Issue 粘贴有效凭据或个人照片。
