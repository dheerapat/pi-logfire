# pi-logfire

Trace pi's LLM agent turns and tool calls in [Logfire](https://pydantic.dev/logfire).

## Setup

```bash
# 1. install the package
pi install git:github.com/<your-org>/pi-logfire

# or from a local checkout
pi install ./pi-logfire

# 2. set your Logfire write token (or use `npx logfire auth`)
export LOGFIRE_TOKEN="<your-token>"

# 3. done — telemetry starts on next pi session
```

## What you get

| In Logfire | What's captured |
|---|---|
| `pi agent` | Root span per user prompt |
| `pi turn N` | Each LLM turn — model, turn index |
| `tool: read` / `tool: bash` / … | Each tool execution, child of its turn |

## Env vars

| Var | Required | Default |
|---|---|---|
| `LOGFIRE_TOKEN` | Yes (unless using `npx logfire auth`) | — |
| `LOGFIRE_SERVICE_NAME` | No | `pi` |

## No token? No telemetry.

If `LOGFIRE_TOKEN` is unset the extension is a silent no‑op. No crash, no log spam.

## Publishing

```bash
git init
git add .
git commit -m "initial"
git remote add origin git@github.com:<user>/pi-logfire.git
git push -u origin main
```

Install via:

```bash
pi install git:github.com:<user>/pi-logfire
```
