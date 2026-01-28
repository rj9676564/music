export interface LyricLine {
  time: number
  endTime?: number
  text: string
}

// 解析 SRT 时间格式 (支持逗号和点分隔的毫秒)
function parseSrtTime(timeStr: string): number {
  // 支持格式: HH:MM:SS,mmm 或 HH:MM:SS.mmm
  const match = timeStr.match(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/)
  if (!match) return 0
  
  const hours = parseInt(match[1], 10)
  const minutes = parseInt(match[2], 10)
  const seconds = parseInt(match[3], 10)
  const milliseconds = parseInt(match[4], 10)
  
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000
}

export function parseSrt(srtContent: string): LyricLine[] {
  const result: LyricLine[] = []
  
  // 移除 BOM 和清理内容
  let content = srtContent.trim()
  if (content.charCodeAt(0) === 0xFEFF) {
    content = content.slice(1)
  }
  
  // 标准化换行符
  content = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  
  // 按空行分割块（支持多个连续空行）
  const blocks = content.split(/\n\s*\n/).filter(block => block.trim())

  blocks.forEach((block) => {
    const lines = block.split('\n').map(line => line.trim()).filter(line => line)
    if (lines.length < 2) return

    // 查找时间行（可能在第1行或第2行，跳过序号行）
    let timeLineIndex = -1
    let timeLine = ''
    
    for (let i = 0; i < lines.length; i++) {
      // 匹配时间格式: HH:MM:SS,mmm --> HH:MM:SS,mmm 或 HH:MM:SS.mmm --> HH:MM:SS.mmm
      if (/\d{1,2}:\d{2}:\d{2}[,.]\d{3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{3}/.test(lines[i])) {
        timeLineIndex = i
        timeLine = lines[i]
        break
      }
    }
    
    if (timeLineIndex === -1) return

    // 解析时间范围
    const timeMatch = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[,.]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[,.]\d{3})/)
    if (!timeMatch) return

    const startTime = parseSrtTime(timeMatch[1])
    const endTime = parseSrtTime(timeMatch[2])

    // 提取文本（时间行之后的所有行）
    const textLines = lines.slice(timeLineIndex + 1)
    if (textLines.length === 0) return

    // 合并文本行，移除 HTML 标签，保留换行
    const text = textLines
      .join('\n')
      .replace(/<[^>]*>/g, '') // 移除 HTML 标签
      .replace(/&nbsp;/g, ' ') // 替换 HTML 实体
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim()

    if (text) {
      result.push({ time: startTime, endTime, text })
    }
  })

  // 按时间排序并去重
  const sorted = result.sort((a, b) => a.time - b.time)
  
  // 移除重复的时间点（保留第一个）
  const unique: LyricLine[] = []
  const seen = new Set<number>()
  for (const item of sorted) {
    const key = Math.floor(item.time * 100) / 100 // 精确到 0.01 秒
    if (!seen.has(key)) {
      seen.add(key)
      unique.push(item)
    }
  }

  return unique
}

export function parseLrc(lrcContent: string): LyricLine[] {
  const lines = lrcContent.split('\n')
  const result: LyricLine[] = []
  const timeExp = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g

  lines.forEach(line => {
    const text = line.replace(timeExp, '').trim()
    if (!text) return

    let match
    timeExp.lastIndex = 0
    while ((match = timeExp.exec(line)) !== null) {
      const min = parseInt(match[1])
      const sec = parseInt(match[2])
      const ms = parseInt(match[3])
      const time = min * 60 + sec + ms / (match[3].length === 3 ? 1000 : 100)
      result.push({ time, text })
    }
  })

  return result.sort((a, b) => a.time - b.time)
}
