import { useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh } from '@tarojs/taro'
import { channelImageUrl, fetchChannels } from '../../api/podcast'
import type { Channel } from '../../api/podcast'
import MiniPlayer from '../../components/MiniPlayer'
import './index.scss'

export default function Channels() {
  const [channels, setChannels] = useState<Channel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    try {
      setChannels(await fetchChannels())
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
      Taro.stopPullDownRefresh()
    }
  }

  useLoad(load)
  usePullDownRefresh(load)

  const open = (c: Channel) => {
    const q = `id=${c.id}&name=${encodeURIComponent(c.name)}&author=${encodeURIComponent(c.author || '')}`
    Taro.navigateTo({ url: `/pages/episodes/index?${q}` })
  }

  if (loading) return <View className='empty'>加载中…</View>
  if (error) return <View className='empty'>{error}，下拉重试</View>

  return (
    <View className='channels'>
      {channels.length === 0 && <View className='empty'>暂无频道</View>}
      {channels.map((c) => (
        <View key={c.id} className='card' onClick={() => open(c)}>
          {c.image_url ? <Image className='card__cover' src={channelImageUrl(c.id)} mode='aspectFill' /> : <View className='card__cover' />}
          <View className='card__body'>
            <Text className='card__name'>{c.name}</Text>
            {c.author && <Text className='card__sub'>{c.author}</Text>}
          </View>
        </View>
      ))}
      <View className='channels__spacer' />
      <MiniPlayer />
    </View>
  )
}
