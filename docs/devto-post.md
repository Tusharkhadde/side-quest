---
title: "Side Quest: a local Gemma agent that notices I've been on a screen too long and sends me outside"
published: false
tags: devchallenge, hf26challenge, opensource, ai
cover_image: # [PLACEHOLDER: upload a cover, e.g. the stamp screen or a photo from your quest]
---

<!--
  Draft for Tushar. Everything inside [PLACEHOLDER: ...] needs your real
  content before publishing. Please don't publish the "I took it outside"
  section until you have actually done the quests: the judges asked for it,
  and they will be able to tell.
-->

*This is a submission for the [Hacktoberfest Open-Source AI Challenge Week 1: Touch Grass](https://dev.to/challenges/hacktoberfest-week1-2026-10-05)*

## What I Built

Most apps that care about your screen time show you a number. A chart, a weekly report, a red badge. You look at it on a screen, feel bad for a second, and keep scrolling.

I wanted the opposite: something that notices the streak and hands you a reason to stand up.

**Side Quest** is a small, local-first agent. When you've been on a screen for a long unbroken stretch (90 minutes by default), it offers you a 20-minute quest outside. Not "go for a walk", but something specific to where you are right now:

> **Three Shades of Leaf** · 5 min walk to the park
> 1. Walk slowly to the biggest tree you can see and stand under it.
> 2. Find three fallen leaves in three different colours.
> 3. Close your eyes and count four different sounds around you.
>
> *Stay safe:* Stay on paths and keep one ear free for cycles and traffic.
> *Proof photo:* Your three fallen leaves side by side in your palm.

To write that, it checks the weather, the chance of rain and **how many minutes of daylight are left**, finds parks, gardens, water and footpaths within walking distance, and asks Gemma to pick one place and write three short steps you do with your senses.

Then you tap **Go dark**. The screen turns black and the quest continues by voice: one step at a time, tap anywhere for the next. When you're done, you take one photo, Gemma's vision model checks it against the proof it asked for, and you get a stamp in your journal.

If it's raining, getting dark, dangerously hot or stormy, it doesn't pretend. You get an *indoor-adjacent* quest (balcony, terrace, stairwell window) and it's labelled that way. That decision is made by plain code before the model is asked anything, and the model isn't allowed to overrule it.

It's for anyone whose work or study happens on a screen: students, developers, people who lose an afternoon without noticing. The whole point is that the screen is the shortest part of the experience.

## Demo

[PLACEHOLDER: embed your demo video. A good 60–90 second cut: Home ring → "Give me a quest" → quest card → Go dark → black screen with voice → photo → stamp → journal.]

[PLACEHOLDER: live link, if you deploy it. Note that the live version needs a model server; or deploy with DEMO_MODE=1 and say so.]

| Quest | Voice mode | Stamp |
| --- | --- | --- |
| [PLACEHOLDER: screenshot] | [PLACEHOLDER: screenshot] | [PLACEHOLDER: screenshot] |

## Code

{% github Tusharkhadde/side-quest %}

## How I Built It

**The model.** Quests are written by **Gemma 3n E4B** (`gemma3n:e4b`) running in **Ollama** on my own machine. Photo checks need image input, and Ollama's Gemma 3n build is text-only today, so the vision step uses **Gemma 4 E4B** (`gemma4:e4b`). Both are a single environment variable, so swapping in a bigger or smaller Gemma is one line.

**The agent loop.** It's deliberately small and boring, because boring is what you want from something that tells people where to walk:

1. **Gather (on the device).** Browser geolocation, then [Open-Meteo](https://open-meteo.com) for temperature, rain probability, sunrise and sunset, and the [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) for parks, gardens, water and named footpaths nearby. No API keys anywhere.
2. **Decide (in code).** `classifyConditions()` returns `good`, `rain`, `dark`, `too-hot`, `too-cold` or `storm`. The quest has to fit before sunset with a 10-minute buffer, and the walk there can use at most about a third of the quest. Up to three candidate places survive, preferring different kinds (a park, some water, a path) so Gemma has a real choice.
3. **Generate (Gemma).** The model gets the rules' verdict, a one-line weather summary and the candidates, and must return strict JSON: title, place id, intro, exactly three steps of type observe/collect/notice/move/listen, a safety line and a proof criterion. A zod schema checks it, plus a context-aware check that the place id is a real candidate and that bad weather produced an indoor-adjacent quest. If validation fails, the errors go back to Gemma for a repair attempt. If the model is unreachable, a hand-written quest for that kind of place is used, and the UI says so.
4. **Run (voice).** Voice mode uses the free Web Speech API, with an optional ElevenLabs voice if you set a key. A screen wake lock keeps it alive; the display stays black.
5. **Verify (Gemma vision).** The photo is resized to 768px in the browser and sent with the proof criterion. Gemma answers `{ pass, comment, confidence }` and is told to be generous but honest, and never to comment on people.

**Noticing the streak.** The PWA tracks continuous active time with the Page Visibility API and input events, resetting after five idle minutes. Since a web app can only see its own tab, there's also a tiny zero-dependency Node watcher that reads OS idle time (`ioreg` on macOS, `xprintidle` on Linux X11, `GetLastInputInfo` on Windows) and opens a quest after 90 minutes of activity. I've documented its limits honestly: it measures input, not attention, and Wayland isn't supported.

**Smart nudge timing with TabPFN.** The journal exports a CSV of hour, weekday, weather, minutes to sunset and whether you accepted. A small Python script trains **TabPFN** on it, which is a good fit precisely because a personal journal is tiny: dozens of rows, not thousands, and TabPFN does in-context learning over them with no training loop to tune. It writes the predicted acceptance probability for each hour to `best_hours.json`, which the app reads to decide whether *now* is a good moment. Without that file, a heuristic blends a daylight-shaped prior with your own accept rate per hour.

**The stack.** Next.js 15 (App Router) + TypeScript + Tailwind as an installable PWA. A service worker caches the app shell and the active quest lives in local storage, so once a quest is written, voice mode works with no signal. Everything you generate (journal, photos, stats) lives in IndexedDB in your browser. There are no accounts.

**Deploying.** `docker compose up` runs the app next to an Ollama container. For a hosted version, the app runs on **DigitalOcean App Platform** and Gemma runs on a **DigitalOcean GPU Droplet**, connected through Ollama's OpenAI-compatible endpoint; any OpenAI-compatible Gemma server plugs into the same three variables.

[PLACEHOLDER: one or two sentences about something that surprised you while building, e.g. a prompt change that made the quests better, or a bug in the sunset maths. Only if it really happened.]

## Why Does Open Innovation Matter?

Two of the most personal signals a phone has are **how long you stare at it** and **where you are**. This app needs both. With a closed API, the honest privacy story would be "trust us". With an open model running locally, it's a property of the architecture:

- **Screen time never leaves the device.** It sits in local storage and a JSON file in your home folder.
- **Your exact location never leaves the browser.** Weather and park lookups receive a point rounded to about 1 km; distances are computed on the device. Gemma receives place names and a weather summary, never coordinates. There's a test that checks the prompt contains no coordinates.
- **The photo goes to my own model, not a third party,** for one check, and is only stored in my browser.
- **It costs ₹0 per quest.** On a closed API, every quest and every photo check is a metered call. On my laptop, it's electricity.
- **It survives a trail with no signal.** The quest is written before you leave, and voice mode needs nothing from the network.
- **The model is mine to change.** `gemma3n:e2b` for an older laptop, Gemma 4 for sharper vision, a 12B on a GPU Droplet, or a fine-tune on quests I actually enjoyed. It's an environment variable, not a vendor decision.

**Where open beat closed, specifically:** [PLACEHOLDER: write this from your own experience. Ideas to check against what actually happened: Did running Gemma locally let you iterate on prompts without worrying about cost? Did the JSON repair loop work well with a small model? Did offline voice mode actually hold up? Keep it concrete and true.]

## I Took It Outside

[PLACEHOLDER: This section is the one the judges asked for: "Bonus points if you take it outside, use it, and tell us how it went." Fill it only with what really happened.]

- **Quest 1:** [PLACEHOLDER: date, time of day, weather, which place Gemma picked and why you think it picked it]
  - What the three steps were: [PLACEHOLDER]
  - What you actually noticed: [PLACEHOLDER]
  - The proof photo and Gemma's verdict: [PLACEHOLDER: photo + the exact comment it gave]
- **Quest 2:** [PLACEHOLDER]
- **What didn't work:** [PLACEHOLDER: e.g. a park that turned out to be locked, a voice that sounded robotic, a photo it wrongly rejected. Honest failures make this section credible.]
- **What I'd change next:** [PLACEHOLDER]

## My Agent Session

[PLACEHOLDER: optional. If you saved the build session with DevRelay, embed it here with the agent_session tag described on the challenge page, or link to it. Otherwise delete this section.]

## Prize Categories

- **Best Use of Gemma:** Gemma 3n E4B writes every quest through a validated JSON contract with a self-repair loop; Gemma 4 E4B verifies the proof photo. Both run locally in Ollama.
- **Best Use of DigitalOcean:** [PLACEHOLDER: keep only if you actually deploy it there. App Platform spec is in `.do/app.yaml`; Gemma on a GPU Droplet via `LLM_BASE_URL`.]
- **Best Use of TabPFN:** `ml/nudge_time.py` learns which hours you say yes to a quest from your own exported journal and feeds `best_hours.json` back into the app. [PLACEHOLDER: keep only after you've run it on your own journal or the sample; mention which.]
- **Best Use of ElevenLabs:** optional ElevenLabs voice for the screen-off quest, streamed through `/api/tts`. [PLACEHOLDER: keep only if you set a key and used it.]
- **Best Use of Render:** [PLACEHOLDER: only if you deploy with `render.yaml`.]
- **Best Use of Entire:** [PLACEHOLDER: only if you actually used Entire while building. Otherwise remove this line.]

Thanks for reading. Now close the laptop for twenty minutes. 🌿

#hf26challenge
