import { useRef, useState } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { useLoad, usePullDownRefresh, useRouter } from '@tarojs/taro'
import { episodeImageUrl, fetchEpisodes } from '../../api/podcast'
import type { Episode } from '../../api/podcast'
import { playEpisode } from '../../services/audioService'
import MiniPlayer from '../../components/MiniPlayer'
import { formatTime } from '../../utils/lyricTranslation'
import './index.scss'

const STATUS: Record<string, string> = { pending: '排队中', processing: '转录中', completed: '有字幕' }

export default function Episodes() {
  const { params } = useRouter()
  const channelId = params.id || ''
  const artist = decodeURIComponent(params.author || '')
  const [episodes, setEpisodes] = useState<Episode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const refreshing = useRef(false)

  const load = async (refresh = false) => {
    setError('')
    try {
      setEpisodes(await fetchEpisodes(channelId, refresh))
    } catch (e: any) {
      setError(e?.message || '加载失败')
    } finally {
      setLoading(false)
      refreshing.current = false
      Taro.stopPullDownRefresh()
    }
  }

  useLoad(() => {
    Taro.setNavigationBarTitle({ title: decodeURIComponent(params.name || '单集') })
    load()
  })
  // 下拉时让服务端重新抓取 RSS
  usePullDownRefresh(() => {
    if (!refreshing.current) {
      refreshing.current = true
      load(true)
    }
  })

  const play = (ep: Episode) => {
    playEpisode(ep, episodes, artist)
    Taro.navigateTo({ url: '/pages/player/index' })
  }

  if (loading) return <View className='empty'>加载中…</View>
  if (error) return <View className='empty'>{error}，下拉重试</View>

  return (
    <View className='episodes'>
      {episodes.length === 0 && <View className='empty'>暂无单集</View>}
      {episodes.map((ep) => {
        const status = ep.srt_content || ep.lrc_content ? '有字幕' : STATUS[ep.transcription_status || '']
        return (
          <View key={ep.guid} className='ep' onClick={() => play(ep)}>
            <Image className='ep__cover' src={episodeImageUrl(ep.guid)} mode='aspectFill' lazyLoad />
            <View className='ep__body'>
              <Text className='ep__title'>{ep.title}</Text>
              <View className='ep__meta'>
                {ep.duration ? <Text>{formatTime(ep.duration)}</Text> : null}
                {status && <Text className='ep__tag'>{status}</Text>}
              </View>
            </View>
          </View>
        )
      })}
      <View className='episodes__spacer' />
      <MiniPlayer />
    </View>
  )
}
