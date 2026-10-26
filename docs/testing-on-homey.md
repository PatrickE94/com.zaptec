# Testing on a real Homey

How to run a development build on your own Homey, read its logs and state,
and walk through the flows that matter. Unit tests (`npm test`) cover the
API client; everything that touches devices, pairing or repair needs a real
Homey.

## Prerequisites

- Log in once with the Homey CLI: `npx homey login`, then pick your Homey
  with `npx homey select`. The CLI stores its session in
  `~/.athom-cli/settings.json`.
- `npx` downloads the CLI on first use, no global install needed.

## Run a development build

```sh
npx homey app run --remote 2>&1 | tee homey-run.log
```

- `--remote` runs the app on the Homey itself (not in local Docker), against
  your real devices, and streams its stdout/stderr to the terminal.
- It replaces the installed App Store version. Devices and settings are kept.
- `tee` keeps a copy of the log to grep through later.

### Stopping and redeploying

**Don't stop it with Ctrl+C.** Quitting `homey app run` uninstalls the app
from the Homey, which can remove your devices and break flows using them.

Kill the CLI hard instead. It can't clean up, so the app keeps running on the
Homey and the devices stay:

```sh
ps -eo pid,args | grep "homey app run --remote" | grep -v grep | awk '{print $1}' | xargs -r kill -9
```

To redeploy, kill it like this and start `homey app run --remote` again.

To leave a build installed for good (e.g. before ending a session), use
`npx homey app install`. It installs without streaming logs and survives the
CLI exiting.

## Logging

| Call | Goes to |
|---|---|
| `this.log(...)` | app stdout, streamed by `homey app run` |
| `this.logToDebug(line)` | the device's debug log (the `log` setting, last 50 lines, flushed every minute) and stdout |
| `this.logToDebug(line, error)` | the same one line in the debug log, plus the full error with stack and `cause` on stdout |

- Pass the error object when logging failures, not just `${e}`. Interpolating
  an error drops its stack and `cause`.
- Polls only log failures, except `Polled charger state (N values)` on
  stdout, so a quiet log with those lines means polling is healthy.
- Errors from network calls arrive from the Homey runtime serialized as
  `{ $__type: 'Error', data: { code, message } }`, not as an `Error`. Read
  them through `networkErrorDetails()` in `lib/zaptec/api.ts`.

### Watching for failures

```sh
tail -F homey-run.log | sed -u 's/\x1b\[[0-9;]*m//g' \
  | grep --line-buffered -E "Failed to|rejected|No credentials|Could not reach|\[err\]|^[[:space:]]|^\}|cause"
```

The last patterns keep the indented stack and `cause` lines of an error.

## Reading device and app state

The Homey Web API accepts the CLI's token. Read state with it instead of
guessing from logs, and never print the password or tokens:

```python
import json, urllib.request

d = json.load(open('/home/<you>/.athom-cli/settings.json'))
homey_id = d['activeHomey']['id']
token = d['homeyApi'][f'homey-{homey_id}']['token']
base = 'https://<homey-ip-with-dashes>.homey.homeylocal.com'  # shown by `homey app run`

def get(path):
    req = urllib.request.Request(base + path, headers={'Authorization': f'Bearer {token}'})
    return json.load(urllib.request.urlopen(req, timeout=15))

dev = get('/api/manager/devices/device/<device-id>')
print(dev['available'], dev.get('unavailableMessage'))
print(dev['settings']['log'])                     # the device debug log
print(sorted(dev['capabilitiesObj']))             # capabilities
accounts = get('/api/manager/apps/app/com.zaptec/setting').get('accounts') or {}
print(len(accounts))                              # number of stored accounts, not their passwords
```

Device IDs appear in the log as `[Device:<id>]`.

- `lastUpdated` on a capability only changes when the value changes, so it
  doesn't prove a poll ran. Use the `Polled charger state` log line.
- To remove the stored accounts (to test missing credentials), send
  `DELETE /api/manager/apps/app/com.zaptec/setting/accounts`, then restart
  the app so the shared client drops the credentials it holds in memory.

## Flows to verify

After changes to credentials, pairing, repair or polling, walk through these
and check the log and stored state after each:

| Flow | What to do | Expect |
|---|---|---|
| Startup | redeploy | device initializes, `Polled charger state` every 30 s |
| Migration | start with a device that still has `password` in its settings | password moves to `accounts`, device `password` setting is empty |
| Missing credentials | delete `accounts`, redeploy | one `No credentials stored…` line, device unavailable with the repair message, no requests |
| Repair | device → settings → Repair, log in | `Device credentials updated`, polls resume within seconds, `Keeping account…` |
| Cancelled pairing | start pairing, log in, cancel | nothing stored |
| Delete | delete the last device on an account | `Forgot an account no device uses`, `accounts` empty |
| Pairing | pair and add a charger | device starts, moves the password to `accounts`, polls succeed |

Deleting a device removes it from every flow that uses it, and pairing it
again creates a new device. Only run the delete and pairing flows when that's
acceptable.

## Gotchas

- The pairing session's `disconnect` handler fires *before* `add_devices`
  creates the devices, so don't clean up credentials there.
- `nock` silently drops errors that aren't `Error` instances, so it can't
  reproduce the Homey's serialized errors. Test such handling directly.
- `locales/*.json` use CRLF line endings. Keep them when editing.
