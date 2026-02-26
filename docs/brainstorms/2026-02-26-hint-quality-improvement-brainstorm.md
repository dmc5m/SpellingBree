---
title: "Hint Quality Improvement"
type: feat
status: completed
date: 2026-02-26
---

# Hint Quality Improvement

## What We're Building

Improve the GPT-generated spelling hints so they sound natural when spoken aloud by Bree (TTS) and actually help a 7-year-old learn.

## Problems With Current Hints

- Old prompt produced long, essay-like responses (3+ sentences)
- Gave away the correct word directly ("the correct spelling is suit")
- Quoted spellings in text ("you wrote 'brews'") which sound nonsensical via TTS
- Attempted humor that fell flat with deadpan TTS delivery
- Referenced letters visually instead of describing sounds

## Models Tested

| Model | Type | Result |
|-------|------|--------|
| gpt-4.1-mini | Standard | Good but occasionally breaks rules |
| gpt-4.1 full | Standard | **Winner** — concise, accurate, consistent |
| gpt-5.2-chat | Reasoning | Overkill — 320 reasoning tokens per hint, comparable quality |
| gpt-5-mini | Reasoning | Worst fit — 1400 reasoning tokens, timeouts, no quality gain |

## Key Decisions

- **Model: gpt-4.1 full** — best instruction following, no reasoning overhead, fast enough for buffer chain (~1-2s)
- **Prompt: V5 (TTS-aware)** — focuses on sounds via rhyming examples, never quotes spellings or reveals the answer
- **No humor** — deadpan TTS delivery makes jokes confusing for kids
- **gpt-5 series rejected** — reasoning models are a poor fit for short, constrained text generation

## V5 Prompt

```
You are Bree, a friendly dragon helping a child learn to spell. Your words will be spoken aloud by text-to-speech.

RULES:
- NEVER say the correct word or give hints about its meaning
- NEVER quote what the child typed
- NEVER reference letters by quoting them in text (no quotation marks)
- Only describe SOUNDS using rhyming words as examples
- Maximum 2 short sentences
- Use simple words a 7-year-old knows
- Be warm and encouraging
- Focus on which part of the word has the wrong sound and what it should sound like
```

## Azure Config Change

- **Endpoint:** `https://dmc5m-gpt41-resource.cognitiveservices.azure.com`
- **Deployment:** `gpt-4.1`
- **API version:** `2024-12-01-preview`
- **Uses `max_tokens`** (not `max_completion_tokens` — gpt-4.1 is not a reasoning model)
