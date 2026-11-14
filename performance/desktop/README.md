# Desktop

Measurements of WireCat Desktop, the app that runs the CLIs for the owner.

- [page-speed](page-speed/README.md): what each page waits for on a real store. A warm memo server answers in 30 to
  330 ms what a fresh process answers in 650 to 960 ms, `people list` takes 3.7 to 4.2 s for any limit, and clicks in
  a production build paint in 24 to 96 ms (2026-11-10).
- [documents-meetings](documents-meetings/README.md): cli-core's listings for the Documents and Meetings pages on a
  synthetic heavy store. Every read a page makes on open stays under 150 ms at p95; a month of the calendar takes
  134 ms; a year in one read takes about 600 ms (2026-11-13).
