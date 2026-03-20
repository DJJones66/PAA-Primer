# Getting Started with OpenRouter

This guide explains how to use this build with OpenRouter if you already have an OpenRouter API key.

This version uses Docker as the main setup path.

## What You Need

Before you start, make sure you have:

1. Docker
2. Git
3. An OpenRouter API key
4. Internet access, because OpenRouter is an online provider

## Step 1 - Open the Build Folder

Open a terminal and move into the `build/` folder:

```bash
cd build
```

## Step 2 - Update the Adapter File for OpenRouter

Open this file:

```text
adapters/openai-compatible.json
```

Replace its contents with this example:

```json
{
  "base_url": "https://openrouter.ai/api/v1",
  "model": "openai/gpt-4o-mini",
  "api_key_env": "OPENROUTER_API_KEY"
}
```

What these values mean:

- `base_url` tells the build to use OpenRouter
- `model` is the OpenRouter model you want to use
- `api_key_env` is only the name of the environment variable the build will read later when it starts

Important:

- Do not put your real OpenRouter API key inside this JSON file
- The JSON file stores only the variable name, not the secret itself
- Your real API key is passed only in the `docker run` command in Step 4

If you want a different OpenRouter model, change only the `model` value.

## Step 3 - Build the Docker Image

Run:

```bash
docker build -t paa-mvp-build .
```

This creates the image with your updated OpenRouter adapter settings inside it.

You do not put your real API key into the image during this step.

## Step 4 - Start the System with Your API Key (Port Enabled)

Run:

```bash
docker run --rm -it -p 8787:8787 -e OPENROUTER_API_KEY="your-openrouter-api-key" -v "$PWD/your-memory":/app/your-memory --name paa-mvp-build-run paa-mvp-build
```

Replace `your-openrouter-api-key` with your real key.

This is the only step where you provide the real OpenRouter API key.

What this does:

- starts the system inside Docker
- publishes Gateway port `8787` to your host
- gives the container your OpenRouter API key
- keeps your data saved in `build/your-memory/` on your machine

When it is ready, you should see:

```text
PAA MVP ready. Type /exit to quit.
```

## Step 5 - Test That OpenRouter Works

Once the prompt appears, try a simple request such as:

```text
Create a plan for a simple budgeting app
```

or:

```text
Create folder travel-planner with AGENT.md, spec.md, and plan.md
```

If the model responds, the OpenRouter setup is working.

Optional API health check from another terminal:

```bash
curl http://127.0.0.1:8787/health
```

Expected response:

```json
{"status":"ok"}
```

## If You See an Approval Prompt

If the system wants to write files, it may ask for approval.

You may see something like:

```text
Approval needed: memory_write on documents/travel-planner/spec.md
Approve? [y/N]
```

Type `y` if you want to allow the file change.

Press Enter if you do not want to allow it.

## Where Your Results Go

The system stores its work in:

```text
your-memory/
```

The most useful folders are:

- `your-memory/documents/` for created files
- `your-memory/conversations/` for saved conversations
- `your-memory/exports/` for export archives
- `your-memory/preferences/` for preferences and auth state

## How to Stop the System

When you are done, type:

```text
/exit
```

That closes the client and shuts down the server in the container.

## If It Does Not Work

Check these first:

1. Make sure Docker is running
2. Make sure `adapters/openai-compatible.json` uses `https://openrouter.ai/api/v1`
3. Make sure you ran `docker build -t paa-mvp-build .`
4. Make sure you passed a real value for `OPENROUTER_API_KEY`
5. If port `8787` is already in use, stop the other process or change the port mapping
6. Start again with the `docker run` command above

If it still fails, copy the terminal error message and share it with whoever is helping you.
