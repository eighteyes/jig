---
jig: explore
title: Take explorer
seed: 1
dimensions:
  - {key: hnr_db, label: HNR, group: quality, dp: 1, low: 5, high: 25, prefer_high: true, stat: clarity, desc: "Harmonics to noise. Higher is cleaner."}
  - {key: pause_frac, label: Pauses, group: pacing, dp: 2, low: 0, high: 0.5, gate: true, stat: pauses}
  - {key: rate_syl_s, label: Pace, group: pacing, dp: 1, stat: pace}
thresholds: {hnr_db: {min: 10}}
---
- take 12
  hnr_db:: 18.2
  pause_frac:: 0.21
  rate_syl_s:: 4.1
  rating:: 1540
  audio:: takes/12a.wav, takes/12b.wav
  tags:: warm
- [keep] take 7
  hnr_db:: 22.4
  pause_frac:: 0.1
  rate_syl_s:: 5.2
  tags:: bright
- take 3
  hnr_db:: 9.5
  pause_frac:: 0.35
  rate_syl_s:: 3.2
- take 5
  hnr_db:: 15.1
  pause_frac:: 0.55
  rate_syl_s:: 4.8
- take 8
  hnr_db:: 19.9
  pause_frac:: 0.28
  rate_syl_s:: 3.9
  rating:: 1620
- take 9
  hnr_db:: 12.3
  pause_frac:: 0.15
  rate_syl_s:: 6.1
- take 14
  hnr_db:: 24.0
  pause_frac:: 0.4
  rate_syl_s:: 2.8
  tags:: slow
