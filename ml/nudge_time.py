#!/usr/bin/env python3
"""
Smart nudge timing for Side Quest, with TabPFN.

Reads the journal CSV exported from the app (Journal -> "Export CSV"),
trains TabPFN's in-context tabular classifier on "did I accept the quest?",
and writes the predicted acceptance probability for every hour of the day to
public/best_hours.json. The app reads that file to decide when a nudge is
worth sending; without it, the app uses a heuristic.

Everything runs locally. The CSV has no locations and no photos.

    pip install -r ml/requirements.txt
    python ml/nudge_time.py --csv ml/sample_journal.csv
    python ml/nudge_time.py --csv ~/Downloads/side-quest-journal-2026-10-12.csv

Columns: hour, weekday, weather_code, temperature_c, minutes_to_sunset,
conditions, accepted, completed
"""

from __future__ import annotations

import argparse
import csv
import json
import math
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

CONDITIONS = ["good", "rain", "dark", "too-hot", "too-cold", "storm"]
FEATURES = ["hour", "hour_sin", "hour_cos", "weekday", "weather_code", "temperature_c", "minutes_to_sunset", "conditions"]
MIN_ROWS = 12


def _num(value: str, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def load_rows(path: Path) -> list[dict]:
    with path.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"{path} has no rows")
    missing = {"hour", "weekday", "accepted"} - set(rows[0].keys())
    if missing:
        raise SystemExit(f"{path} is missing columns: {', '.join(sorted(missing))}")
    return rows


def featurize(row: dict, fill: dict) -> list[float]:
    hour = int(_num(row["hour"], 12)) % 24
    cond = row.get("conditions") or "good"
    return [
        float(hour),
        math.sin(2 * math.pi * hour / 24),
        math.cos(2 * math.pi * hour / 24),
        _num(row.get("weekday", ""), 0),
        _num(row.get("weather_code", ""), fill["weather_code"]),
        _num(row.get("temperature_c", ""), fill["temperature_c"]),
        _num(row.get("minutes_to_sunset", ""), fill["minutes_to_sunset"]),
        float(CONDITIONS.index(cond)) if cond in CONDITIONS else 0.0,
    ]


def typical_context(rows: list[dict]) -> dict:
    """Median weather/temperature, and the typical sunset clock time."""

    def med(key: str, default: float) -> float:
        vals = [_num(r.get(key, ""), math.nan) for r in rows]
        vals = [v for v in vals if not math.isnan(v) and v >= 0] if key == "weather_code" else [v for v in vals if not math.isnan(v)]
        return statistics.median(vals) if vals else default

    sunsets = []
    for r in rows:
        m = _num(r.get("minutes_to_sunset", ""), math.nan)
        if not math.isnan(m):
            sunsets.append(int(_num(r["hour"], 12)) * 60 + m)
    return {
        "weather_code": med("weather_code", 1),
        "temperature_c": med("temperature_c", 25),
        "sunset_minute_of_day": statistics.median(sunsets) if sunsets else 18 * 60 + 15,
        "minutes_to_sunset": 120,
    }


def query_rows(ctx: dict) -> list[tuple[int, dict]]:
    """One synthetic row per (hour, weekday) under typical conditions."""
    out = []
    for hour in range(24):
        # Same convention as the training rows: minutes from the top of the hour.
        to_sunset = ctx["sunset_minute_of_day"] - hour * 60
        cond = "good" if to_sunset > 30 and hour >= 6 else "dark"
        for weekday in range(7):
            out.append(
                (
                    hour,
                    {
                        "hour": hour,
                        "weekday": weekday,
                        "weather_code": ctx["weather_code"],
                        "temperature_c": ctx["temperature_c"],
                        "minutes_to_sunset": to_sunset,
                        "conditions": cond,
                    },
                )
            )
    return out


def hourly_probabilities(rows: list[dict], make_classifier) -> list[float]:
    ctx = typical_context(rows)
    X = [featurize(r, ctx) for r in rows]
    y = [int(_num(r["accepted"], 0)) for r in rows]
    if len(set(y)) < 2:
        raise SystemExit("Need at least one accepted and one declined quest to learn anything.")
    clf = make_classifier()
    clf.fit(X, y)
    queries = query_rows(ctx)
    proba = clf.predict_proba([featurize(q, ctx) for _, q in queries])
    classes = list(getattr(clf, "classes_", [0, 1]))
    pos = classes.index(1)
    sums = [0.0] * 24
    counts = [0] * 24
    for (hour, _), p in zip(queries, proba):
        sums[hour] += float(p[pos])
        counts[hour] += 1
    return [round(s / c, 4) for s, c in zip(sums, counts)]


def tabpfn_classifier():
    try:
        from tabpfn import TabPFNClassifier
    except ImportError as e:  # pragma: no cover
        raise SystemExit("TabPFN is not installed. Run: pip install -r ml/requirements.txt") from e
    # Small journals are exactly what TabPFN is built for: no training loop,
    # no tuning, it does in-context learning over the rows in one pass.
    return TabPFNClassifier(device="auto")


def main(argv: list[str] | None = None) -> int:
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--csv", type=Path, default=here / "sample_journal.csv")
    p.add_argument("--out", type=Path, default=here.parent / "public" / "best_hours.json")
    p.add_argument("--print", action="store_true", help="print the hourly table")
    args = p.parse_args(argv)

    rows = load_rows(args.csv)
    if len(rows) < MIN_ROWS:
        print(f"Only {len(rows)} rows; the app's heuristic is better than a model on this little data. Keep questing.")
        return 0

    probs = hourly_probabilities(rows, tabpfn_classifier)
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": "TabPFNClassifier",
        "rows": len(rows),
        "hours": [{"hour": h, "pAccept": p} for h, p in enumerate(probs)],
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    best = sorted(range(24), key=lambda h: -probs[h])[:3]
    print(f"Trained on {len(rows)} quests. Best hours: {', '.join(f'{h:02d}:00' for h in sorted(best))}")
    print(f"Wrote {args.out}")
    if args.print:
        for h, pr in enumerate(probs):
            print(f"{h:02d}:00  {'#' * int(pr * 40):<40} {pr:.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
