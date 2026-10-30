# Calendar

Measurements of gcal, the Google Calendar CLI, and the calendar engine and store in cli-core that it runs on.

- [gcal-baseline](gcal-baseline/README.md): gcal 0.1.1 next to drive, memo and tg. Its starts take about twice as long,
  since it ships unbundled and loads 1,099 files. A 5k–50k event synthetic store is synced through a fake Google
  API: preparing every statement again makes the first sync 3–5 times slower than it needs to be. The page also
  covers one commit per repeating event, the unbounded `events list` query, the MCP start, and an interrupted
  `--rescan` that skips calendars (2026-10-30).
