---
title: "Side Quest: an open-weight Gemma agent that notices I've been on a screen too long and sends me outside"
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

**Side Quest** is a small agent built on open-weight models. When you've been on a screen for a long unbroken stretch (90 minutes by default), it offers you a 20-minute quest outside. Not "go for a walk", but something specific to where you are right now:

> **Three Shades of Leaf** · 5 min walk to the park
> 1. Walk slowly to the biggest tree you can see and stand under it.
> 2. Find three fallen leaves in three different colours.
> 3. Close your eyes and count four different sounds around you.
>
> *Stay safe:* Stay on paths and keep one ear free for cycles and traffic.
> *Proof photo:* Your three fallen leaves side by side in your palm.

To write that, it checks the weather, the chance of rain and **how many minutes of daylight are left**, finds parks, gardens, water and footpaths within walking distance, and asks **Gemma**, Google's open-weight model, to pick one place and write three short steps you do with your senses.

Then you tap **Go dark**. The screen turns black and the quest continues by voice: one step at a time, tap anywhere for the next. When you're done, you take one photo, Gemma (it's multimodal) checks it against the proof it asked for, and you get a stamp in your journal. Every quest says which open model wrote it.

If it's raining, getting dark, dangerously hot or stormy, it doesn't pretend. You get an *indoor-adjacent* quest (balcony, terrace, stairwell window) and it's labelled that way. That decision is made by plain code before the model is asked anything, and the model isn't allowed to overrule it.

It's for anyone whose work or study happens on a screen: students, developers, people who lose an afternoon without noticing. The whole point is that the screen is the shortest part of the experience.

## Demo

[PLACEHOLDER: embed your demo video. A good 60–90 second cut: Home ring → "Give me a quest" → quest card → Go dark → black screen with voice → photo → stamp → journal.]

[PLACEHOLDER: live link on DigitalOcean App Platform, once deployed. Judges can tap "Try a demo quest" (sample afternoon in Pune) without granting location.]

| Quest | Voice mode | Stamp |
| --- | --- | --- |
| [PLACEHOLDER: screenshot from your phone, or docs/screenshots/02-quest.png] | [PLACEHOLDER: screenshot, or docs/screenshots/04b-voice-step.png] | [PLACEHOLDER: screenshot of a real stamp from your own quest] |

## Code

{% github Tusharkhadde/side-quest %}

## How I Built It

**The models.** Everything the agent writes or judges comes from open-weight models, called through hosted APIs so nobody needs a GPU to try it:

- **Gemma 4 26B A4B** (`gemma-4-26b-a4b-it`) on Google's **Gemini API** writes every quest *and* checks the proof photo, because Gemma 4 takes images. It's a mixture-of-experts model, so it's quick, and the AI Studio free tier means a quest costs nothing.
- If Gemma is rate-limited, slow or returns junk, the request falls through to **DigitalOcean serverless inference**: **Gemma 4 31B** for text and **NVIDIA Nemotron Nano 12B v2 VL** (also open weights) for photos, through DigitalOcean's OpenAI-compatible endpoint.
- If everything is down, a deterministic built-in model answers so the app never dead-ends, and the UI says so.

The order is one env var, `LLM_PROVIDERS=gemma-google,do-gradient,demo`. The quest screen shows "Quest written by Gemma 4 26B A4B · open weights · via Google Gemini API", and a "What left your device" panel lists every hop, including providers that were tried and failed.

I originally planned Gemma 3 27B, but Google's Gemma-on-Gemini-API page now lists only Gemma 4 models, so the defaults moved to Gemma 4. [PLACEHOLDER: keep this sentence only if you want to mention it.]

