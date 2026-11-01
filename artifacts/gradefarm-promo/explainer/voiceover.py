"""Add a voiceover to the explainer video.

Each line of the script starts at its scene's timestamp. The audio comes
from either:

  --piper MODEL.onnx   a Piper voice (pip install piper-tts; voices at
                       huggingface.co/rhasspy/piper-voices), or
  --recordings DIR     your own recordings, named line01.wav … line09.wav
                       (or .m4a/.mp3), one per line below.

Optional --music FILE adds a quiet music bed under the voice.

  python voiceover.py --piper en_GB-cori-high.onnx
  python voiceover.py --recordings ./takes --music bed.mp3

It warns when a line runs into the next scene, then writes the voiced
video (default ../../../GradeFarm-Promo-Video-voiced.mp4).
"""
import argparse, json, pathlib, subprocess, sys, tempfile, wave

HERE = pathlib.Path(__file__).resolve().parent
VIDEO = HERE / '../../../GradeFarm-Promo-Video.mp4'

# (start in seconds, text). Starts match the scenes in explainer.html.
LINES = [
    (0.6, "What is gradefarm., exactly?"),
    (5.0, "It's a study app that remembers every question you get wrong, and keeps asking until you get it right."),
    (12.6, "Say you get this one wrong. You see the working straight away, so you know why."),
    (21.8, "Then it comes back. An hour later. Then a few days later. Then weeks later. Until you get it right every time."),
    (31.4, "Every question in your subject is a square in your field. Gold means you can do it."),
    (38.5, "Stuck? Titan, the AI tutor, explains it your way. Plainly, or with sport, gaming or music."),
    (46.4, "Parents get the week every Sunday. And for under-fifteens, the AI stays off until a parent says yes."),
    (52.4, "Tutors see every answer before the lesson. And their students get gradefarm. free."),
    (58.2, "gradefarm. Start with one subject, free, at gradefarm dot com dot A U."),
]


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(path)], capture_output=True, text=True, check=True)
    return float(json.loads(out.stdout)['format']['duration'])


def piper_lines(model, tmp):
    from piper import PiperVoice  # pip install piper-tts
    voice = PiperVoice.load(str(model))
    files = []
    for i, (_, text) in enumerate(LINES, 1):
        p = tmp / f'line{i:02d}.wav'
        with wave.open(str(p), 'wb') as w:
            voice.synthesize_wav(text.replace('gradefarm.', 'grade farm.'), w)
        files.append(p)
    return files


def recorded_lines(folder):
    files = []
    for i in range(1, len(LINES) + 1):
        hits = [p for ext in ('wav', 'm4a', 'mp3') for p in [folder / f'line{i:02d}.{ext}'] if p.exists()]
        if not hits:
            sys.exit(f'Missing {folder}/line{i:02d}.wav (or .m4a/.mp3)')
        files.append(hits[0])
    return files


def main():
    ap = argparse.ArgumentParser()
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument('--piper', type=pathlib.Path)
    src.add_argument('--recordings', type=pathlib.Path)
    ap.add_argument('--music', type=pathlib.Path)
    ap.add_argument('--video', type=pathlib.Path, default=VIDEO)
    ap.add_argument('--out', type=pathlib.Path, default=HERE / '../../../GradeFarm-Promo-Video-voiced.mp4')
    a = ap.parse_args()

    with tempfile.TemporaryDirectory() as t:
        tmp = pathlib.Path(t)
        files = piper_lines(a.piper, tmp) if a.piper else recorded_lines(a.recordings)
        total = duration(a.video)
        for i, ((start, text), f) in enumerate(zip(LINES, files)):
            end = LINES[i + 1][0] if i + 1 < len(LINES) else total
            d = duration(f)
            flag = '' if start + d <= end - 0.2 else f'  <- runs {start + d - end + 0.2:.1f}s into the next scene'
            print(f'{start:5.1f}s  {d:4.1f}s  {text[:60]}{flag}')

        cmd = ['ffmpeg', '-y', '-v', 'error', '-i', str(a.video)]
        for f in files:
            cmd += ['-i', str(f)]
        parts, labels = [], []
        for i, (start, _) in enumerate(LINES, 1):
            ms = int(start * 1000)
            parts.append(f'[{i}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay={ms}|{ms}[v{i}]')
            labels.append(f'[v{i}]')
        parts.append(f"{''.join(labels)}amix=inputs={len(LINES)}:normalize=0,apad[voice]")
        mix = '[voice]'
        if a.music:
            cmd += ['-stream_loop', '-1', '-i', str(a.music)]
            m = len(LINES) + 1
            # Duck the music under the voice.
            parts.append(f'[{m}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=0.18[bed]')
            parts.append('[voice]asplit[vk][vm]')
            parts.append('[bed][vk]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=400[duck]')
            parts.append('[vm][duck]amix=inputs=2:normalize=0[mix]')
            mix = '[mix]'
        parts.append(f'{mix}afade=t=out:st={total - 1.5:.2f}:d=1.5[a]')
        cmd += ['-filter_complex', ';'.join(parts), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', f'{total:.2f}', '-movflags', '+faststart', str(a.out)]
        subprocess.run(cmd, check=True)
        print('Wrote', a.out.resolve())


if __name__ == '__main__':
    main()
