export default defineAppConfig({
  pages: ['pages/channels/index', 'pages/episodes/index', 'pages/player/index'],
  // 后台 / 锁屏继续播放音频必须声明
  requiredBackgroundModes: ['audio'],
  window: {
    backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#0f1115',
    navigationBarTitleText: 'Molten English',
    navigationBarTextStyle: 'white',
    backgroundColor: '#0f1115',
  },
})