**Making an open model behave like an API.** The Gemma provider sends a system instruction, the photo as an inline JPEG part, JSON mode and a minimal thinking level. If the API rejects any of those with a 400 (older Gemma builds didn't accept system instructions), it retries once with the system prompt folded into the user turn and remembers. Either way, the reply goes through a forgiving JSON extractor (code fences, chatter, trailing commas, smart quotes), a zod schema, and a context-aware check (the place id must be a real candidate; bad weather must produce an indoor-adjacent quest). Validation errors are sent back to the model to fix its own answer, up to three tries, before the next provider gets a turn. All of this is covered by tests with a fake `fetch` that assert the exact request shape, including the image parts.

**The agent loop.** It's deliberately small and boring, because boring is what you want from something that tells people where to walk:

1. **Gather (on the phone).** Browser geolocation, then [Open-Meteo](https://open-meteo.com) for temperature, rain probability, sunrise and sunset, and the [OpenStreetMap Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API) for parks, gardens, water and named footpaths nearby. Both only ever see a point rounded to about 1 km.
2. **Decide (in code).** `classifyConditions()` returns `good`, `rain`, `dark`, `too-hot`, `too-cold` or `storm`. The quest has to fit before sunset with a 10-minute buffer, and the walk there can use at most about a third of the quest. Up to three candidate places survive, preferring different kinds so Gemma has a real choice.
3. **Generate (Gemma).** The model gets the rules' verdict, a one-line weather summary and the candidates, and must return strict JSON: title, place id, intro, exactly three steps of type observe/collect/notice/move/listen, a safety line and a proof criterion.
4. **Run (voice).** Voice mode uses the free Web Speech API, with an optional ElevenLabs voice if a key is set. A screen wake lock keeps it alive; the display stays black.
5. **Verify (Gemma vision).** The photo is resized to 768 px in the browser and sent with the proof criterion. The model answers `{ pass, comment, confidence }` and is told to be generous but honest, and never to comment on people.

**Noticing the streak.** The PWA tracks continuous active time with the Page Visibility API and input events, resetting after five idle minutes. Since a web app can only see its own tab, there's also a tiny zero-dependency Node watcher that reads OS idle time (`ioreg` on macOS, `xprintidle` on Linux X11, `GetLastInputInfo` on Windows) and opens a quest after 90 minutes of activity. It measures input, not attention, and Wayland isn't supported.

**Smart nudge timing with TabPFN.** The journal exports a CSV of hour, weekday, weather, minutes to sunset and whether you accepted. A small Python script trains **TabPFN** on it, which fits a personal journal well: dozens of rows, not thousands, and TabPFN does in-context learning over them with no training loop to tune. It writes the predicted acceptance probability per hour to `best_hours.json`, which the app reads to decide whether *now* is a good moment.

**Judge-friendly by design.** "Try a demo quest" runs the full flow with a sample afternoon in Pune: a bundled OpenStreetMap snapshot around Sarasbaug and a sample forecast, so it works without location permission. The model call is still real.

**The stack.** Next.js 15 (App Router) + TypeScript + Tailwind as an installable PWA. All model calls happen in server routes, so keys never reach the browser. A service worker caches the app shell and the active quest lives in local storage, so once a quest is written, voice mode works with no signal. Journal, photos and stats live in IndexedDB. There are no accounts.

**Deploying.** The app runs on **DigitalOcean App Platform** (there's a Deploy to DigitalOcean button and a `.do/app.yaml` with the keys as encrypted secrets). No GPU needed, since the models are hosted. `render.yaml` and a Dockerfile are there too, plus an optional Ollama profile for anyone who wants to run the same Gemma weights on their own machine.

[PLACEHOLDER: one or two sentences about something that surprised you while building, e.g. a prompt change that made the quests better, or how often the JSON repair loop actually kicked in. Only if it really happened.]

## Why Does Open Innovation Matter?

I don't run the model on my own laptop for this; Gemma is hosted. So why does it matter that the weights are open? Because hosting is a choice I can undo, not a dependency I'm stuck with:

- **No lock-in.** The same Gemma weights are published for anyone to download. If the free tier changes or a provider disappears, the app moves to DigitalOcean, another host, a GPU Droplet or a laptop by editing one env var. Nothing in the prompts, schemas or UI is vendor-specific, and the fallback chain already exercises two providers.
- **Self-hosting is a real option, not a slogan.** `LLM_PROVIDERS=ollama` runs the exact same flow with nothing leaving my hardware. That matters for an app that handles where you are and a photo of where you've been.
- **I can fine-tune it.** The journal already records which quests people finish and which they skip. That's a dataset for a small LoRA on the same Gemma, served by the same code path.
- **I can read what I'm running.** Gemma has a public model card, licence and prohibited-use policy. Nemotron's weights are open too.
- **It's cheap enough to give away.** A quest on the Gemma free tier costs nothing; on DigitalOcean it's a fraction of a cent per call, with no GPU sitting idle.

Hosted does mean some data leaves the phone, so the app is specific about it instead of vague:

- **Exact GPS never leaves the browser.** Weather and park lookups get a point rounded to about 1 km. The model gets place names and a weather summary, never coordinates, and distances to parks are rounded to 250 m so three of them can't be used to trilaterate you. There's a test for both.
- **Screen time stays local.** The server only hears "110 minutes on screen", never the history.
- **The photo is sent once, only when you ask for a check,** as a small 768 px copy, and the server never stores it.
- **Every quest has a "What left your device" panel** listing each request, what it carried and why.
- **Provider terms differ, and I say so.** On the Gemini API free tier, Google says inputs may be used to improve its products; DigitalOcean says it doesn't store or train on inference data. You can route photos to DigitalOcean with one env var, or self-host.

**Where open beat closed, specifically:** [PLACEHOLDER: write this from your own experience. Ideas to check against what actually happened: Did the provider fallback ever kick in while you used it? Did swapping Gemma 4 26B for 31B (or for Nemotron on photos) change the quests? Did the free tier let you iterate on prompts without counting cost? Keep it concrete and true.]

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

- **Best Use of Gemma:** Gemma 4 26B A4B, served through the Gemini API, writes every quest through a validated JSON contract with a self-repair loop and also checks the proof photo with its image input. Gemma 4 31B on DigitalOcean is the first fallback, so Gemma answers even when one host is down.
- **Best Use of DigitalOcean:** the app is hosted on DigitalOcean App Platform (Deploy to DigitalOcean button, `.do/app.yaml`), and DigitalOcean serverless inference serves the open-weight fallback models (Gemma 4 31B for text, Nemotron Nano 12B v2 VL for photos). [PLACEHOLDER: add your live App Platform URL once deployed, and keep this line only if you actually deploy there.]
- **Best Use of TabPFN:** `ml/nudge_time.py` learns which hours you say yes to a quest from your own exported journal and feeds `best_hours.json` back into the app. [PLACEHOLDER: keep only after you've run it on your own journal or the sample; say which.]
- **Best Use of ElevenLabs:** optional ElevenLabs voice for the screen-off quest, streamed through `/api/tts`. [PLACEHOLDER: keep only if you set a key and actually used it.]

Thanks for reading. Now close the laptop for twenty minutes. 🌿

#hf26challenge
