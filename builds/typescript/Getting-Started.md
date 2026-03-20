# Getting Started

This guide is the simplest Docker setup path for this build.

The current default adapter uses OpenRouter.

## What You Need

1. Docker
2. Git
3. OpenRouter API key
4. Internet access (OpenRouter is online)

## Step 1 - Open the Build Folder

```bash
cd build
```

## Step 2 - Build the Docker Image

```bash
docker build -t paa-mvp-build .
```

## Step 3 - Start the Container (Port Enabled)

```bash
docker run --rm -it -p 8787:8787 -e OPENROUTER_API_KEY="Add your key" -v "$PWD/your-memory":/app/your-memory --name paa-mvp-build-run paa-mvp-build
```

Replace `"Add your key"` with your real key.

What this command does:
- Publishes Gateway port `8787` to your host
- Passes your OpenRouter key into the container
- Persists memory files in `build/your-memory`

## Step 4 - Confirm It Started

When startup completes, you should see:

```text
PAA MVP ready. Type /exit to quit.
```

Optional quick check from another terminal:

```bash
curl http://127.0.0.1:8787/health
```

Expected response:

```json
{"status":"ok"}
```

## Step 5 - Try a Few Commands

```text
Create a plan for a simple budgeting app
```

```text
Create folder travel-planner with AGENT.md, spec.md, and plan.md
```

```text
Export memory now
```

## Where Files Are Saved

All runtime data is written to:

```text
your-memory/
```

Key folders:
- `your-memory/documents/`
- `your-memory/conversations/`
- `your-memory/exports/`
- `your-memory/preferences/`

## Stop the System

In the running terminal:

```text
/exit
```

## Troubleshooting

1. Confirm Docker is running
2. Confirm you used `docker build -t paa-mvp-build .`
3. Confirm `OPENROUTER_API_KEY` is set in the `docker run` command
4. If port `8787` is already in use, stop the other process or change both published and config ports together
