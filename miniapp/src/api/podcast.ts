import Taro from '@tarojs/taro'
import { API_BASE } from '../config'

export interface Channel {
  id: string
  name: string
  author?: string
  description?: string
  image_url?: string
}

export interface Episode {
  id: string
  guid: string
  channel_id: string
  title: string
  pub_date?: string
  duration?: number
  image_url?: string
  audio_url?: string
  /** 服务端已缓存的本地音频文件路径，存在时优先走自家 /media，国内更快 */
  local_audio_path?: string
  srt_content?: string
  lrc_content?: string
  translation?: string
  lrc_translation?: string
  summary?: string
  transcription_status?: string
}

async function get<T>(path: string, data?: Record<string, unknown>): Promise<T> {
  const res = await Taro.request<T>({ url: `${API_BASE}${path}`, method: 'GET', data, timeout: 15000 })
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`请求失败 (${res.statusCode})`)
  }
  return res.data
}

export const fetchChannels = () => get<Channel[]>('/api/channels')

export async function fetchEpisodes(channelId: string, refresh = false): Promise<Episode[]> {
  const data = await get<{ episodes: Episode[] }>(`/api/channels/${channelId}/episodes`, refresh ? { refresh: true } : undefined)
  return data.episodes || []
}

/**
 * 小程序只能访问合法域名，第三方音频 / 封面都经后端代理，地址由服务端按 guid / 频道 id 查库，
 * 客户端不传原始 URL。后端优先使用本地缓存，没有再回源转发（并透传 Range，拖动进度条依赖它）。
 */
export function resolveAudioUrl(ep: Episode): string {
  if (!ep.guid || !(ep.audio_url || ep.local_audio_path)) return ''
  return `${API_BASE}/api/audio?guid=${encodeURIComponent(ep.guid)}`
}

/** 单集封面；单集没有封面时服务端会退回频道封面 */
export const episodeImageUrl = (guid: string) => `${API_BASE}/api/image?guid=${encodeURIComponent(guid)}`

export const channelImageUrl = (id: string) => `${API_BASE}/api/image?channel=${encodeURIComponent(id)}`
