import { View, Text, Image } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { usePlayerStore } from '../../store/playerStore'
import { togglePlay } from '../../services/audioService'
import './index.scss'

/** 列表页底部的迷你播放条，点击进入播放页 */
export default function MiniPlayer() {
  const track = usePlayerStore((s) => s.track)
  const paused = usePlayerStore((s) => s.paused)
  if (!track) return null

  return (
    <View className='mini' onClick={() => Taro.navigateTo({ url: '/pages/player/index' })}>
      {track.cover ? <Image className='mini__cover' src={track.cover} mode='aspectFill' /> : <View className='mini__cover' />}
      <Text className='mini__title'>{track.title}</Text>
      <View
        className='mini__btn'
        onClick={(e) => {
          e.stopPropagation()
          togglePlay()
        }}
      >
        <Text>{paused ? '▶' : '❚❚'}</Text>
      </View>
    </View>
  )
}
