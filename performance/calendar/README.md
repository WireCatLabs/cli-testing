# Calendar

Measurements of gcal, the Google Calendar CLI, and the calendar engine and store in cli-core that it runs on.

- [gcal-baseline](gcal-baseline/README.md): gcal 0.1.1 next to drive, memo and tg. Its starts take about twice as long,
  since it ships unbundled and loads 1,099 files. A 5k–50k event synthetic store is synced through a fake Google
  API: preparing every statement again makes the first sync 3–5 times slower than it needs to be. The page also
  covers one commit per repeating event, the unbounded `events list` query, the MCP start, and an interrupted
  `--rescan` that skips calendars (2026-10-30).
- [sync-and-read-fixes](sync-and-read-fixes/README.md): the cli-core fixes for three of those costs, before and after.
  A full round commits 123 times instead of 1,663, the next day's full round asks 0 series for their slots instead of
  819 and takes 6.7 s instead of 15.1 s, `events list` takes 2 ms instead of 12.5 and `people list` 15 ms instead of 83
  (20,000 events, 2026-10-31).
