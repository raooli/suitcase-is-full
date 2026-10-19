#!/usr/bin/env python3
"""离线合成 M4-4 音效真素材，对齐 assets/core/audio/sfx.ts 的规格表。

输入 = `core/audio/sfx.ts` 的四种脉冲规格（波形 / 频率 / 时长 / 相对增益），
输出 = `assets/resources/audio/<SfxKey>.wav`（44100Hz / 16bit / mono）。

规格（attack 8ms，与 AudioAdapter 一致）：
  select     : sine     660->880 Hz, 70ms,  gain 0.50
  place-ok   : square   520->260 Hz, 110ms, gain 0.30
  place-fail : triangle 300->180 Hz, 220ms, gain 0.45
  success    : square   660->330 Hz, 60ms,  gain 0.28  (扣锁 click)
             + triangle 523->1046 Hz, delay 80ms, 260ms, gain 0.50  (上行小钟)

**不烘焙 SFX_MASTER_GAIN（0.22）**：整条归一化到 0.70 峰值，主音量留给播放器
volume。M4-5 接线时 volume 取 0.22 → 有效峰值 0.154，与 M2-9 合成版同听感。
集成时 AudioAdapter 换成播文件即可，SfxKey 命名空间不变。

用法：python3 tools/synth-sfx.py
"""
import math
import os
import struct
import wave

SR = 44100
ATTACK = 0.008
FLOOR = 0.0001  # WebAudio 包络起止值（exponentialRamp 不能到 0）
# 交付标准：整条归一化到 -3.1 dBFS。**不烘焙 SFX_MASTER_GAIN**——
# 那是合成后端的余量常量，文件侧应由播放器 volume 承担（M4-5 接线时设 0.22，
# 有效峰值 ≈0.154，与 M2-9 合成版听感一致）。
TARGET_PEAK = 0.70


def waveform(kind: str, phase: float) -> float:
    s = math.sin(phase)
    if kind == 'sine':
        return s
    if kind == 'square':
        return 1.0 if s >= 0 else -1.0
    if kind == 'triangle':
        return (2.0 / math.pi) * math.asin(s)
    raise ValueError(kind)


def env(t, t0, attack, t1, peak):
    """复刻 WebAudio 包络：t0 起 0.0001 -> linear 到 peak(t0+attack) -> exp 到 0.0001(t1)。"""
    if t < t0:
        return 0.0
    if t <= t0 + attack:
        if attack <= 0:
            return peak
        return FLOOR + (peak - FLOOR) * (t - t0) / attack
    if t >= t1:
        return 0.0
    # 指数衰减段
    span = t1 - (t0 + attack)
    if span <= 0:
        return peak
    return peak * (FLOOR / peak) ** ((t - (t0 + attack)) / span)


def synth(pulses):
    n = max(int((p['delayMs'] + p['durationMs']) / 1000 * SR) for p in pulses)
    buf = [0.0] * n
    for p in pulses:
        t0 = p['delayMs'] / 1000.0
        t1 = (p['delayMs'] + p['durationMs']) / 1000.0
        dur = p['durationMs'] / 1000.0
        f0 = p['freqFrom']
        f1 = p['freqTo']
        peak = min(max(p['gain'], 0.0), 1.0)
        for i in range(int(t1 * SR)):
            t = i / SR
            g = env(t, t0, ATTACK, t1, peak)
            if g <= 0:
                continue
            frac = (t - t0) / dur if dur > 0 else 1.0
            freq = f0 + (f1 - f0) * frac
            phase = 2.0 * math.pi * freq * t
            buf[i] += g * waveform(p['waveform'], phase)
    # 软裁剪（避免多脉冲叠加削波爆音）
    out = []
    for v in buf:
        v = max(-1.0, min(1.0, v))
        out.append(v)
    # 归一化到 TARGET_PEAK（保留相对增益关系，只抬整体电平）
    pk = max((abs(v) for v in out), default=0.0)
    if pk > 0:
        k = TARGET_PEAK / pk
        out = [v * k for v in out]
    return out


def write_wav(path, samples):
    with wave.open(path, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        frames = b''.join(struct.pack('<h', int(max(-32768, min(32767, v * 32767)))) for v in samples)
        w.writeframes(frames)


SPECS = {
    'select': [
        {'waveform': 'sine', 'freqFrom': 660, 'freqTo': 880, 'delayMs': 0, 'durationMs': 70, 'gain': 0.50},
    ],
    'place-ok': [
        {'waveform': 'square', 'freqFrom': 520, 'freqTo': 260, 'delayMs': 0, 'durationMs': 110, 'gain': 0.30},
    ],
    'place-fail': [
        {'waveform': 'triangle', 'freqFrom': 300, 'freqTo': 180, 'delayMs': 0, 'durationMs': 220, 'gain': 0.45},
    ],
    'success': [
        {'waveform': 'square', 'freqFrom': 660, 'freqTo': 330, 'delayMs': 0, 'durationMs': 60, 'gain': 0.28},
        {'waveform': 'triangle', 'freqFrom': 523, 'freqTo': 1046, 'delayMs': 80, 'durationMs': 260, 'gain': 0.50},
    ],
}

OUT = '/Users/sheep/code-workspace/suitcase-is-full/assets/resources/audio'
os.makedirs(OUT, exist_ok=True)
for name, pulses in SPECS.items():
    samples = synth(pulses)
    path = os.path.join(OUT, f'{name}.wav')
    write_wav(path, samples)
    dur_ms = len(samples) / SR * 1000
    print(f'  {name:10s} {len(samples)} 样本 / {dur_ms:.0f}ms -> {path}')
print('done')
