# Molten English 小程序（Taro + React）

复用 `../backend` 的接口，目前只实现「听」模块：频道 → 单集 → 播放页（后台播放、倍速、逐句歌词、译文、摘要、进度记忆、连播）。

## 开发

```bash
yarn install
yarn dev:weapp        # 产物在 dist/，用微信开发者工具打开本目录
```

- `project.config.json` 的 `appid` 目前是 `touristappid`，换成真实 AppID。
- 接口域名在 `src/config.ts`；上线前必须换成已备案域名，并加入小程序后台的 request / downloadFile 合法域名。
- 开发阶段可在开发者工具里勾选「不校验合法域名」。

## 结构

- `src/services/audioService.ts`：BackgroundAudioManager 的唯一封装，UI 只依赖它和 `store/playerStore.ts`
- `src/api/podcast.ts`：后端接口
- `src/utils/`：LRC/SRT 解析与译文合并（拷自桌面端，之后各自演进）

## 真机待验证

这些行为取决于微信与系统，开发者工具里无法验证：

1. 退后台 / 锁屏后能否继续播放，锁屏面板的标题与封面
2. `playbackRate` 在 iOS / 安卓各机型上是否生效、是否变调
3. 息屏后 `onTimeUpdate` 是否还在回调；连播（`onEnded`）是否稳定触发
4. 锁屏 / 耳机的上一首、下一首
