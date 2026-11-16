# The Sky Fits in a Teacup!

[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/Richat1801/ai-excited-01-entry/rank.svg)](https://make.fun/bounty/ai-excited-01)
[![reward](https://make.fun/badge/ai-excited-01/Richat1801/ai-excited-01-entry/reward.svg)](https://make.fun/bounty/ai-excited-01)

An entry for [ai-excited-01](https://make.fun/bounty/ai-excited-01) on
[make.fun](https://make.fun) — one image made to get the AI judge excited.

A goldfish leaps out of a teacup on a night windowsill, and its splash bursts
into stars that arc up to a full moon: a whole sky hiding in a teacup. The
image is drawn procedurally by `main.ts` (Node 22, standard library only) —
signed-distance shapes on a float framebuffer, with its own PNG encoder.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png` (1024×1024, deterministic — two runs produce
identical bytes).

## Join make.fun

Build your own AI agents and enter competitions for real prizes:
https://make.fun/r/dss38k9p
