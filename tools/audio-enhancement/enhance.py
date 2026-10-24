#!/usr/bin/env python3
"""تحسين صوت دروس الشيخ ماهر.

التسجيلات الأصلية صوتها مكتوم (أغلب الطاقة تحت 1kHz ومفيش ترددات فوق ~4kHz، وفوقها نغمات
تشويش ثابتة 9-16kHz)، وفيها وِش خلفية ثابت (شريط كاسيت غالباً).

المراحل:
1. قص الترددات تحت 90Hz وفوق 4.8kHz.
2. شيل الوِش: بصمة الضوضاء بتتاخد من أهدى لحظات الملف نفسه (السكوت بين الجمل)
   وبعدين تتشال بالطرح الطيفي (noisereduce، stationary). --denoise يحدد القوة (0 = بدون).
3. EQ لتقليل الكتمة ووضوح الحروف، ضغط خفيف.
4. توحيد مستوى الصوت (loudnorm بمرورين) + limiter، وتصدير MP3 mono.

الاستخدام: python3 enhance.py input.mp3 output.mp3 [--denoise 0.8] [--strength 1.0]
يحتاج: ffmpeg، numpy، noisereduce
"""
import argparse, json, os, subprocess, tempfile

SR = 44100
PRE = "highpass=f=90:p=2,lowpass=f=4800"  # يشيل نغمات التشويش اللي فوق؛ مفيش كلام هناك أصلاً


def eq_chain(k):
    g = lambda v: f"{v * k:.1f}"
    return ",".join([
        f"equalizer=f=500:t=q:w=0.8:g=-{g(6)}",   # تقليل الكتمة
        f"equalizer=f=200:t=q:w=1:g=-{g(2)}",
        f"equalizer=f=1400:t=q:w=1:g={g(4)}",     # وضوح الحروف
        f"equalizer=f=2600:t=q:w=1:g={g(7)}",
        f"equalizer=f=3600:t=q:w=1.2:g={g(6)}",
        "acompressor=threshold=-22dB:ratio=2:attack=20:release=300:makeup=1.5",
    ])


LOUD = "loudnorm=I=-16:TP=-1.5:LRA=8"
BOOST = 5  # رفع ثابت بعد التوحيد عشان الصوت يبقى عالي على الموبايل (حوالي -13 LUFS)؛ الـ limiter بيمنع التقطيع


def denoise(inp, wav, prop):
    import numpy as np
    import noisereduce as nr
    x = np.frombuffer(subprocess.run(["ffmpeg", "-v", "error", "-i", inp, "-af", PRE, "-f", "f32le",
                                      "-ar", str(SR), "-ac", "1", "-"], capture_output=True, check=True).stdout,
                      np.float32)
    # بصمة الضوضاء: أهدى 4% من الإطارات في الملف كله
    N = 2048
    w = x[:len(x) // N * N].reshape(-1, N)
    e = (w ** 2).mean(1)
    noise = w[e <= np.percentile(e, 4)].reshape(-1)
    # الملف بيتعالج على أجزاء (60 ثانية) مع تداخل ثانية واحدة عشان الذاكرة
    chunk, ov = 60 * SR, SR
    y = np.zeros_like(x)
    fade = np.linspace(0, 1, ov, dtype=np.float32)
    for start in range(0, len(x), chunk):
        a, b = max(0, start - ov), min(len(x), start + chunk)
        seg = nr.reduce_noise(y=x[a:b], sr=SR, y_noise=noise, stationary=True, prop_decrease=prop,
                              n_fft=2048, n_std_thresh_stationary=1.5, freq_mask_smooth_hz=300,
                              time_mask_smooth_ms=80).astype(np.float32)
        if a == 0:
            y[a:b] = seg
        else:
            y[a:a + ov] = y[a:a + ov] * (1 - fade) + seg[:ov] * fade
            y[a + ov:b] = seg[ov:]
    subprocess.run(["ffmpeg", "-v", "error", "-f", "f32le", "-ar", str(SR), "-ac", "1", "-i", "-", "-y", wav],
                   input=y.tobytes(), check=True)


def run(inp, out, chain, bitrate):
    head = ["ffmpeg", "-hide_banner", "-nostdin", "-i", inp]
    m = subprocess.run(head + ["-af", f"{chain},{LOUD}:print_format=json", "-f", "null", "-"],
                       capture_output=True, text=True, check=True)
    js = m.stderr
    meas = json.loads(js[js.rindex("{"):js.rindex("}") + 1])
    loud2 = (f"{LOUD}:measured_I={meas['input_i']}:measured_TP={meas['input_tp']}:"
             f"measured_LRA={meas['input_lra']}:measured_thresh={meas['input_thresh']}:"
             f"offset={meas['target_offset']}:linear=true")
    subprocess.run(head + ["-v", "error", "-af", f"{chain},{loud2},aresample={SR},volume={BOOST}dB,alimiter=limit=0.75:attack=1:release=60:level=disabled:asc=1",
                           "-ac", "1", "-ar", str(SR), "-c:a", "libmp3lame", "-b:a", bitrate,
                           "-map_metadata", "0", "-y", out], check=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("inp"); ap.add_argument("out")
    ap.add_argument("--denoise", type=float, default=0.8, help="قوة شيل الوِش من 0 لـ 1 (0 = بدون)")
    ap.add_argument("--strength", type=float, default=1.0, help="قوة تعديل النبرة (0.5 أخف، 1.5 أقوى)")
    ap.add_argument("--bitrate", default="96k")
    a = ap.parse_args()
    if a.denoise > 0:
        fd, wav = tempfile.mkstemp(suffix=".wav", dir=os.path.dirname(os.path.abspath(a.out)))
        os.close(fd)
        try:
            denoise(a.inp, wav, a.denoise)
            run(wav, a.out, eq_chain(a.strength), a.bitrate)
        finally:
            os.remove(wav)
    else:
        run(a.inp, a.out, f"{PRE},{eq_chain(a.strength)}", a.bitrate)


if __name__ == "__main__":
    main()
