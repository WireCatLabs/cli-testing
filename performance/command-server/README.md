# Command server

Measurements of `<cli> commands --serve`, the long-running process WireCat Desktop sends its pages' commands to.

- [concurrent](concurrent/README.md): 7 reads through one server, one at a time and at once, against a process for
  each: about 0.1 s against 0.7–1 s, and running them at once saves another 6–54 % (2026-11-10).
