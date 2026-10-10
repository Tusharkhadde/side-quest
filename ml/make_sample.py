#!/usr/bin/env python3
"""
Generate ml/sample_journal.csv: SYNTHETIC data with a plausible pattern
(late afternoons accepted more often, rain and night declined), so the
TabPFN script can be tried before you have a real journal. Not real usage.
"""

import csv
import math
import random
from pathlib import Path

random.seed(7)
OUT = Path(__file__).resolve().parent / "sample_journal.csv"
HEADER = ["hour", "weekday", "weather_code", "temperature_c", "minutes_to_sunset", "conditions", "accepted", "completed"]

rows = []
for _ in range(160):
    hour = random.choice([7, 8, 9, 11, 13, 14, 15, 16, 16, 17, 17, 18, 19, 20, 21, 22, 23])
    weekday = random.randrange(7)
    wet = random.random() < 0.18
    code = random.choice([61, 63, 80]) if wet else random.choice([0, 1, 2, 3])
    temp = round(random.gauss(29 if 11 <= hour <= 16 else 25, 2.5), 1)
    to_sunset = 18 * 60 + 15 - (hour * 60 + 30)
    if wet:
        cond = "rain"
    elif to_sunset < 30:
        cond = "dark"
    elif temp >= 38:
        cond = "too-hot"
    else:
        cond = "good"
    base = 0.15 + 0.55 * math.exp(-((hour - 17) ** 2) / 6) + 0.25 * math.exp(-((hour - 7.5) ** 2) / 2)
    if weekday in (5, 6):
        base += 0.1
    if cond != "good":
        base *= 0.35
    accepted = 1 if random.random() < min(0.95, base) else 0
    completed = 1 if accepted and random.random() < 0.8 else 0
    rows.append([hour, weekday, code, temp, to_sunset, cond, accepted, completed])

with OUT.open("w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(HEADER)
    w.writerows(rows)
print(f"wrote {len(rows)} synthetic rows to {OUT}")
