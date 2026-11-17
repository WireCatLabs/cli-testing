# Engineering quality

Use these reviews when deciding where a refactor will make development easier.
They assess responsibility, dependency direction and the work needed to change a feature.

- [CLI code structure](code-quality/README.md): MAX and the shared library, with a reproducible
  source inventory and separately labelled validation results.
- [Architecture checks](architecture-checks/README.md): the lint rules each CLI enforces, files over
  500 lines with a verdict each, and a table re-measured every month to show the trend.
- [Hand-written code in a new CLI](new-cli-lines/README.md): hubspot-cli, made from the template with
  generated API and shared CRM sync, against bitrix24-cli and amo-cli, line by line.
