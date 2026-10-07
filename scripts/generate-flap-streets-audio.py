"""Original procedural sound effects; no recordings or third-party samples.

Run from the template root with Python 3. The generated mono PCM WAV files are
part of the template under its MIT license. No network or extra dependency.
"""
from pathlib import Path
import math
import random
import struct
import wave

ROOT = Path(__file__).resolve().parents[1] / 'src/vaults/flap-streets'
RATE = 22050
rng = random.Random(42)


def write(name, values):
    peak = max(abs(x) for x in values) or 1
    frames = b''.join(struct.pack('<h', round(x / peak * 24500)) for x in values)
    with wave.open(str(ROOT / name), 'wb') as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(RATE)
        out.writeframes(frames)


# Exact integer-frequency cycles make a seamless engine loop. Modulated
# harmonics mimic cylinder firing; native-speed playback uses speed-based gain.
engine = []
for i in range(RATE * 2):
    t = i / RATE
    firing = sum(math.sin(2 * math.pi * 48 * n * t) / n for n in range(1, 9))
    body = 0.3 * math.sin(2 * math.pi * 24 * t)
    exhaust = 0.1 * math.sin(2 * math.pi * 139 * t) * math.sin(2 * math.pi * 7 * t)
    engine.append(firing * (0.76 + 0.17 * math.sin(2 * math.pi * 12 * t)) + body + exhaust)
write('engine.wav', engine)

tires = []
for i in range(RATE * 2):
    t = i / RATE
    squeal = math.sin(2 * math.pi * 880 * t + 1.6 * math.sin(2 * math.pi * 37 * t))
    tires.append(0.55 * squeal + 0.32 * math.sin(2 * math.pi * 1360 * t) + 0.18 * rng.uniform(-1, 1))
# Crossfade the noise seam without removing the tonal loop.
for i in range(220):
    blend = i / 220
    tires[-220 + i] = tires[-220 + i] * (1 - blend) + tires[i] * blend
write('tires.wav', tires)

impact = []
for i in range(int(RATE * 0.6)):
    t = i / RATE
    thump = math.sin(2 * math.pi * (100 * t - 48 * t * t)) * math.exp(-t * 17)
    crunch = rng.uniform(-1, 1) * math.exp(-t * 13)
    metal = math.sin(2 * math.pi * 630 * t) * math.exp(-t * 10)
    attack = min(1, t / 0.003)
    impact.append(attack * (0.85 * thump + 0.65 * crunch + 0.15 * metal))
write('impact.wav', impact)

chime = []
for i in range(int(RATE * 0.65)):
    t = i / RATE
    value = 0
    for frequency, start in [(659.25, 0), (987.77, 0.12), (1318.51, 0.23)]:
        age = t - start
        if age >= 0:
            value += math.sin(2 * math.pi * frequency * age) * min(1, age / 0.008) * math.exp(-age * 8)
    chime.append(value)
write('checkpoint.wav', chime)
# A smooth two-second wail. Integral phase closes at an integer number of
# cycles, so the loop seam has no click; distance controls its in-game gain.
siren = []
for i in range(RATE * 2):
    t = i / RATE
    phase = 2 * math.pi * 720 * t - 440 * math.cos(math.pi * t)
    siren.append(math.sin(phase) + 0.12 * math.sin(phase * 3))
write('siren.wav', siren)
print('Generated engine, tires, impact, checkpoint and siren WAV files.')

# Original 8-bar, 96 BPM night-drive loop: Am7 / Fmaj7 / Cmaj7 / G6.
# Each note's release wraps into the next loop, keeping the join continuous.
BPM = 96
BEAT = 60 / BPM
LENGTH = round(32 * BEAT * RATE)
music = [0.0] * LENGTH
music_rng = random.Random(20261006)


def tone(start, duration, midi, gain, kind='pad'):
    frequency = 440 * 2 ** ((midi - 69) / 12)
    offset = round(start * RATE)
    for i in range(round(duration * RATE)):
        age = i / RATE
        attack = min(1, age / (0.18 if kind == 'pad' else 0.012))
        release = min(1, max(0, duration - age) / (0.55 if kind == 'pad' else 0.12))
        decay = 1 if kind == 'pad' else math.exp(-age * (3.5 if kind == 'pluck' else 2))
        phase = 2 * math.pi * frequency * age
        value = math.sin(phase) + 0.19 * math.sin(phase * 2) + 0.06 * math.sin(phase * 3)
        music[(offset + i) % LENGTH] += value * gain * attack * release * decay


chords = [(57, 60, 64, 67), (53, 57, 60, 64), (48, 52, 55, 59), (55, 59, 62, 64)]
for bar_pair, chord in enumerate(chords):
    start = bar_pair * 8 * BEAT
    for note in chord:
        tone(start, 8 * BEAT + 0.4, note, 0.085)
    for beat in range(8):
        tone(start + beat * BEAT, BEAT * 0.8, chord[0] - 24, 0.32, 'bass')
    for n, step in enumerate([0, 2, 4, 2, 1, 3, 5, 3]):
        tone(start + (n + 0.5) * BEAT, BEAT * 1.2, chord[step % 4] + 12, 0.08, 'pluck')

for beat in range(32):
    offset = round(beat * BEAT * RATE)
    for i in range(round(0.28 * RATE)):
        age = i / RATE
        attack = min(1, age / 0.004)
        kick = math.sin(2 * math.pi * (48 * age + 2.8 * (1 - math.exp(-age * 20)))) * math.exp(-age * 20)
        snare = music_rng.uniform(-1, 1) * math.exp(-age * 33) if beat % 4 in [1, 3] else 0
        music[(offset + i) % LENGTH] += attack * (0.3 * kick + 0.05 * snare)
    for offbeat in [0, 0.5]:
        hat_offset = round((beat + offbeat) * BEAT * RATE)
        for i in range(round(0.06 * RATE)):
            age = i / RATE
            music[(hat_offset + i) % LENGTH] += 0.016 * music_rng.uniform(-1, 1) * min(1, age / 0.003) * math.exp(-age * 75)

write('music.wav', music)
print('Generated original 20-second background music loop.')
