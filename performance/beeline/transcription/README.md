# Local call transcription speed in beeline

Measured 2026-11-13.

## Why it was run

The owner wanted to show a potential client a working demo of beeline, and asked how fast it transcribes calls.
beeline recognises speech on the user's own machine, on the CPU, with no GPU and no cloud service.

The question: is CPU-only local recognition fast enough to keep up with a call center's daily volume?

The decision it fed: ship local transcription in beeline 0.1.0, without a GPU or a cloud service.

## Setup

- **Engine.** `sherpa-onnx` 2.0.0 compiled to WebAssembly, on the CPU, 1 thread.
- **Model.** `gigaam-v3`, Russian with punctuation, about 232 MB.
- **Audio.** Real stereo calls from the owner's account. Channel 0 is the manager and channel 1 is the client. Each
  channel is recognised separately.
- **beeline.** A build of beeline-cli 0.1.0 (cli-core 0.647.0) from a local checkout.
- **Machine.** The owner's laptop: AMD Ryzen AI 9 HX 470 (24 threads), 30 GB RAM, Linux 7.0 (Ubuntu), Node
  v24.19.0.
- **Run.**

  ```sh
  performance/beeline/transcription/run.sh <profile> <beeline-cli checkout> [calls]
  ```

  [run.sh](run.sh) reads the profile's token from the system keyring. It then runs beeline in a throwaway `HOME`
  with D-Bus turned off, so the run does not touch the owner's own store or keyring entry. The model folder is
  linked in from the real one, so the model is not downloaded again. The script syncs the calls of the last two
  days, then times `beeline <profile> meetings transcribe --max-meetings <calls> --json`. The time is wall time
  for the whole command. The audio length comes from the command's own `audio_seconds` total.

## Results

| Audio | Wall time | Speed |
|---|---|---|
| 1644 s (27.4 min) | 222 s (3.7 min) | 7.4× faster than real time |

The run used the owner's real calls, so this page gives totals only. It has no call ids, names, phone numbers or
text.

## What it showed

- One CPU thread transcribes about 7 hours of calls in one hour of work.
- The owner took that as fast enough for a call center's daily volume, so beeline 0.1.0 ships local transcription
  with no GPU and no cloud service.

## Not measured

- Several threads.
- Accuracy. There was no word error rate check.
- macOS and Windows.
- Calls longer than 60 minutes.
- Memory use.
