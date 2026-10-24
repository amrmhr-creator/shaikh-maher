#!/usr/bin/env python3
"""Cut a fa'ida from a lesson and render it as a vertical video in the
style of "حقيقة الاستغفار": the sheikh's photo full-frame, black strip at
the bottom, Arabic captions near the bottom.

Usage:
  python3 make_faida.py LESSON START END OUT.mp4 [captions.txt]

  LESSON   lesson number (uses audio-enhancement/enhanced/LESSON.mp3)
  START    mm:ss or hh:mm:ss
  END      mm:ss or hh:mm:ss
  captions one caption per line (the words as spoken). Each line is shown
           in turn; its timing is spread over the speech by length and
           snapped to the pauses in the audio.
"""
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

# مجلد ملفات المشروع (الدروس المحسّنة وصورة الشيخ)؛ يتغير بمتغير PROJECT_FILES.
ROOT = Path(os.environ.get("PROJECT_FILES", "/mnt/project-files"))
AUDIO_DIR = ROOT / "audio-enhancement/enhanced"
PHOTO = ROOT / "old-site-archive/wp-uploads/2026/04/FB_IMG_1467603971941_1775752325381.jpg"
FONT = "DejaVu Sans"
W, H, BAR = 1080, 1920, 90


def secs(t):
    parts = [float(p) for p in t.split(":")]
    s = 0.0
    for p in parts:
        s = s * 60 + p
    return s


def ass_time(t):
    h, rem = divmod(t, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}"


def pauses(wav, dur):
    """Midpoints of silences inside the clip."""
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(wav), "-af",
         "silencedetect=noise=-32dB:d=0.25", "-f", "null", "-"],
        capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", out)]
    ends = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", out)]
    return [(a + b) / 2 for a, b in zip(starts, ends) if 0 < a and b < dur]


def caption_times(lines, dur, gaps):
    total = sum(len(l) for l in lines)
    times, t = [], 0.0
    for i, line in enumerate(lines):
        end = dur if i == len(lines) - 1 else t + dur * len(line) / total
        if i < len(lines) - 1 and gaps:
            near = min(gaps, key=lambda g: abs(g - end))
            if abs(near - end) < 1.5 and near > t + 0.4:
                end = near
        times.append((t, end))
        t = end
    return times


def write_ass(path, lines, times):
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,{FONT},62,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,4,3,2,90,90,{BAR + 160},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    ev = [f"Dialogue: 0,{ass_time(a)},{ass_time(b)},Cap,,0,0,0,,{{\\fad(120,80)}}{l}"
          for l, (a, b) in zip(lines, times)]
    path.write_text(head + "\n".join(ev) + "\n", encoding="utf-8")


def main():
    lesson, start, end, out = sys.argv[1:5]
    cap_file = sys.argv[5] if len(sys.argv) > 5 else None
    ss, dur = secs(start), secs(end) - secs(start)
    tmp = Path(tempfile.mkdtemp())
    wav = tmp / "clip.wav"
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-ss", str(ss), "-t", str(dur),
         "-i", str(AUDIO_DIR / f"{lesson}.mp3"),
         "-af", f"afade=t=in:d=0.3,afade=t=out:st={max(dur - 0.6, 0)}:d=0.6",
         "-ar", "44100", "-ac", "2", str(wav)], check=True)

    vf = (f"scale={W}:{H - BAR}:force_original_aspect_ratio=increase,"
          f"crop={W}:{H - BAR},pad={W}:{H}:0:0:black,format=yuv420p")
    if cap_file:
        lines = [l.strip() for l in Path(cap_file).read_text(encoding="utf-8").splitlines() if l.strip()]
        ass = tmp / "caps.ass"
        write_ass(ass, lines, caption_times(lines, dur, pauses(wav, dur)))
        vf += f",subtitles={ass}"

    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-loop", "1", "-framerate", "30",
         "-i", str(PHOTO), "-i", str(wav), "-vf", vf, "-t", str(dur),
         "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-tune", "stillimage",
         "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-shortest", out],
        check=True)
    print(out)


if __name__ == "__main__":
    main()
