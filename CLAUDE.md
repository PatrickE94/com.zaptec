# Working on this repo

- Test changes to devices, pairing, repair or polling on the real Homey, as
  described in [docs/testing-on-homey.md](docs/testing-on-homey.md).
- Never stop `homey app run` with Ctrl+C or a graceful signal; it uninstalls
  the app. Stop it with `kill -9`.
- Never print passwords or tokens when reading Homey state.
- `locales/*.json` use CRLF line endings; keep them.
