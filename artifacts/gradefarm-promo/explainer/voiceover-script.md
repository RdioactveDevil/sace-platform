# gradefarm. explainer: voiceover script

63 seconds, 1920 × 1080. Read at a relaxed pace, about 140 words a minute. Each line starts on the timestamp shown. The on-screen captions say the same thing, so the video also works muted.

| Time | Scene | Voiceover |
|---|---|---|
| 0:00 | Title: "What is it, exactly?" | What is gradefarm., exactly? |
| 0:05 | The definition | It's a study app that remembers every question you get wrong… and keeps asking until you get it right. |
| 0:12 | A question: student picks $65, checks it | Say you get this one wrong. You see the working straight away, so you know why. |
| 0:21 | The square moves along: miss, 1 hour, 4 days, 3 weeks, gold | Then it comes back. An hour later. Then a few days later. Then weeks later. Until you get it right every time. |
| 0:31 | Zoom out to the field over a term | Every question in your subject is a square in your field. Gold means you can do it. |
| 0:38 | Titan switching Plain, Sport, Gaming, Music | Stuck? Titan, the AI tutor, explains it your way. Plainly, or with sport, gaming or music. |
| 0:46 | The Sunday email, then the under-15 switch | Parents get the week every Sunday. And for under-fifteens, the AI stays off until a parent says yes. |
| 0:52 | The tutor's student table | Tutors see every answer before the lesson. And their students get gradefarm. free. |
| 0:58 | End card | gradefarm. Start with one subject, free, at gradefarm.com.au. |

## To add the voice and music

1. Record the lines above (a phone in a quiet room is fine) or use a voice service, and save as `voice.m4a`.
2. Optional: a quiet music bed, `music.mp3`.
3. Mix onto the video:

```
ffmpeg -i GradeFarm-Promo-Video.mp4 -i voice.m4a -i music.mp3 \
  -filter_complex "[2:a]volume=0.12[m];[1:a][m]amix=inputs=2:duration=first[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -shortest gradefarm-explainer-voiced.mp4
```

## Editing the video

The video is built from `explainer.html` in this folder; every scene is a function of time in `render(t)`. Change any wording there, then re-render from this folder (about 90 seconds; needs Playwright's Chromium and ffmpeg):

```
node render.cjs ../../../GradeFarm-Promo-Video.mp4
```
