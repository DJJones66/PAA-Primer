# How to Use

This guide explains how to set up, start, use, and shut down this build from the `build/` folder.

## What This Build Does

This build is a terminal-based assistant that runs on your machine. You type requests in a command window, and the system responds through the terminal. If the system needs to change files inside its Memory area, it can ask you for approval before those changes happen.

The build stores its working data in the `your-memory/` folder. That includes conversations, documents, preferences, and the bootstrap prompt.

## Before You Start

You need these installed on your computer:

1. Node.js 22 or newer.
2. npm.
3. Git.
4. Docker, if you want to run the Docker version.
5. A local OpenAI-compatible model server, if you want a fully offline setup. The default adapter file is written for a local server at `http://127.0.0.1:11434/v1`.

Open a terminal and move into the build folder:

```bash
cd build
```

## Files You Should Know

- `config.json` controls where Memory lives, which adapter is used, which auth mode is active, and which tool sources are loaded.
- `adapters/openai-compatible.json` controls the model server address, model name, and API key environment variable name.
- `your-memory/` holds the assistant prompt, conversations, saved documents, and preferences.
- `package.json` contains the commands used to build and run the project.

## First-Time Setup

Install the project packages:

```bash
npm install
```

Build the project:

```bash
npm run build
```

If your model server needs an API key, set the matching environment variable before starting. The default adapter file expects `OPENAI_API_KEY`. If your local model does not need a key, you can leave it unset.

## Default Local Setup

The build is already configured to use these defaults:

- Memory folder: `./your-memory`
- Adapter: `openai-compatible`
- Conversation store: `markdown`
- Auth mode: `local-owner`
- Tool sources:
  - `memory-tools/file-ops/server.ts`
  - `builtin/auth-tools`
  - `builtin/memory-tools`
- Bind address: `127.0.0.1`

The default adapter file points to:

```text
http://127.0.0.1:11434/v1
```

If your local model uses a different address or port, open `adapters/openai-compatible.json` and update `base_url`.

## Start the Build

### Option 1: Start the full terminal experience

This starts the Gateway server and the interactive terminal client together:

```bash
npm start
```

When it starts correctly, you will see a message like this:

```text
PAA MVP ready. Type /exit to quit.
```

That means the system is ready to accept messages.

### Option 2: Start only the server

If you want the server running without the interactive client:

```bash
npm run start:server
```

### Option 3: Start only the terminal client

Use this only when the server is already running:

```bash
npm run start:cli
```

## How to Use It

After starting with `npm start`, type directly into the terminal prompt.

Example requests:

```text
Create folder fitness and write spec.md
```

```text
Create a plan for a simple budgeting app
```

```text
Export memory now
```

### What happens during a normal request

1. You type a message.
2. The client sends it to the Gateway.
3. The Gateway loads the current conversation.
4. The Engine sends the request to the model.
5. The model can answer directly or request a tool.
6. If the tool needs an approval-gated file change, the system asks you for approval.
7. After approval, the system performs the action and continues.

### When approval appears

If the system wants to run an approval-gated file change, you will see a prompt like this:

```text
Approval needed: memory_write on documents/fitness/spec.md
Approve? [y/N]
```

Type:

- `y` or `yes` to allow the change.
- Press Enter, or type anything else, to deny it.

After that, the terminal will show whether the approval was accepted or denied.

## Where Your Data Goes

The build stores data in `your-memory/`.

Important folders:

- `your-memory/conversations/` stores conversation markdown files and `index.json`.
- `your-memory/documents/` stores created documents.
- `your-memory/preferences/` stores preferences and auth state.
- `your-memory/exports/` stores exported archives.
- `your-memory/AGENT.md` stores the bootstrap system prompt.

## Common Tasks

### Create a new project folder

Ask for a project folder and the three owned documents you want inside it. A simple request is:

```text
Create folder travel-planner with AGENT.md, spec.md, and plan.md
```

Those files live inside the project folder under `your-memory/documents/`.

If writes are needed, approve them when prompted.

### Continue a conversation

Keep typing in the same session. The client automatically keeps using the current conversation ID while the session stays open.

### Export your Memory

Type:

```text
Export memory now
```

The system will create a compressed archive in:

```text
your-memory/exports/
```

This export action does not use the same approval prompt as file editing tools.

### Ask about auth state

Type:

```text
Run auth export now
```

The system can return the non-secret auth state used by the local-owner mode.

## Docker Use

### Build the Docker image

From the `build/` folder, run:

```bash
docker build -t paa-mvp-build .
```

### Run the Docker container with a local model on the host machine

If your model server runs on your own computer and the container needs to reach it, use:

```bash
docker run --rm -it \
  --add-host host.docker.internal:host-gateway \
  -v "$PWD":/workspace \
  -w /workspace \
  paa-mvp-build
```

Then set `adapters/openai-compatible.json` so `base_url` points to:

```text
http://host.docker.internal:11434/v1
```

This keeps the model local to your own hardware while still letting the container reach it.

## How to Stop the Build

### If you started with `npm start`

Type this in the terminal prompt:

```text
/exit
```

That closes the terminal client and then shuts down the server started by `main.ts`.

### If you started only the server

Press:

```text
Ctrl+C
```

### If you started a Docker container

If you used `--rm`, stopping the container also removes it. Press:

```text
Ctrl+C
```

If you started it in detached mode, stop it with:

```bash
docker stop <container-name-or-id>
```

## Safe Shutdown Checklist

Before shutting down, make sure:

1. You finished any approval prompt.
2. The assistant is not still streaming a response.
3. Any export you requested has completed.

## Troubleshooting

### The build says the request failed

Check that your model server is running and that `adapters/openai-compatible.json` points to the correct `base_url`.

### The build starts but cannot answer

Your model server may not be reachable, or the selected model name may be wrong. Check:

- `adapters/openai-compatible.json`
- whether the model server is running
- whether the model name in the file exists on that server

### Docker cannot reach the local model

Make sure:

1. You started the container with `--add-host host.docker.internal:host-gateway`.
2. The adapter `base_url` points to `http://host.docker.internal:<port>/v1`.
3. The local model server is actually running on the host.

### A file action is denied or fails

This can happen when:

- you denied the approval prompt
- the requested path tries to escape the Memory root
- the file action could not be completed on disk

### Startup fails immediately

The build can fail on startup if it cannot prepare Memory, initialize version history, or load config correctly. Read the JSON log output shown in the terminal for the failure reason.

## Recommended Everyday Workflow

For most people, the easiest path is:

1. Start your local model server.
2. Open a terminal in `build/`.
3. Run `npm install` once, if this is your first time.
4. Run `npm run build`.
5. Run `npm start`.
6. Ask for what you want in plain language.
7. Approve writes when prompted.
8. Type `/exit` when you are done.
