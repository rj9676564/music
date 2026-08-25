import os
import sys
import datetime
import socket
import argparse
import whisper
import yt_dlp
import re
import requests
import torch
import time
import signal
from typing import Optional, Dict, Any

# ================= 配置部分 =================
VPS_URL = os.getenv("VPS_URL", "https://podcast.mrlb.top")
OUTPUT_DIR = os.getenv("OUTPUT_DIR", "./media_cache")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
WORKER_ID = os.getenv("WORKER_ID", f"{socket.gethostname()}-{os.getpid()}")
LEASE_SECONDS = int(os.getenv("LEASE_SECONDS", "600")) # 默认 10 分钟锁定期
# ===========================================

def ensure_dir(directory):
    if not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)

def claim_task_from_vps() -> Optional[Dict[str, Any]]:
    """从 VPS 认领一个待转录任务 (支持原子 Claim 和老版本 Fallback)"""
    claim_url = f"{VPS_URL}/api/transcription-jobs/claim"
    print(f"🔍 正在从 VPS 检查/认领待转录任务 (Worker: {WORKER_ID})...")

    try:
        resp = requests.post(
            claim_url,
            json={"workerId": WORKER_ID, "leaseSeconds": LEASE_SECONDS},
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        if resp.status_code == 200:
            data = resp.json()
            job = data.get("job")
            if job:
                return {
                    "id": job.get("id"),
                    "guid": job.get("episode_guid") or job.get("guid"),
                    "audio_url": job.get("audio_url"),
                    "title": job.get("title") or "Unknown",
                }
            return None
        elif resp.status_code == 404:
            # 兼容旧版本 missing-srt 接口
            return get_task_legacy()
        else:
            print(f"❌ 认领接口响应错误 ({resp.status_code}): {resp.text}")
            return None
    except Exception as e:
        print(f"⚠️ 认领接口连接失败 ({e})，尝试兼容模式...")
        return get_task_legacy()

def get_task_legacy() -> Optional[Dict[str, Any]]:
    """兼容旧版 GET /api/episodes/missing-srt"""
    try:
        resp = requests.get(f"{VPS_URL}/api/episodes/missing-srt", timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            episodes = data.get("episodes", [])
            if episodes:
                ep = episodes[0]
                return {
                    "id": ep.get("id"),
                    "guid": ep.get("guid"),
                    "audio_url": ep.get("audio_url"),
                    "title": ep.get("title") or "Unknown",
                }
        return None
    except Exception as e:
        print(f"❌ 兼容接口获取任务失败: {e}")
        return None

def download_audio(url: str, output_path: str) -> bool:
    """使用 yt-dlp 下载音频"""
    if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
        print(f"⏭️  本地已存在音频文件，跳过下载: {output_path}")
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

def generate_srt(audio_path: str, srt_path: str) -> bool:
    """使用 Whisper 生成 SRT 字幕"""
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"🎙️ 正在加载 Whisper 模型 ({WHISPER_MODEL}), 使用设备: {device.upper()}")

    try:
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

        print(f"✅ SRT 已生成: {srt_path}, 耗时: {duration:.2f} 秒")
        return True
    except Exception as e:
        print(f"❌ Whisper 转录失败: {e}")
        return False

def upload_complete_to_vps(srt_path: str, guid: str, job_id: Optional[str] = None) -> bool:
    """提交结果到 VPS (优先使用 /complete，兼容 /save-srt)"""
    print(f"📤 正在上传转录结果到 VPS (GUID: {guid})...")
    try:
        with open(srt_path, "r", encoding="utf-8") as f:
            srt_content = f.read()

        payload = {
            "jobId": job_id,
            "guid": guid,
            "srtContent": srt_content
        }

        # 优先使用 jobs 专属完成接口
        resp = requests.post(
            f"{VPS_URL}/api/transcription-jobs/complete",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=30
        )

        if resp.status_code == 404:
            # 回退到兼容接口
            resp = requests.post(
                f"{VPS_URL}/api/save-srt",
                json={"guid": guid, "srtContent": srt_content},
                headers={"Content-Type": "application/json"},
                timeout=30
            )

        if resp.status_code == 200:
            print("✨ 转录结果提交成功！")
            return True
        else:
            print(f"❌ 上传失败 ({resp.status_code}): {resp.text}")
            return False
    except Exception as e:
        print(f"❌ 上传同步出错: {e}")
        return False

def report_failure_to_vps(guid: str, error_message: str, job_id: Optional[str] = None):
    """向 VPS 上报转录失败，便于任务重试或状态记录"""
    print(f"🚨 正在上报任务失败状态到 VPS (GUID: {guid}): {error_message}")
    try:
        payload = {
            "jobId": job_id,
            "guid": guid,
            "error": error_message
        }
        requests.post(
            f"{VPS_URL}/api/transcription-jobs/fail",
            json=payload,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
    except Exception as e:
        print(f"⚠️ 上报失败状态异常: {e}")

def process_one_task() -> bool:
    """执行单个任务处理流程，返回是否处理了任务"""
    ensure_dir(OUTPUT_DIR)
    
    # 1. 认领/获取任务
    task = claim_task_from_vps()
    if not task:
        return False

    job_id = task.get('id')
    guid = task.get('guid')
    audio_url = task.get('audio_url')
    title = task.get('title')

    print(f"\n🎬 开始处理任务: {title} (GUID: {guid})")
    
    # 2. 准备本地路径
    audio_path = os.path.join(OUTPUT_DIR, f"{guid}.mp3")
    srt_path = os.path.join(OUTPUT_DIR, f"{guid}.srt")

    # 3. 关键优化：如果本地已存在 SRT 字幕，直接进入“待上传/重试”，无需重新跑 Whisper！
    if os.path.exists(srt_path) and os.path.getsize(srt_path) > 0:
        print(f"⚡️ 本地已存在字幕文件 ({srt_path})，跳过音频下载与 Whisper 计算，直接上传！")
        if upload_complete_to_vps(srt_path, guid, job_id):
            print(f"🎉 任务已成功完成: {title}")
            return True
        else:
            report_failure_to_vps(guid, "Upload cached SRT failed", job_id)
            return False

    # 4. 正常转录流程
    if not audio_url:
        report_failure_to_vps(guid, "Audio URL is missing", job_id)
        return False

    if not download_audio(audio_url, audio_path):
        report_failure_to_vps(guid, "Audio download failed", job_id)
        return False

    if not generate_srt(audio_path, srt_path):
        report_failure_to_vps(guid, "Whisper transcription failed", job_id)
        return False

    if not upload_complete_to_vps(srt_path, guid, job_id):
        report_failure_to_vps(guid, "Upload SRT failed", job_id)
        return False

    print(f"🎉 任务已成功完成: {title}")
    return True

running = True

def signal_handler(signum, frame):
    global running
    print("\n👋 收到退出信号，准备停止 Worker...")
    running = False

def main():
    parser = argparse.ArgumentParser(description="Molten Music Whisper 转录 Worker")
    parser.add_argument("--daemon", "-d", action="store_true", help="守护进程轮询模式")
    parser.add_argument("--interval", "-i", type=int, default=30, help="轮询等待间隔秒数 (默认 30 秒)")
    parser.add_argument("--model", "-m", type=str, default=None, help="覆盖 Whisper 模型 (例如 base, small, medium, large)")
    args = parser.parse_args()

    global WHISPER_MODEL
    if args.model:
        WHISPER_MODEL = args.model

    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)

    is_daemon = args.daemon or os.getenv("DAEMON_MODE", "").lower() in ("true", "1", "yes")
    interval = args.interval

    print("=" * 50)
    print(f"🚀 Molten Music 转录 Worker 已启动")
    print(f"📍 服务端: {VPS_URL}")
    print(f"🤖 Whisper 模型: {WHISPER_MODEL}")
    print(f"🆔 Worker 标识: {WORKER_ID}")
    print(f"📁 缓存目录: {OUTPUT_DIR}")
    print(f"🔄 运行模式: {'守护进程轮询 (' + str(interval) + 's)' if is_daemon else '单次任务模式'}")
    print("=" * 50)

    if not is_daemon:
        has_task = process_one_task()
        if not has_task:
            print("☕️ 目前没有待处理的转录任务。")
    else:
        while running:
            try:
                has_task = process_one_task()
                if not has_task:
                    print(f"☕️ 目前没有待处理的任务，{interval} 秒后再次检查...")
                    for _ in range(interval):
                        if not running:
                            break
                        time.sleep(1)
                else:
                    # 如果刚才处理了任务，立即检查下一个任务，无需等待
                    time.sleep(1)
            except Exception as e:
                print(f"❌ 处理任务异常: {e}")
                time.sleep(5)

if __name__ == "__main__":
    main()
