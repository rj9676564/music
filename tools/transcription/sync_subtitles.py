import os
import sys
import datetime
import whisper
import yt_dlp
import re
import requests
import torch
import time
from typing import Optional, Dict, Any

# ================= 配置部分 =================
VPS_URL = os.getenv("VPS_URL", "https://podcast.mrlb.top")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./media_cache")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
# ===========================================

def ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def get_task_from_vps() -> Optional[Dict[str, Any]]:
    """从 VPS 获取一个待转录的任务"""
    print(f"🔍 正在从 VPS 检查待转录任务: {VPS_URL}/api/episodes/missing-srt")
    try:
        resp = requests.get(f"{VPS_URL}/api/episodes/missing-srt")
        if resp.status_code != 200:
            print(f"❌ 无法连接服务器: {resp.status_code}")
            return None
        
        data = resp.json()
        episodes = data.get("episodes", [])
        if not episodes:
            return None
            
        return episodes[0]  # 返回最优先的一个任务
    except Exception as e:
        print(f"❌ 获取任务失败: {e}")
        return None

def download_audio(url: str, output_path: str) -> bool:
    """使用 yt-dlp 下载音频"""
    if os.path.exists(output_path):
        print(f"⏭️  音频已存在，跳过下载: {output_path}")
        return True

    print(f"📥 正在下载音频: {url}")
    ydl_opts = {
        'format': 'bestaudio/best',
        'outtmpl': output_path,
        'quiet': True,
        'no_warnings': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception as e:
        print(f"❌ 下载失败: {e}")
        return False

def format_time(seconds: float) -> str:
    """将秒数转换为 SRT 时间格式 (HH:MM:SS,ms)"""
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"

def generate_srt(audio_path: str, srt_path: str):
    """使用 Whisper 生成 SRT 字幕"""
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"🎙️ 正在加载 Whisper 模型 ({WHISPER_MODEL}), 使用设备: {device.upper()}")
    
    model = whisper.load_model(WHISPER_MODEL, device=device)
    
    print("⏳ 正在进行语音识别... (这可能需要几分钟)")
    start_time = time.time()
    
    result = model.transcribe(audio_path, task="transcribe")
    
    duration = time.time() - start_time
    
    with open(srt_path, "w", encoding="utf-8") as f:
        for i, segment in enumerate(result["segments"], start=1):
            start = format_time(segment["start"])
            end = format_time(segment["end"])
            text = segment["text"].strip()
            f.write(f"{i}\n{start} --> {end}\n{text}\n\n")
    
    print(f"✅ SRT 已生成, 耗时: {duration:.2f} 秒")
    return True

def upload_to_vps(srt_path: str, guid: str):
    """提交结果到 VPS"""
    print(f"📤 正在上传结果到 VPS (GUID: {guid})...")
    try:
        with open(srt_path, "r", encoding="utf-8") as f:
            srt_content = f.read()
            
        payload = {
            "guid": guid,
            "srtContent": srt_content
        }
        
        resp = requests.post(
            f"{VPS_URL}/api/save-srt",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        
        if resp.status_code == 200:
            print("✨ 同步完成！")
            return True
        else:
            print(f"❌ 上传失败 ({resp.status_code}): {resp.text}")
            return False
    except Exception as e:
        print(f"❌ 同步过程出错: {e}")
        return False

def main():
    ensure_dir(OUTPUT_DIR)
    
    # 1. 获取任务
    task = get_task_from_vps()
    if not task:
        print("☕️ 目前没有待处理的转录任务。")
        return

    guid = task.get('guid')
    audio_url = task.get('audio_url')
    title = task.get('title')

    print(f"\n🎬 开始处理任务: {title}")
    
    # 2. 准备路径
    safe_title = re.sub(r'[<>:"/\\|?*]', '', title)[:50]
    audio_path = os.path.join(OUTPUT_DIR, f"{guid}.mp3")
    srt_path = os.path.join(OUTPUT_DIR, f"{guid}.srt")

    # 3. 执行流程
    if download_audio(audio_url, audio_path):
        if generate_srt(audio_path, srt_path):
            if upload_to_vps(srt_path, guid):
                # 清理临时文件（可选）
                # os.remove(audio_path)
                # os.remove(srt_path)
                print(f"Successfully processed: {title}")

if __name__ == "__main__":
    main()
