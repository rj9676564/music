import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import axios from "axios";
import { parseLrc, parseSrt } from "./utils/lrcParser";
import { useSettingsStore } from "./store/settingsStore";
import { usePlayerStore } from "./store/playerStore";
import "./App.css";

// Components
import { PlayerPanel } from "./components/Player/PlayerPanel";
import { ChannelsPanel } from "./components/RSS/ChannelsPanel";
import { EpisodesPanel } from "./components/RSS/EpisodesPanel";
import { SettingsDialog } from "./components/SettingsDialog";
import {
  SubtitlesIcon,
  LockIcon,
  UnlockIcon,
  SettingsIcon,
  RadioIcon,
} from "./components/Icons";

function App() {
  const settings = useSettingsStore();

  const isPlaying = usePlayerStore((state) => state.isPlaying);
  const currentTime = usePlayerStore((state) => state.currentTime);
  const duration = usePlayerStore((state) => state.duration);
  const audioPath = usePlayerStore((state) => state.audioPath);
  const lyrics = usePlayerStore((state) => state.lyrics);
  const activeIndex = usePlayerStore((state) => state.activeIndex);
  const musicInfo = usePlayerStore((state) => state.musicInfo);
  const isTranscribing = usePlayerStore((state) => state.isTranscribing);

  const setPlaying = usePlayerStore((state) => state.setPlaying);
  const setCurrentTime = usePlayerStore((state) => state.setCurrentTime);
  const setActiveIndex = usePlayerStore((state) => state.setActiveIndex);
  const setAudio = usePlayerStore((state) => state.setAudio);
  const setLyrics = usePlayerStore((state) => state.setLyrics);
  const setDuration = usePlayerStore((state) => state.setDuration);
  const setTranscribing = usePlayerStore((state) => state.setTranscribing);
  const [isSummarizing, setSummarizing] = useState(false);

  type ViewMode = "player" | "channels" | "episodes";
  const [viewMode, setViewMode] = useState<ViewMode>("player");
  const [isLyricLocked, setIsLyricLocked] = useState(true); // 默认锁定（点击穿透）
  const [showSettings, setShowSettings] = useState(false);
  const [podcastEpisodes, setPodcastEpisodes] = useState<any[]>([]);
  const [currentChannel, setCurrentChannel] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [loadingPodcast, setLoadingPodcast] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  // Trigger window resize based on view mode (Columns)
  useEffect(() => {
    if (window.ipcRenderer) {
      if (viewMode === "player") {
        window.ipcRenderer.send("set-window-size", 530);
      } else if (viewMode === "channels") {
        // Player (530) + Channels (330) + 20px gap
        window.ipcRenderer.send("set-window-size", 530 + 330 + 20); // 880
      } else if (viewMode === "episodes") {
        // Player (530) + Channels (330) + Episodes (330) + 2*20px gap
        window.ipcRenderer.send("set-window-size", 530 + 330 + 330 + 40); // 1230
      }
    }
  }, [viewMode]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const lyricListRef = useRef<HTMLDivElement>(null);
  const lastIpcUpdateRef = useRef({ index: -1, progress: -1 });
  const fetchControllerRef = useRef<AbortController | null>(null);

  const scrollToActive = useCallback(
    (immediate = false) => {
      const list = lyricListRef.current;
      if (!list || activeIndex === -1) return;
      const activeEl = list.children[activeIndex] as HTMLElement;
      if (!activeEl) return;
      const targetTop =
        activeEl.offsetTop - list.offsetHeight / 2 + activeEl.offsetHeight / 2;
      list.scrollTo({
        top: targetTop,
        behavior: immediate ? "auto" : "smooth",
      });
    },
    [activeIndex],
  );

  const handleOpenMusic = useCallback(async () => {
    if (!window.ipcRenderer) return;
    const file = await window.ipcRenderer.invoke("open-file", [
      { name: "Music", extensions: ["mp3", "wav", "m4a", "aac"] },
    ]);
    if (file) {
      const name =
        file.path
          .split("/")
          .pop()
          ?.replace(/\.[^/.]+$/, "") || "未知歌曲";
      setLyrics([]); // Clear lyrics immediately
      setAudio(file.url, { name, artist: "本地音源" });
      const match = await window.ipcRenderer.invoke(
        "find-matching-lyric",
        file.path,
      );
      setLyrics(
        match
          ? match.path.toLowerCase().endsWith(".srt")
            ? parseSrt(match.content)
            : parseLrc(match.content)
          : [],
      );
      const lastPos = localStorage.getItem(`pos-${file.url}`);
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.load();
          if (lastPos) {
            audioRef.current.currentTime = parseFloat(lastPos);
            setCurrentTime(parseFloat(lastPos));
          }
        }
      }, 0);
    }
  }, [setAudio, setLyrics, setCurrentTime]);

  const handleOpenLyric = useCallback(async () => {
    if (!window.ipcRenderer) return;
    const file = await window.ipcRenderer.invoke("open-file", [
      { name: "Lyrics", extensions: ["lrc", "srt"] },
    ]);
    if (file) {
      const content = await window.ipcRenderer.invoke(
        "read-file-content",
        file.path,
      );
      if (content) {
        setLyrics(
          file.path.toLowerCase().endsWith(".srt")
            ? parseSrt(content)
            : parseLrc(content),
        );
        if (audioPath) {
          localStorage.setItem(`lyric-${audioPath}`, file.path);
        }
      }
    }
  }, [audioPath, setLyrics]);

  const togglePlay = useCallback(() => {
    if (!audioPath) {
      handleOpenMusic();
      return;
    }
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setPlaying(false);
        localStorage.setItem(
          `pos-${audioPath}`,
          audioRef.current.currentTime.toString(),
        );
      } else {
        audioRef.current
          .play()
          .then(() => setPlaying(true))
          .catch((e) => {
            console.error("Audio playback error:", e);
            console.error("Audio src:", audioRef.current?.src);
            console.error("Audio path:", audioPath);
          });
      }
    }
  }, [isPlaying, audioPath, handleOpenMusic, setPlaying]);

  // Audio loading state management
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadStart = () => {
      console.log("📥 Loading audio...");
      setIsLoadingAudio(true);
    };

    const handleLoadedMetadata = () => {
      console.log("📊 Metadata loaded, duration:", audio.duration);
      setDuration(audio.duration);
    };

    const handleCanPlay = () => {
      console.log("✅ Audio ready to play");
      setIsLoadingAudio(false);
    };

    const handleWaiting = () => {
      console.log("⏳ Buffering...");
      setIsLoadingAudio(true);
    };

    const handlePlaying = () => {
      console.log("▶️ Audio is playing");
      setIsLoadingAudio(false);
    };

    const handleStalled = () => {
      console.log("⚠️ Network stalled");
      // Don't change loading state, might recover
    };

    const handleError = (e: Event) => {
      console.error("❌ Audio error:", e);
      setIsLoadingAudio(false);
      setPlaying(false);
    };

    // Sync play/pause state with actual audio events
    const handlePlay = () => {
      console.log("🎵 Audio play event fired");
      setPlaying(true);
    };

    const handlePause = () => {
      console.log("⏸️ Audio pause event fired");
      setPlaying(false);
    };

    const handleEnded = () => {
      console.log("🏁 Audio ended");
      setPlaying(false);
      // Handle loop if enabled
      if (settings.loop && audio) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.error("Loop play failed:", e));
      }
    };

    // Add all event listeners
    audio.addEventListener("loadstart", handleLoadStart);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("playing", handlePlaying);
    audio.addEventListener("stalled", handleStalled);
    audio.addEventListener("error", handleError);
    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    return () => {
      audio.removeEventListener("loadstart", handleLoadStart);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("playing", handlePlaying);
      audio.removeEventListener("stalled", handleStalled);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioPath, setPlaying, setDuration, settings.loop]);

  // Main Sync Engine
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let intervalID: NodeJS.Timeout;
    const sync = () => {
      const rawTime = audio.currentTime;
      const time = rawTime + settings.lyricOffset; // Apply offset
      if (Math.abs(rawTime - usePlayerStore.getState().currentTime) > 0.05)
        setCurrentTime(rawTime);
      const currentLyrics = usePlayerStore.getState().lyrics;
      const index = currentLyrics.findLastIndex((l) => time >= l.time);
      if (index !== -1 && index !== usePlayerStore.getState().activeIndex) {
        setActiveIndex(index);
        setTimeout(() => scrollToActive(), 0);
      }
      if (index !== -1 && settings.showDesktopLyric) {
        const l = currentLyrics[index];
        const dur =
          l.endTime !== undefined
            ? l.endTime - l.time
            : index < currentLyrics.length - 1
              ? currentLyrics[index + 1].time - l.time
              : 2;
        const progress = Math.min(
          1.0,
          Math.max(0, (time - l.time) / (dur || 1)),
        );
        if (
          index !== lastIpcUpdateRef.current.index ||
          Math.abs(progress - lastIpcUpdateRef.current.progress) > 0.01
        ) {
          window.ipcRenderer?.send("update-lyric", {
            text: currentLyrics[index].text,
            progress,
          });
          lastIpcUpdateRef.current = { index, progress };
        }
      }
    };
    if (isPlaying) intervalID = setInterval(sync, 16);
    return () => clearInterval(intervalID);
  }, [
    isPlaying,
    settings.showDesktopLyric,
    scrollToActive,
    setCurrentTime,
    setActiveIndex,
  ]);

  // Keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      )
        return;
      if (e.key === " ") {
        e.preventDefault();
        togglePlay();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (audioRef.current) audioRef.current.currentTime += 5;
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (audioRef.current) audioRef.current.currentTime -= 5;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  // Settings Sync (IPC)
  useEffect(() => {
    const { updateSettings, ...data } = settings;
    window.ipcRenderer?.send("update-settings", data);
    window.ipcRenderer?.send("toggle-lyric-window", data.showDesktopLyric);
  }, [settings]);

  // Handle Audio Output Device Change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const applySinkId = async () => {
      try {
        // @ts-ignore - setSinkId might not be in the standard type definition yet
        if (typeof audio.setSinkId === "function") {
          const deviceId =
            settings.audioDeviceId === "default" ? "" : settings.audioDeviceId;

          // Only apply if it's different from the current sinkId
          // @ts-ignore
          if (audio.sinkId !== deviceId) {
            console.log(
              "🔌 Switching audio output device to:",
              deviceId || "default",
            );
            // @ts-ignore
            await audio.setSinkId(deviceId);
          }
        } else {
          console.warn(
            "⚠️ Your browser does not support setSinkId() to switch audio output devices.",
          );
        }
      } catch (err) {
        console.error("❌ Failed to set audio output device:", err);
      }
    };

    applySinkId();
  }, [settings.audioDeviceId, audioPath]); // Re-apply when device ID or audio source changes

  // Handle Playback Rate Change
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const rate = usePlayerStore.getState().playbackRate;
    if (audio.playbackRate !== rate) {
      console.log("⏩ Setting playback rate to:", rate);
      audio.playbackRate = rate;
    }
  }, [usePlayerStore((state) => state.playbackRate), audioPath]);

  // 初始化歌词窗口的点击穿透状态
  useEffect(() => {
    if (settings.showDesktopLyric && window.ipcRenderer) {
      // 默认锁定状态（点击穿透）
      window.ipcRenderer.invoke(
        "set-lyric-ignore-mouse-events",
        isLyricLocked,
        {
          forward: true,
        },
      );
    }
  }, [settings.showDesktopLyric, isLyricLocked]);

  // Restore
  useEffect(() => {
    const restore = async () => {
      const saved = localStorage.getItem("last-played-music");
      if (saved && window.ipcRenderer) {
        const { path, name, artist } = JSON.parse(saved);
        if (await window.ipcRenderer.invoke("check-file-exists", path)) {
          const full = `local-file://media${path}`;
          setAudio(full, { name, artist });
          const savedLyric = localStorage.getItem(`lyric-${full}`);
          if (
            savedLyric &&
            (await window.ipcRenderer.invoke("check-file-exists", savedLyric))
          ) {
            const content = await window.ipcRenderer.invoke(
              "read-file-content",
              savedLyric,
            );
            if (content)
              setLyrics(
                savedLyric.toLowerCase().endsWith(".srt")
                  ? parseSrt(content)
                  : parseLrc(content),
              );
          } else {
            const match = await window.ipcRenderer.invoke(
              "find-matching-lyric",
              path,
            );
            if (match)
              setLyrics(
                match.path.toLowerCase().endsWith(".srt")
                  ? parseSrt(match.content)
                  : parseLrc(match.content),
              );
          }
          const lp = localStorage.getItem(`pos-${full}`);
          if (lp && audioRef.current) {
            audioRef.current.currentTime = parseFloat(lp);
            setCurrentTime(parseFloat(lp));
          }
          setTimeout(() => audioRef.current?.load(), 0);
        }
      }
    };
    restore();
  }, [setAudio, setLyrics, setCurrentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const upd = () => setDuration(audio.duration);
    audio.addEventListener("loadedmetadata", upd);
    return () => audio.removeEventListener("loadedmetadata", upd);
  }, [audioPath, setDuration]);

  // 循环播放逻辑
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleEnded = () => {
      if (settings.loop) {
        audio.currentTime = 0;
        audio.play().catch((e) => console.error("Loop play error:", e));
      }
    };

    audio.addEventListener("ended", handleEnded);
    return () => audio.removeEventListener("ended", handleEnded);
  }, [audioPath, settings.loop]);

  // 监听音频设备变化（如蓝牙断开）
  useEffect(() => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return;
    }

    let lastDeviceCount = 0;
    let deviceCheckTimeout: NodeJS.Timeout | null = null;

    // 检查设备是否可用
    const checkDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioOutputs = devices.filter(
          (device) => device.kind === "audiooutput",
        );
        const currentDeviceCount = audioOutputs.length;

        // 如果设备数量减少，可能是设备断开
        if (lastDeviceCount > 0 && currentDeviceCount < lastDeviceCount) {
          console.log("Audio device disconnected, pausing playback");
          if (audioRef.current && isPlaying) {
            audioRef.current.pause();
            setPlaying(false);
          }
        }

        lastDeviceCount = currentDeviceCount;
      } catch (e) {
        console.error("Error checking audio devices:", e);
      }
    };

    // 初始化设备列表
    checkDevices();

    // 监听设备变化事件
    const handleDeviceChange = () => {
      // 延迟检查，避免频繁触发
      if (deviceCheckTimeout) {
        clearTimeout(deviceCheckTimeout);
      }
      deviceCheckTimeout = setTimeout(checkDevices, 500);
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    // 监听音频播放错误（设备断开可能导致播放失败）
    const audio = audioRef.current;
    const handleAudioError = () => {
      console.log("Audio playback error, may be due to device disconnection");
      if (isPlaying) {
        setPlaying(false);
      }
    };

    if (audio) {
      audio.addEventListener("error", handleAudioError);
      // Note: Removed 'suspend' event listener as it incorrectly interferes with playback state.
      // The 'suspend' event fires when the browser pauses data loading (e.g., buffering),
      // which doesn't mean playback has stopped. Use 'play' and 'pause' events instead.
    }

    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
      if (deviceCheckTimeout) {
        clearTimeout(deviceCheckTimeout);
      }
      if (audio) {
        audio.removeEventListener("error", handleAudioError);
      }
    };
  }, [isPlaying, setPlaying, audioPath]);

  // Fetch channels on mount
  useEffect(() => {
    const fetchChannels = async () => {
      console.log(`📡 Fetching channels from: ${settings.apiUrl}/api/channels`);
      setLoadingChannels(true);
      try {
        // Try to fetch from local Go backend first
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 2000);

        const response = await fetch(`${settings.apiUrl}/api/channels`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (response.ok) {
          const data = await response.json();
          setChannels(data);
        } else {
          throw new Error("Backend failed");
        }
      } catch (e) {
        console.warn("Failed to fetch from backend, using fallback");
        // Fallback to hardcoded list if backend is down
        setChannels([
          {
            id: "the-daily",
            name: "The Daily",
            author: "The New York Times",
            rss: "https://feeds.simplecast.com/54nAGcIl",
            description: "This is how the news should sound.",
          },
          {
            id: "techmeme-ride-home",
            name: "Techmeme Ride Home",
            author: "Techmeme",
            rss: "https://www.omnycontent.com/d/playlist/e73c998e-6e60-432f-8610-ae210140c5b1/A97C9631-B244-469D-BE92-AED10141680D/48F097BA-0869-4820-AB49-AED101416820/podcast.rss",
            description: "The day's tech news, every day at 5pm ET.",
          },
          {
            id: "gcores",
            name: "机核 GCORES",
            author: "GCORES",
            rss: "https://feed.xyz/gcores",
            description: "Share the core culture of games.",
          },
        ]);
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchChannels();
  }, [settings.apiUrl]);

  // 定期检查转录状态
  useEffect(() => {
    const currentGuid = musicInfo.guid;

    if (!currentGuid || musicInfo.srtContent || !currentChannel) {
      return;
    }

    console.log(
      "🔄 Starting transcription status checker for:",
      musicInfo.name,
    );

    const checkInterval = setInterval(async () => {
      try {
        const response = await axios.get(
          `${settings.apiUrl}/api/channels/${currentChannel.id}/episodes`,
        );

        const updatedEpisode = response.data.episodes.find(
          (ep: any) => ep.guid === currentGuid,
        );

        if (updatedEpisode?.srt_content && !musicInfo.srtContent) {
          console.log("✅ Transcription completed! Loading subtitles...");

          // 更新歌词显示
          setLyrics(parseSrt(updatedEpisode.srt_content));

          // 更新节目列表
          setPodcastEpisodes((prev) =>
            prev.map((ep) =>
              ep.guid === updatedEpisode.guid ? updatedEpisode : ep,
            ),
          );

          // 更新 musicInfo
          setAudio(audioPath || "", {
            ...musicInfo,
            srtContent: updatedEpisode.srt_content,
          });
        }
      } catch (error) {
        console.error("Failed to check transcription status:", error);
      }
    }, 15000); // 每 15 秒检查一次

    return () => {
      console.log("🛑 Stopping transcription status checker");
      clearInterval(checkInterval);
    };
  }, [
    musicInfo.guid,
    musicInfo.srtContent,
    currentChannel,
    settings.apiUrl,
    audioPath,
    musicInfo,
    setAudio,
  ]);

  const performTranscription = async (path: string, guid?: string) => {
    if (isTranscribing) return false;
    setTranscribing(true);
    try {
      const res: any = await window.ipcRenderer?.invoke(
        "transcribe-audio",
        path,
        guid,
      );
      if (res.success && res.srtContent) {
        const parsed = parseSrt(res.srtContent);
        setLyrics(parsed);

        // Update local state
        if (guid) {
          setPodcastEpisodes((prev) =>
            prev.map((ep) =>
              ep.guid === guid ? { ...ep, srt_content: res.srtContent } : ep,
            ),
          );
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Transcription error:", e);
      return false;
    } finally {
      setTranscribing(false);
    }
  };

  const handleAiTranscribe = async () => {
    if (!audioPath) {
      alert("请先打开一个音频文件");
      return;
    }

    const currentEp = podcastEpisodes.find((ep) => ep.audioUrl === audioPath);
    let targetPath = audioPath.replace("local-file://media", "");

    if (!audioPath.startsWith("local-file://") && currentEp) {
      if (currentEp.local_audio_path) {
        targetPath = currentEp.local_audio_path;
      } else {
        alert("请先下载该播客到本地再进行转录");
        return;
      }
    }

    const success = await performTranscription(targetPath, currentEp?.guid);
    if (success) {
      alert("🎉 转录成功！");
    } else {
      alert("转录失败，请检查后端日志");
    }
  };

  const handleFetchChannel = async (channel: any) => {
    // 1. Abort previous request if exists
    if (fetchControllerRef.current) {
      fetchControllerRef.current.abort();
    }

    // 2. Create new controller
    const controller = new AbortController();
    fetchControllerRef.current = controller;

    setLoadingPodcast(true);
    setCurrentChannel(channel);

    try {
      // Call backend to get episodes
      const res = await fetch(
        `${settings.apiUrl}/api/channels/${channel.id}/episodes`,
        {
          signal: controller.signal,
        },
      );

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setPodcastEpisodes(data.episodes || []);
          setViewMode("episodes");
        } else {
          alert("获取失败");
        }
      } else {
        throw new Error("Backend error");
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        console.log("Request aborted");
        return; // Ignore abort errors
      }
      console.error(e);
      alert(`无法从 ${settings.apiUrl} 获取播客列表，请检查网络或后端服务状态`);
    } finally {
      // Only turn off loading if this is the current active request
      if (fetchControllerRef.current === controller) {
        setLoadingPodcast(false);
        fetchControllerRef.current = null;
      }
    }
  };

  const handleSummarize = async () => {
    console.log("🔍 Summarize check:", {
      isSummarizing,
      musicInfoGuid: musicInfo.guid,
    });

    if (isSummarizing) {
      console.log("⚠️ Summary already in progress...");
      return;
    }

    if (!musicInfo.guid) {
      console.error(
        "❌ Cannot summarize: Current track has no GUID!",
        musicInfo,
      );
      alert(
        "错误：当前曲目缺少 ID 信息，无法生成 AI 摘要。请尝试重新点击列表中的节目播放。",
      );
      return;
    }

    // Get srt content from current lyrics if not in episode metadata
    const srtContent =
      musicInfo.srtContent || lyrics.map((l) => l.text).join("\n"); // Fallback if no srt

    if (!srtContent) {
      alert("请先生成或加载歌词");
      return;
    }

    setSummarizing(true);
    console.log("🤖 Starting AI Summary request...", {
      guid: musicInfo.guid,
      model: settings.llmModel,
      apiBase: settings.llmApiBase,
    });

    try {
      const res = await fetch(`${settings.apiUrl}/api/summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guid: musicInfo.guid,
          srtContent: srtContent,
          apiKey: settings.llmApiKey,
          apiBase: settings.llmApiBase,
          model: settings.llmModel,
        }),
      });

      console.log("📡 API Response received, status:", res.status);
      const data = await res.json();
      console.log("📦 API Data decoded:", data);

      if (data.success) {
        console.log("✨ Summary generated successfully!");
        // Update current music info with summary
        usePlayerStore.setState((state) => ({
          musicInfo: { ...state.musicInfo, summary: data.summary },
        }));

        // Also update in episodes list
        setPodcastEpisodes((prev) =>
          prev.map((ep) =>
            ep.guid === musicInfo.guid ? { ...ep, summary: data.summary } : ep,
          ),
        );
      } else {
        alert(data.message || "生成摘要失败");
      }
    } catch (e) {
      console.error("Summary error:", e);
      alert("生成摘要请求失败");
    } finally {
      setSummarizing(false);
    }
  };

  const handleDownload = async (episode: any, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`${settings.apiUrl}/api/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guid: episode.guid, url: episode.audioUrl }),
      });
      if (res.ok) {
        const data = await res.json();
        alert(data.status === "exists" ? "已存在缓存" : "缓存成功");

        // Update local state with returned episode data
        if (data.episode) {
          setPodcastEpisodes((prev) =>
            prev.map((ep) => (ep.guid === episode.guid ? data.episode : ep)),
          );
        }
      }
    } catch (err) {
      console.error(err);
      alert("缓存失败");
    }
  };

  const handlePlayPodcast = (episode: any) => {
    const playUrl = episode.local_audio_path
      ? `${settings.apiUrl}/media/${episode.local_audio_path.split("/").pop()}`
      : episode.audioUrl;

    console.log("Playing podcast:", {
      title: episode.title,
      hasLocalPath: !!episode.local_audio_path,
      localPath: episode.local_audio_path,
      playUrl,
      hasSrtContent: !!episode.srt_content,
    });

    if (playUrl) {
      setAudio(playUrl, {
        name: episode.title || currentChannel?.name || "Podcast",
        artist: currentChannel?.author || "Podcast",
        guid: episode.guid,
        summary: episode.summary,
        srtContent: episode.srt_content,
      });

      // Load lyrics if available in episode data
      if (episode.srt_content) {
        console.log("Loading SRT lyrics from episode data");
        setLyrics(parseSrt(episode.srt_content));
      } else {
        setLyrics([]);

        // 自动加入转录队列（后台异步处理）
        if (episode.audioUrl) {
          console.log("🎙️ Adding to transcription queue:", episode.title);
          axios
            .post(`${settings.apiUrl}/api/queue-transcription`, {
              guid: episode.guid,
              audioUrl: episode.audioUrl,
              title: episode.title,
            })
            .then(() => {
              console.log("✅ Added to transcription queue");
            })
            .catch((error: unknown) => {
              console.error("❌ Failed to queue transcription:", error);
            });
        }
      }

      // Auto-play after setting audio
      setTimeout(() => {
        if (audioRef.current) {
          console.log("🚀 Attempting auto-play...");
          audioRef.current
            .play()
            .then(() => console.log("✅ Auto-play succeeded"))
            .catch((e) => console.error("❌ Auto-play failed:", e));
        }
      }, 100);
    }
  };

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || !duration) return;

    // Remember if audio was playing before seeking
    const wasPlaying = !audioRef.current.paused;

    const updateProgress = (clientX: number) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const percent = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / rect.width),
      );
      const newTime = percent * duration;
      audioRef.current!.currentTime = newTime;
      setCurrentTime(newTime);
    };

    // Initial seek on mouse down
    updateProgress(e.clientX);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateProgress(moveEvent.clientX);
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);

      // Resume playing if it was playing before
      if (wasPlaying && audioRef.current) {
        audioRef.current
          .play()
          .catch((e) => console.error("Resume play error:", e));
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  };

  const currentProgress = useMemo(() => {
    if (activeIndex === -1 || !lyrics[activeIndex]) return 0;
    const l = lyrics[activeIndex];
    const dur =
      l.endTime !== undefined
        ? l.endTime - l.time
        : activeIndex < lyrics.length - 1
          ? lyrics[activeIndex + 1].time - l.time
          : 2;
    return Math.min(1.0, Math.max(0, (currentTime - l.time) / (dur || 1)));
  }, [activeIndex, lyrics, currentTime]);

  return (
    <div
      className="player-container"
      style={{
        display: "flex",
        flexDirection: "row",
        flexWrap: "nowrap",
        overflow: "hidden",
        height: "100vh",
        boxSizing: "border-box",
      }}>
      {/* App Header moved to top-level */}
      <div className="app-header">
        <div className="top-toolbar">
          {settings.showDesktopLyric && (
            <button
              className={`tool-btn ${!isLyricLocked ? "active" : ""}`}
              onClick={() => {
                const newLockState = !isLyricLocked;
                setIsLyricLocked(newLockState);
                (window as any).ipcRenderer?.invoke(
                  "set-lyric-ignore-mouse-events",
                  newLockState,
                  { forward: true },
                );
              }}
              title={isLyricLocked ? "解锁（可拖动）" : "锁定（点击穿透）"}>
              {isLyricLocked ? (
                <LockIcon className="icon" />
              ) : (
                <UnlockIcon className="icon" />
              )}
            </button>
          )}
          <button
            className={`tool-btn ${settings.showDesktopLyric ? "active" : ""}`}
            onClick={() => {
              settings.updateSettings({
                showDesktopLyric: !settings.showDesktopLyric,
              });
            }}
            title={settings.showDesktopLyric ? "隐藏桌面歌词" : "显示桌面歌词"}>
            <SubtitlesIcon className="icon" />
          </button>
          <button
            className={`tool-btn ${showSettings ? "active" : ""}`}
            onClick={() => setShowSettings(!showSettings)}
            title="设置">
            <SettingsIcon className="icon" />
          </button>

          <button
            className={`tool-btn ${viewMode === "channels" ? "active" : ""}`}
            onClick={() =>
              setViewMode(viewMode === "channels" ? "player" : "channels")
            }
            title="频道列表">
            <RadioIcon className="icon" />
          </button>
        </div>
      </div>

      {/* Settings Dialog moved to top-level */}
      {showSettings && (
        <SettingsDialog
          onClose={() => setShowSettings(false)}
          settings={settings}
          isTranscribing={isTranscribing}
          onAiTranscribe={handleAiTranscribe}
          onResetLyricWindow={() =>
            (window as any).ipcRenderer?.invoke("reset-lyric-window")
          }
        />
      )}

      {/* Player Panel */}
      <PlayerPanel
        settings={settings}
        musicInfo={musicInfo}
        currentTime={currentTime}
        duration={duration}
        isPlaying={isPlaying}
        isLoading={isLoadingAudio}
        isTranscribing={isTranscribing}
        isSummarizing={isSummarizing}
        onSummarize={handleSummarize}
        playbackRate={usePlayerStore((state) => state.playbackRate)}
        setPlaybackRate={usePlayerStore((state) => state.setPlaybackRate)}
        togglePlay={togglePlay}
        lyrics={lyrics}
        activeIndex={activeIndex}
        lyricListRef={lyricListRef}
        currentProgress={currentProgress}
        handleOpenMusic={handleOpenMusic}
        handleOpenLyric={handleOpenLyric}
        handleSeek={handleProgressMouseDown}
      />

      {/* Channels Panel */}
      {(viewMode === "channels" || viewMode === "episodes") && (
        <ChannelsPanel
          loadingChannels={loadingChannels}
          channels={channels}
          currentChannel={currentChannel}
          loadingPodcast={loadingPodcast}
          onFetchChannel={handleFetchChannel}
          onClose={() => setViewMode("player")}
        />
      )}

      {/* Episodes Panel */}
      {viewMode === "episodes" && (
        <EpisodesPanel
          currentChannel={currentChannel}
          episodes={podcastEpisodes}
          onPlayEpisode={handlePlayPodcast}
          onDownloadEpisode={handleDownload}
        />
      )}

      {audioPath && <audio ref={audioRef} src={audioPath} key={audioPath} />}
    </div>
  );
}

export default App;
