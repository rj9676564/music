import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, Image, ScrollView, Slider } from '@tarojs/components'
import { SPEED_PRESETS } from '../../config'
import { usePlayerStore } from '../../store/playerStore'
import { playNext, playPrev, seekBy, seekTo, setRate, togglePlay } from '../../services/audioService'
import { findLineIndex, formatTime } from '../../utils/lyricTranslation'
import './index.scss'

interface RowProps {
  index: number
  text: string
  translation?: string
  active: boolean
  showTranslation: boolean
  onTap: (index: number) => void
}

// 播放时间 4Hz 刷新，歌词行用 memo 避免整表重绘
const LyricRow = memo(function LyricRow({ index, text, translation, active, showTranslation, onTap }: RowProps) {
  return (
    <View id={`l-${index}`} className={`lyric ${active ? 'lyric--active' : ''}`} onClick={() => onTap(index)}>
      <Text className='lyric__text'>{text}</Text>
      {showTranslation && translation && <Text className='lyric__tr'>{translation}</Text>}
    </View>
  )
})

export default function Player() {
  const track = usePlayerStore((s) => s.track)
  const currentTime = usePlayerStore((s) => s.currentTime)
  const duration = usePlayerStore((s) => s.duration)
  const paused = usePlayerStore((s) => s.paused)
  const buffering = usePlayerStore((s) => s.buffering)
  const rate = usePlayerStore((s) => s.rate)
  const error = usePlayerStore((s) => s.error)

  const [showTranslation, setShowTranslation] = useState(true)
  const [showSummary, setShowSummary] = useState(false)
  const [dragging, setDragging] = useState<number | null>(null)
  const lastTouch = useRef(0)

  const lyrics = track?.lyrics ?? []
  const hasTranslation = useMemo(() => lyrics.some((l) => l.translation), [lyrics])
  const activeIndex = findLineIndex(lyrics, currentTime)

  // 用户手动滚动后 3 秒内不抢夺滚动位置
  const [scrollTarget, setScrollTarget] = useState('')
  useEffect(() => {
    if (activeIndex < 0 || Date.now() - lastTouch.current < 3000) return
    setScrollTarget(`l-${Math.max(0, activeIndex - 2)}`)
  }, [activeIndex])

  const onTapLine = useRef((index: number) => {
    const line = usePlayerStore.getState().track?.lyrics[index]
    if (line) seekTo(line.time)
  }).current

  const cycleRate = () => {
    const i = SPEED_PRESETS.indexOf(rate)
    setRate(SPEED_PRESETS[(i + 1) % SPEED_PRESETS.length])
  }

  if (!track) return <View className='empty'>请先在列表中选择一集</View>

  const shown = dragging ?? currentTime

  return (
    <View className='player'>
      <View className='head'>
        {track.cover ? <Image className='head__cover' src={track.cover} mode='aspectFill' /> : <View className='head__cover' />}
        <View className='head__info'>
          <Text className='head__title'>{track.title}</Text>
          <Text className='head__artist'>{track.artist}</Text>
        </View>
      </View>

      <View className='tools'>
        {track.summary && (
          <Text className={`chip ${showSummary ? 'chip--on' : ''}`} onClick={() => setShowSummary((v) => !v)}>
            摘要
          </Text>
        )}
        {hasTranslation && (
          <Text className={`chip ${showTranslation ? 'chip--on' : ''}`} onClick={() => setShowTranslation((v) => !v)}>
            译文
          </Text>
        )}
      </View>

      {showSummary && track.summary && (
        <ScrollView scrollY className='summary'>
          <Text>{track.summary}</Text>
        </ScrollView>
      )}

      {lyrics.length > 0 ? (
        <ScrollView
          scrollY
          className='lyrics'
          scrollIntoView={scrollTarget}
          scrollWithAnimation
          onTouchStart={() => {
            lastTouch.current = Date.now()
          }}
        >
          {lyrics.map((l, i) => (
            <LyricRow
              key={i}
              index={i}
              text={l.text}
              translation={l.translation}
              active={i === activeIndex}
              showTranslation={showTranslation}
              onTap={onTapLine}
            />
          ))}
          <View className='lyrics__pad' />
        </ScrollView>
      ) : (
        <View className='nolyric'>这一集暂时没有字幕</View>
      )}

      <View className='panel'>
        {error && <Text className='panel__error'>{error}</Text>}
        <Slider
          className='panel__slider'
          min={0}
          max={Math.max(1, Math.floor(duration))}
          value={Math.floor(shown)}
          step={1}
          activeColor='#7cc4ff'
          backgroundColor='#2f3547'
          blockSize={16}
          onChanging={(e) => setDragging(e.detail.value)}
          onChange={(e) => {
            seekTo(e.detail.value)
            setDragging(null)
          }}
        />
        <View className='panel__time'>
          <Text>{formatTime(shown)}</Text>
          <Text>{formatTime(duration)}</Text>
        </View>
        <View className='ctrl'>
          <Text className='ctrl__rate' onClick={cycleRate}>
            {rate}x
          </Text>
          <Text className='ctrl__btn' onClick={playPrev}>
            ⏮
          </Text>
          <Text className='ctrl__btn' onClick={() => seekBy(-10)}>
            ↺10
          </Text>
          <Text className='ctrl__play' onClick={togglePlay}>
            {buffering ? '…' : paused ? '▶' : '❚❚'}
          </Text>
          <Text className='ctrl__btn' onClick={() => seekBy(10)}>
            10↻
          </Text>
          <Text className='ctrl__btn' onClick={playNext}>
            ⏭
          </Text>
        </View>
      </View>
    </View>
  )
}
