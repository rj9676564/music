export interface LyricLine {
  time: number
  endTime?: number
  text: string
}

export function parseSrt(srtContent: string): LyricLine[] {
  const result: LyricLine[] = []
  // Standard SRT parts: index, time range, text
  const blocks = srtContent.trim().split(/\n\s*\n/)

  blocks.forEach(block => {
    const lines = block.split('\n')
    if (lines.length < 3) return

    const timeMatch = lines[1].match(/(\d{2}):(\d{2}):(\d{2}),(\d{3}) --> (\d{2}):(\d{2}):(\d{2}),(\d{3})/)
    if (timeMatch) {
      const startTime = 
        parseInt(timeMatch[1]) * 3600 + 
        parseInt(timeMatch[2]) * 60 + 
        parseInt(timeMatch[3]) + 
        parseInt(timeMatch[4]) / 1000

      const endTime = 
        parseInt(timeMatch[5]) * 3600 + 
        parseInt(timeMatch[6]) * 60 + 
        parseInt(timeMatch[7]) + 
        parseInt(timeMatch[8]) / 1000

      const text = lines.slice(2).join('\n').replace(/<[^>]*>/g, '').trim()
      if (text) {
        result.push({ time: startTime, endTime, text })
      }
    }
  })

  return result.sort((a, b) => a.time - b.time)
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
