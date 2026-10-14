import { PropsWithChildren } from 'react'
import { useLaunch } from '@tarojs/taro'
import { initAudioService } from './services/audioService'

import './app.scss'

function App({ children }: PropsWithChildren<any>) {
  useLaunch(() => {
    initAudioService()
  })

  return children
}

export default App
