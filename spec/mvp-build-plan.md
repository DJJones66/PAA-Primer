# BrainDrive MVP Build Plan

> **Project:** BrainDrive
> **Source:** Rewritten against current mvp-spec.md (4 user stories, ephemeral conversations, no skill system)
> **Status:** Draft — ready for Dave W review
> **Source Documents:**
> - `mvp-spec.md` — MVP product spec (4 user stories: MVP-1 through MVP-4)
> - `personal-ai-architecture` npm package — Architecture Foundation (Agent Loop, Gateway, Your Memory tools, Auth, Adapters — 212 tests)
> - `../decisions.md` — D1-D159+

---

## What We're Building

The MVP is the first working proof that you can own every part of your AI system. Terminal interface, Docker container, your files on your disk, your choice of model. The core loop: create a folder → paste an interview prompt → spec → action plan. Every folder ends up with three documents (AGENT.md, spec.md, plan.md) that belong to you.

4 user stories define the MVP — from Docker install (MVP-1) through folder management (MVP-2), document CRUD with approval (MVP-3), to paste-in prompts (MVP-4). See `mvp-spec.md` for the complete spec.

**The MVP builds ON the Architecture Foundation, not from scratch.** The `personal-ai-architecture` npm package provides the generic runtime — Agent Loop, Gateway, Your Memory tools, provider adapters, auth infrastructure. The MVP adds Implementation opinions: the BrainDrive CLI, system prompt, approval flow, git integration, and the paste-in prompt workflow that makes it a product.

**What the MVP is NOT:** No web interface, no managed hosting, no skill system. The terminal is the interface. `docker run -it` is the entry point — one command, chatting. Library files are the durable memory. Conversations are stored to disk but not resumable — closing the terminal starts a fresh conversation, same as Claude Code or Cursor. See `mvp-spec.md` § "What the MVP Does NOT Do."

---

## Scope Lock

Implementation is constrained by these decisions:

| Decision | Constraint |
|----------|-----------|
| D4 | Skill system deferred to V1 — MVP uses paste-in prompts |
| D12 | Approval behavior: explicit instructions execute, unexpected actions ask |
| D13 | Every component swappable — models, Agent Loop, Gateway, Auth, tools, adapters |
| D14 | Docker-based deployment |
| D77 | MVP ships before V1 and proves the thesis first |
| D78 | Scope = folders, interview, spec, plan, Docker-only runtime |
| D79 | Public PoC framing (free/open-source, feedback-oriented) |
| D80 | Folder creation/switching through chat, no page UI |
| D81 | Terminal-only interface for MVP |
| D82 | Provider-agnostic model layer (OpenRouter or Ollama) |
| D99 | Auth boundary exists with local-owner-mode policy for MVP (OS login + permissive auth middleware) |
| D107 | Pre-MVP validation before coding — test model + prompts first |
| D155 | Implementation depends on Architecture via npm package |
| D156 | Two boot modes: standalone (Architecture default) and as-a-dependency (MVP uses this) |

**Explicitly NOT in scope (deferred to V1):**
- Conversation resumption / loading old conversations (post-MVP)
- Skill system / `load_skill` tool (D4 → V1)
- `.braindrive/skills/` directory
- Structured/queryable Memory operations (database-backed tools)
- Configurable audit detail levels
- Stream-level approval flow (OQ-1 in gateway-engine-contract.md)
- Full authorization policy store / multi-identity management

---

## What the Foundation Provides vs What We Build

The `personal-ai-architecture` npm package ships ~1.7K lines of working runtime code. Here's what exists and what the MVP adds:

### Foundation (ready to use)

| Component | What It Does | Factory Function |
|-----------|-------------|-----------------|
| **Agent Loop** | Generic agent loop — tool execution, timeouts, streaming | `createEngine(provider, toolExecutor)` |
| **Gateway** | Conversation routing, message management | `createGateway({ engine, conversationStore, systemPrompt })` |
| **Memory Tools (7)** | read, write, edit, delete, search, list, history — with atomic writes, path sandboxing | `createMemoryTools(root)` + `createMemoryToolExecutor(tools)` |
| **Model Adapter** | Streams OpenAI-compatible API calls, handles tool call buffering | `createOpenAICompatibleAdapter(config)` |
| **Auth** | Provider + middleware + auth tools (`auth_whoami`, `auth_check`, `auth_export`) | `createV1AuthProvider()` + `createAuthMiddleware()` |
| **Conversation Store** | SQLite-backed persistence (MVP uses file-backed storage in library instead) | `createConversationStore(dbPath)` |
| **Tool Discovery** | Auto-scans directories for external tool definitions | `discoverExternalTools(dirs)` |
| **Config Loader** | Reads `config.json` with memory_root, provider_adapter, tool_sources | `loadConfig()` |

### BrainDrive MVP (must build)

| Component | What It Does | Estimate |
|-----------|-------------|----------|
| **Terminal REPL** | Interactive chat loop — readline, streaming display, talks to Gateway via HTTP | Medium |
| **System Prompt** | Agent personality — folder conventions, approval rules, paste-in behavior | Small |
| **Approval-Aware Tool Executor** | Wraps foundation ToolExecutor, intercepts writes, prompts user | Small-Medium |
| **Git Tool** | Auto-init on first run, auto-commit on approved writes | Small |
| **Configuration Mapping** | `BRAINDRIVE_MODEL_URL` / `BRAINDRIVE_MODEL_NAME` / `BRAINDRIVE_API_KEY` → foundation config | Small |
| **First-Run Logic** | Library init (git init), greeting | Small |
| **Dockerfile** | Containerization, volume mounts, entrypoint | Small |
| **Error Handling** | User-friendly messages for all failure modes | Small |

**Total new code estimate:** ~800-1200 lines. The foundation does the heavy lifting.

---

## MVP Architecture

```
docker run -it ... braindrive/braindrive
   │
   │  (container starts, drops into chat immediately)
   │
   v
BrainDrive CLI (Implementation — inside Docker)
   │  (first-run: git init library)
   │
   ├── createGateway({ engine, systemPrompt })    ← conversation management
   │     + createGatewayRoutes() + createServer() ← HTTP listener (localhost-bound, D26)
   │     │
   │     ├── HTTP POST /message                   ← CLI sends requests each turn
   │     │     → streamed EngineEvents
   │     │
   │     └── manages conversation in memory (ephemeral, lost on exit)
   │
   ├── createEngine(provider, toolExecutor)       ← generic agent loop
   │     │                    │
   │     v                    v
   │  Model API       ToolExecutor (approval-aware wrapper)
   │     │                    │
   │     v                    ├── Foundation memory tools (7)
   │  Model (OpenRouter       └── Git tool (auto-commit)
   │   or Ollama)
   │
   └── createOpenAICompatibleAdapter(config)
         │
         v
      Host-mounted library folder
        (plain markdown + git)
```

**Library root structure:**

```
/library/                              ← host-mounted volume
├── .git/                              ← auto-initialized on first run
├── finances/
│   ├── AGENT.md
│   ├── spec.md
│   └── plan.md
└── fitness/
    ├── AGENT.md
    └── ...
```

**No `.braindrive/skills/` directory in MVP.** The skill system is V1. Users paste prompts directly into the conversation. The AI follows whatever instructions are pasted.

**Root-level context:** When no folder is selected (startup, between switches), the AI has its system prompt. It can list existing folders via memory tools (`memory_list`). Folder-level AGENT.md files provide context only when the user tells the AI to work in a specific folder.

**Architecture (Foundation — npm) vs Implementation (BrainDrive — this plan):**

| Responsibility | Layer | Source |
|---------------|-------|--------|
| Gateway — conversation management, message routing, HTTP (localhost-bound, D26) | Architecture | `createGateway({ engine, systemPrompt })` + `createGatewayRoutes()` + `createServer()` |
| Agent Loop — generic agent loop, tool execution, streaming | Architecture | `createEngine(provider, toolExecutor)` |
| Your Memory tools — 7 tools (read, write, edit, delete, search, list, history) | Architecture | `createMemoryTools(memoryRoot)` + `createMemoryToolExecutor(tools)` |
| Model API — OpenAI-compatible endpoint abstraction | Architecture | `createOpenAICompatibleAdapter(config)` |
| Auth — provider + middleware (configured off for MVP) | Architecture | `createV1AuthProvider()` + `createAuthMiddleware()` |
| CLI — terminal REPL, streaming display, input handling | Implementation | **This plan** |
| System prompt — BrainDrive assistant behavior, folder conventions, approval rules | Implementation | **This plan** |
| Approval flow — intercept write tools, prompt user | Implementation | **This plan** |
| Git tool — auto-init, auto-commit on approved writes | Implementation | **This plan** |
| First-run init — git init, greeting | Implementation | **This plan** |
| Configuration mapping — user env vars → foundation config | Implementation | **This plan** |

**Gateway usage:** The CLI talks to the Gateway via HTTP (D26). The Gateway runs inside the Docker container bound to localhost — no externally exposed ports. The Gateway manages the conversation in memory (message accumulation, system prompt injection). This preserves the architecture boundary (Gateway manages conversations, Agent Loop executes tools) and carries forward directly to V1 — the same HTTP Gateway serves the web interface.

---

## Technology Stack

| Component | MVP Implementation | V1 Evolution |
|-----------|-------------------|--------------|
| Foundation | `personal-ai-architecture` (npm) — Agent Loop, Memory tools, Auth, Adapters | Same — carries forward |
| Agent Loop | From foundation — `createEngine(provider, toolExecutor)` | Same — zero BrainDrive logic |
| Your Memory | From foundation — 7 tools via `createMemoryToolExecutor()` | Same tools — carries forward |
| Auth | From foundation — local-owner-mode for MVP (middleware wired, permissive policy, auth tools active) | Full policies for V1 with managed hosting |
| Adapters | From foundation — `createOpenAICompatibleAdapter()` | Same — OpenRouter, Ollama, any OpenAI-compatible |
| Client | BrainDrive CLI — terminal REPL (`docker run -it`) | + Web app (React/Vite) |
| MVP tools | Git tool, approval gates | + skill tool, additional tools |
| Gateway | From foundation — HTTP Gateway (localhost-bound, D26) via `createGateway()` + `createGatewayRoutes()` + `createServer()` | Same — already HTTP, carries forward to V1 web interface |
| Conversations | File-backed in library (Your Memory) — stored on disk, message limit configurable, not resumable | + Resumption, conversation-store tool, SQLite if needed at scale |
| Models | Any OpenAI-compatible endpoint (OpenRouter, Ollama) | Same |

**What the terminal eliminates:**
- No React / Vite / Tailwind / shadcn/ui — no web frontend at all
- No streaming chat UI to build in the browser — the terminal handles this natively
- No SQLite conversation store — conversations stored as files in library
- Gateway HTTP listener bound to `127.0.0.1` inside container — no externally exposed ports (D26). Bind address configurable for development.
- Auth wired with local-owner-mode — boundary exists, permissive policy

---

## Phase Summary

| Phase | Name | What Ships | MVP Stories | Est. Duration |
|-------|------|-----------|-------------|---------------|
| 0 | Docker + Foundation Validation | Dockerfile, docker-compose, foundation wiring, prompt validation — all inside Docker from day one | MVP-1 (partial) | 1-2 days |
| 1 | CLI + Tool Layer | Terminal REPL, approval-aware tool executor, git tool, config — all inside Docker | MVP-1 (partial), MVP-3 | ~1 week |
| 2 | System Prompt + Core Loop | Bootstrap prompt, first-run init, folder context, paste-in prompt validation | MVP-2, MVP-4 | ~1 week |
| 3 | Hardening + Launch | Edge cases, E2E testing, README, open source prep | MVP-1 (complete) | ~1 week |

**Total estimated duration:** ~2.5-3 weeks

---

## Phase 0: Docker + Foundation Validation

> Docker from day one. Build the container first, then validate the foundation and prompts inside it. Everything runs in the real environment from the start — no "works on my machine" surprises later.

### Tasks

| # | Task | Stories | Status |
|---|------|---------|--------|
| 0.1 | Build Docker container — Dockerfile, docker-compose.yml, .env.example | MVP-1 | Not Started |
| 0.2 | Wire up foundation components inside Docker — Agent Loop + Memory tools + Model API + HTTP Gateway + Auth middleware (local-owner-mode) | — | Not Started |
| 0.3 | Draft bootstrap prompt and test against live model with real conversation | — | Not Started |
| 0.4 | Test interview → spec → plan loop with model using paste-in prompts and memory tools | — | Not Started |
| 0.5 | Validate with at least 2 models (one via OpenRouter, one via Ollama) | — | Not Started |

### Implementation Detail

#### 0.1 Docker Setup

Build the container that everything runs in. This is the first thing — all subsequent work happens inside Docker.

- Single Dockerfile: Node.js runtime + git + BrainDrive CLI
- Library folder mounted from host — path configurable via `BRAINDRIVE_LIBRARY_PATH` with sensible default (`/library`) (D19)
- `docker run -it` (quick start) or `docker compose up` (custom config) drops user directly into chat
- Same image works for all model provider configurations — set via env vars or `.env` file
- Library config persists user preferences (provider, model) between sessions (D21)
- HTTP Gateway localhost-bound inside container (D26) — no externally exposed ports

**Quick start** (one command, defaults work):

```bash
docker run -it \
  -v ~/braindrive-library:/library \
  -e BRAINDRIVE_MODEL_URL=https://openrouter.ai/api/v1 \
  -e BRAINDRIVE_MODEL_NAME=anthropic/claude-sonnet-4 \
  -e BRAINDRIVE_API_KEY=sk-or-your-key \
  braindrive/braindrive
```

**With docker compose** (for customization — edit `.env`, run `docker compose up`):

Ship `docker-compose.yml` + `.env.example` in the repo. Same container, same image — compose moves config from command line to file.

**Ollama variant (fully local — user owns everything):**

```bash
docker run -it \
  -v ~/braindrive-library:/library \
  -e BRAINDRIVE_MODEL_URL=http://host.docker.internal:11434/v1 \
  -e BRAINDRIVE_MODEL_NAME=llama3:8b \
  braindrive/braindrive
```

#### 0.2 Foundation Wiring Test

A minimal test script **inside Docker** that proves the as-a-dependency boot mode (D156) works:

```typescript
import {
  createEngine,
  createGateway,
  createMemoryTools,
  createMemoryToolExecutor,
  createOpenAICompatibleAdapter,
} from "personal-ai-architecture";

// Wire up foundation components programmatically
const memoryTools = createMemoryTools("/tmp/test-library");
const toolExecutor = createMemoryToolExecutor(memoryTools);
const provider = createOpenAICompatibleAdapter({
  name: "openrouter",
  base_url: "https://openrouter.ai/api/v1",
  api_key: process.env.BRAINDRIVE_API_KEY!,
  default_model: "anthropic/claude-sonnet-4",
});
const engine = createEngine(provider, toolExecutor);
const gateway = createGateway({
  engine,
  systemPrompt: "You are a BrainDrive assistant. Use memory tools to manage files.",
});

// Send a message through the Gateway — it manages conversation state
for await (const event of gateway.sendMessage({
  message: { role: "user", content: "Create a folder for my finances" },
})) {
  if (event.type === "text-delta") process.stdout.write(event.content);
  if (event.type === "tool-call") console.log(`\n[tool] ${event.name}`);
}
```

This validates that all foundation components wire up — Gateway manages the conversation, Engine executes tools, Memory persists files, Adapter routes to the model.

**Important (Gateway DP7):** The validation script must use the real persistence-capable Gateway, not an ephemeral override. If `validate-foundation.ts` contains `createEphemeralGateway`, remove it — validation must exercise the same Gateway behavior as production.

#### 0.3 Bootstrap Prompt Testing

Draft the system prompt and test it against a live model. The model should:
- Understand it's a BrainDrive assistant working in a library
- Know how to use memory tools (read, write, search, list)
- Know about flat folder conventions
- Respect the approval rule (D12: explicit instructions execute, unexpected actions ask)
- Follow paste-in prompts faithfully

Test with real back-and-forth conversation, not unit tests. The goal is to find prompt issues before building the CLI around them.

#### 0.4 Core Loop Validation

Run the full loop manually through the test script:
1. Tell the model to create a folder → verify it uses `memory_write` for AGENT.md
2. Paste an interview prompt → verify the model follows it, asks domain-appropriate questions, probes vague answers
3. Paste a spec generation prompt → verify it produces a structured spec from the interview
4. Paste a plan generation prompt → verify it produces a plan with phases and steps
5. Verify all files are plain markdown, readable on disk

**This is the quality gate for Phase 0.** If the model can't do this with good prompts and foundation tools, stop and iterate on the prompt. The loop must work end-to-end — folder created, interview completed, spec produced, plan produced, all as plain files on disk.

#### 0.5 Multi-Model Validation

Run the same loop with at least 2 models:
- One SOTA model via OpenRouter (e.g., Claude Sonnet 4)
- One local model via Ollama (e.g., Llama 3)

Document differences in quality and any prompt adjustments needed per model.

### Phase 0 Milestone

**Success criteria:**

- [ ] Docker container builds and runs (`docker run -it` or `docker compose up`)
- [ ] Library folder mounted from host, files visible as plain markdown
- [ ] Foundation components wire up correctly inside Docker
- [ ] HTTP Gateway serves requests on localhost inside container
- [ ] Model uses memory tools to create folders and files
- [ ] Paste-in interview prompt produces conversational, probing interview
- [ ] Paste-in spec prompt produces structured spec with goals, scope, success criteria
- [ ] Paste-in plan prompt produces plan with phases, steps, milestones grounded in the spec
- [ ] Works with at least 2 models (OpenRouter + Ollama)
- [ ] The loop works end-to-end — folder, interview, spec, plan, all as files on disk

**What this phase does NOT include:** No terminal REPL (test scripts only), no approval flow, no git tool. Docker is set up, foundation is validated, prompts are tested — all inside the container.

**Drift remediation in Phase 0:**
- [ ] Auth middleware wired on Gateway→Engine path (local-owner-mode)
- [ ] Runtime config uses four-field bootstrap shape
- [ ] Adapter selection is config-driven (no hardcoded adapter import)
- [ ] Gateway binds to `127.0.0.1` by default
- [ ] Validation script uses real Gateway (no ephemeral override)
- [ ] Gateway client API accepts canonical `{ content, metadata? }` request shape

---

## Phase 1: CLI + Tool Layer

> Turn the foundation into an interactive conversation. Build the terminal REPL, the approval flow, the git tool, and configuration wiring. After this phase, you can chat in the terminal with approval-gated file operations.

### Tasks

| # | Task | Stories | Status |
|---|------|---------|--------|
| 1.1 | Implement terminal REPL — readline input, Gateway wiring, streaming display | MVP-1 | Not Started |
| 1.2 | Implement streaming display — token-by-token output, thinking indicator, tool feedback | MVP-1 | Not Started |
| 1.3 | Implement approval-aware tool executor — wraps foundation ToolExecutor, intercepts writes | MVP-3 | Not Started |
| 1.4 | Implement git tool — auto-init, auto-commit on approved writes | MVP-3 | Not Started |
| 1.5 | Implement Ctrl+C behavior — cancel generation mid-stream, exit at prompt | MVP-1 | Not Started |
| 1.6 | Implement configuration mapping — user env vars → foundation component creation | MVP-1 | Not Started |
| 1.7 | Implement error handling — clear messages for all provider/config/library failures | MVP-1 | Not Started |

### Implementation Detail

#### 1.1 Terminal REPL

- `braindrive chat` command launches the REPL (the Docker entrypoint calls this)
- Readline-based input (Node.js `readline` or similar)
- On startup: create Gateway with `createGateway({ engine, systemPrompt })` + `createGatewayRoutes()` + `createServer()` — Gateway manages conversation state via HTTP (localhost-bound, D26)
- User types message → HTTP request to Gateway → iterate streamed events → display in terminal
- **Conversations are ephemeral.** The Gateway holds the conversation in memory. Closing the terminal loses the chat. Library files persist. This is identical to how Claude Code and Cursor work.
- On restart: fresh conversation via new Gateway instance. The system prompt tells the AI about the library; the AI reads existing folder context via memory tools.
- Multi-line input support for paste-in prompts (critical for MVP-4)

#### 1.2 Streaming Display

- Token-by-token response display by consuming `text-delta` events from the engine
- Thinking/processing indicator while model is working (before first token)
- Clear visual separation between user input and AI response
- Tool call activity feedback from `tool-call` events (e.g., "Reading finances/spec.md...")
- Tool result feedback from `tool-result` events (success/error indication)

#### 1.3 Approval-Aware Tool Executor

The key UX of MVP-3: approval behavior per D12. This wraps the foundation's `ToolExecutor` interface — the Agent Loop never knows about approval.

```typescript
// Wraps the foundation ToolExecutor
function createApprovalToolExecutor(
  inner: ToolExecutor,
  promptUser: (description: string) => Promise<boolean>,
): ToolExecutor {
  const writeTools = new Set([
    "memory_write", "memory_edit", "memory_delete",
  ]);

  return {
    listTools: () => inner.listTools(),
    async execute(name, args) {
      if (writeTools.has(name)) {
        // Show what's proposed and prompt for approval
        const approved = await promptUser(formatProposal(name, args));
        if (!approved) {
          return { id: name, error: "Denied by owner" };
        }
      }
      return inner.execute(name, args);
    },
  };
}
```

When the model calls a write tool (`memory_write`, `memory_edit`, `memory_delete`):

1. CLI pauses the agent loop (the `execute()` Promise doesn't resolve until user responds)
2. Shows what's proposed: file path and the change (full content for new files, diff for edits)
3. Prompts: "Approve this change? (y/n)"
4. **Yes** → delegates to inner executor, git commit created (via git tool)
5. **No** → returns `{ error: "Denied by owner" }` to the Agent Loop, conversation continues

The Agent Loop receives denial as a tool result — it can acknowledge and move on, or propose alternatives. Read-only tools (`memory_read`, `memory_search`, `memory_list`, `memory_history`) execute without approval. This preserves Agent Loop purity — the Agent Loop awaits the Promise like any other tool call.

**D12 target behavior:** Explicit instructions execute without asking ("Update my goal" → just do it). Unexpected actions (cross-folder changes, actions user didn't request) ask first. Start with approval for everything, iterate toward the target behavior based on feedback.

#### 1.4 Git Tool

Handles git auto-init and auto-commit. **Local only — no remote, no push.** Git is used for version history and undo, not backup or sync. Remote/push is a V1 consideration.

- **First-run detection:** if library folder is not a git repo, `git init` + initial commit
- **Auto-commit on approved writes:** after the approval-aware executor confirms a write and the inner executor succeeds, git add + commit with a descriptive message
- Commit messages: descriptive, include the action ("Create folder: finances", "Update spec: career goals")
- Git operations are internal — the user never runs git commands
- No `git remote`, no `git push` — purely local version history
- If git init fails at startup: fail with clear error — do not degrade to warning. Version history is an architecture guarantee, not optional.

Uses `simple-git` (same library the foundation uses for `memory_history`).

#### 1.5 Ctrl+C Behavior

Two modes, matching terminal conventions:

| State | Ctrl+C Behavior |
|-------|----------------|
| AI is generating a response | Cancel current generation, return to input prompt |
| User is at the input prompt | Exit the container cleanly |

Canceling generation mid-stream is a clean abort — the partial response is visible but the agent loop stops. The user can continue the conversation from their next message.

#### 1.6 Configuration Mapping (drift remediation — Init DP4, Provider DP1-5)

Configuration follows the architecture's three-layer split:

**Runtime config (thin bootstrap — 4 fields):**

| Field | Source | Default |
|-------|--------|---------|
| `memory_root` | `BRAINDRIVE_LIBRARY_PATH` env var | `/library` |
| `provider_adapter` | Runtime config file | `openai-compatible` |
| `auth_mode` | Runtime config file | `local-owner` |
| `tool_sources` | Runtime config file | Built-in memory tools + git tool |

**Adapter config (provider-specific):**

| Field | Source |
|-------|--------|
| `base_url` | `BRAINDRIVE_MODEL_URL` env var |
| `default_model` | `BRAINDRIVE_MODEL_NAME` env var or library preference |
| `api_key` | `BRAINDRIVE_API_KEY` env var (secrets in env only, never in files) |

**Deployment config:**

| Field | Default |
|-------|---------|
| `bind_address` | `127.0.0.1` (configurable to `0.0.0.0` for network access — opt-in) |

**Adapter selection is config-driven, not hard-coded.** The foundation's adapter loader selects the adapter from `provider_adapter` in runtime config. BrainDrive does NOT import a specific adapter in product code — it goes through the loader. One adapter surface, no fork. Provider swap = config change, not code change.

Config loaded once at startup. Env vars override library config when set (e.g., for testing a different model). Validation:

| Condition | Behavior |
|-----------|----------|
| Missing required config (URL or model name) | Clear error: "BRAINDRIVE_MODEL_URL is required — set it in .env or library config" → exit |
| Invalid/unreachable model URL | Clear error on first request: "Could not reach model provider at `<url>` — check BRAINDRIVE_MODEL_URL" |
| Invalid model name | Clear error: "Model not found — check BRAINDRIVE_MODEL_NAME" (pass through provider's error) |
| API key rejected | "API key rejected by provider — check BRAINDRIVE_API_KEY" |

#### 1.7 Error Handling

| Condition | Behavior |
|-----------|----------|
| Model unavailable | "Model unavailable — check your connection and API key" |
| API key invalid/expired | "API key rejected by provider — check BRAINDRIVE_API_KEY" |
| Library folder missing | "Library folder not found at `<path>`" → exit |
| Library folder not writable | "Library folder not writable — check permissions on the mounted volume" → exit |
| Model name not found | "Model not found — check BRAINDRIVE_MODEL_NAME" |
| Provider URL unreachable | "Could not reach model provider — check BRAINDRIVE_MODEL_URL" |

### Phase 1 Milestone

**Success criteria:**

- [ ] `braindrive chat` launches interactive terminal conversation
- [ ] Responses stream token-by-token
- [ ] Write operations show proposed change and wait for approval
- [ ] Denied writes return "denied" to model; conversation continues normally
- [ ] Approved writes execute and commit to git
- [ ] Ctrl+C during generation cancels and returns to prompt
- [ ] Ctrl+C at prompt exits the container cleanly
- [ ] Configuration precedence works: env vars (.env) > library config > defaults
- [ ] Clear error messages for all failure modes
- [ ] No externally exposed network ports (Gateway localhost-bound, D26)

**Drift remediation in Phase 1:**
- [ ] Conversations stored to disk in library (file-backed, not in-memory Map)
- [ ] Message limit configurable (not hard-coded 24)
- [ ] Git init deterministic — fail loudly if it can't be established
- [ ] Structured JSON audit logging to stdout
- [ ] Error classification: `provider_error`, `tool_error`, `context_overflow`
- [ ] Error messages sanitized — safe for client display
- [ ] Auth tools registered: `auth_whoami`, `auth_check`, `auth_export`
- [ ] `authorize()` called before tool execution (owner = always allow)
- [ ] `memory_export` tool available
- [ ] `memory_history` returns previous states (optional commit hash parameter)
- [ ] Approval executor has clean boundary between enforcement and CLI prompt

**Validates:** MVP-1 (partial — CLI works, Docker packaging in Phase 3), MVP-3 (file CRUD with approval)

---

## Phase 2: System Prompt + Core Loop

> Ship the core loop — the system prompt and folder workflow that makes BrainDrive work. Validate that paste-in prompts produce usable output end-to-end. The quality gate: does the architecture hold and does the loop complete?

### Tasks

| # | Task | Stories | Status |
|---|------|---------|--------|
| 2.1 | Implement first-run initialization — git init, greeting | MVP-1 | Not Started |
| 2.2 | Write bootstrap prompt — system prompt with rules, folder conventions, paste-in awareness | MVP-2, MVP-4 | Not Started |
| 2.3 | Implement folder context switching — load AGENT.md/spec/plan on folder selection | MVP-2 | Not Started |
| 2.4 | Write example prompts — interview, spec-generation, plan-generation (shipped as docs, not product features) | MVP-4 | Not Started |
| 2.5 | Validate end-to-end — paste-in prompts complete the loop, files persist, architecture holds | MVP-4 | Not Started |

### Implementation Detail

#### 2.1 First-Run Initialization

On first startup with a new library (detected by absence of `.git/` directory):

1. **Git init** — initialize the library as a git repo (silent)
2. **Initial commit** — `git commit --allow-empty -m "Initialize BrainDrive library"`

No skills directory. No files to copy. The library starts empty — the user creates folders through conversation.

#### 2.2 Bootstrap Prompt

The system prompt defines BrainDrive's behavior. This is the product — it determines how useful the AI is within the library:

```
You are a BrainDrive assistant. You help owners manage their personal library —
creating folders, managing documents, and following any instructions they give you.

The owner's library is at /library. Folders are at the library root (e.g.,
/library/finances/, /library/fitness/). When working in a folder, read that
folder's AGENT.md first for context.

To see what folders exist, use memory_list on the library root.

When the owner pastes a long prompt with instructions (e.g., an interview
template, a spec generator), follow those instructions faithfully. This is how
BrainDrive works — the owner controls what you do by giving you instructions.

Rules:
- When the owner explicitly asks you to create, edit, or delete a file — just
  do it. Don't ask "are you sure?" for every write.
- For actions the owner didn't ask for (cross-folder changes, unsolicited
  suggestions) — describe what you'd change and ask first.
- Stay within /library — never access files outside it.
- When the owner asks to work on a topic, check if a folder exists. If not,
  offer to create one.
- Write anything important to files — library files are the durable memory.
  The conversation is ephemeral and will be lost when the terminal closes.
```

This is Implementation (BrainDrive's opinionated choice). The Agent Loop doesn't know or care — it receives a system prompt string. The bootstrap will be iterated based on testing.

#### 2.3 Folder Context Switching

- User says "Let's work on finances" → model reads `finances/AGENT.md` + `finances/spec.md` + `finances/plan.md` via memory tools
- User says "Create a folder for fitness" → model creates `fitness/` with AGENT.md tailored to the domain
- No matching folder → model lists existing folders, offers to create new
- Context loaded through normal tool calls (`memory_read`) — the model decides what to read based on its instructions

#### 2.4 Example Prompts

Ship example prompts as documentation (README, docs folder, or community post) — NOT as product features. These are the prompts users paste into the conversation:

**Interview prompt** — How to run a structured interview:
- Framework: Core (goal, success) → Scope → Current state → Approach → Risks → Priorities
- Dynamic: adapt questions to the domain, probe vague answers, follow tangents
- Output: hand off to spec generation when complete

**Spec generation prompt** — How to synthesize interview into spec:
- Structure: goals, scope, current state, success criteria, context
- Present in chat for review before saving
- Save to `<folder>/spec.md` on approval

**Plan generation prompt** — How to turn a spec into a plan:
- Structure: phases, steps per phase, milestones, success criteria
- Grounded in the spec's goals and context
- Present in chat for review before saving
- Save to `<folder>/plan.md` on approval

These are documentation — they prove the methodology works and give users a starting point. V1's skill system automates loading them. For the MVP, the user copies and pastes.

#### 2.5 Methodology Quality Gate

**This is the critical validation.** Test the full paste-in loop with real scenarios across different domains:

- Finance planning
- Fitness goals
- Side business
- Career development

Each test evaluates:
- Does the pasted interview prompt produce a conversational, adaptive interview?
- Does the pasted spec prompt produce structured specs with actionable goals?
- Does the pasted plan prompt produce plans grounded in the spec with concrete steps?
- Does the AI faithfully follow whatever prompt is pasted — not just the examples?

If the loop doesn't complete — prompts aren't followed, files don't persist, tools fail — **stop and fix the wiring or the system prompt.** The MVP bar is: does it work end-to-end? Methodology quality (is this *better* than ChatGPT?) is V1's bar.

### Phase 2 Milestone

**Success criteria:**

- [ ] First-run initializes git and greets the user
- [ ] First-run greeting introduces BrainDrive and suggests creating a first folder
- [ ] "Create a folder for my finances" → creates folder with tailored AGENT.md
- [ ] "Let's work on finances" → model reads folder context, responds with awareness
- [ ] No matching folder → model lists existing folders, offers to create
- [ ] Paste-in interview prompt → conversational interview that probes and adapts
- [ ] Paste-in spec prompt → structured spec with goals, scope, success criteria
- [ ] Paste-in plan prompt → plan with phases, steps, milestones grounded in spec
- [ ] Paste any other prompt → AI follows it faithfully (system is general-purpose)
- [ ] All files are plain markdown, browsable on disk
- [ ] The loop works end-to-end — folder → paste interview → spec → plan → all as files on disk
- [ ] Architecture holds — Agent Loop executes tools, Memory persists, model responds, approval gates work

**Validates:** MVP-2 (folders), MVP-4 (paste-in prompts)

**Quality gate:** Does the architecture hold under real use? Does the loop complete? If not, fix the wiring or the system prompt. Methodology quality (is this *better* than ChatGPT?) is V1's bar.

---

## Phase 3: Hardening + Launch

> Docker is already running (Phase 0). Harden edge cases, run E2E tests, write the README, and prepare for public launch.

### Tasks

| # | Task | Stories | Status |
|---|------|---------|--------|
| 3.1 | Validate all edge cases from mvp-spec.md | MVP-1–MVP-4 | Not Started |
| 3.2 | Run end-to-end testing — full user journey from docker run to plan generation | MVP-1–MVP-4 | Not Started |
| 3.3 | Write README + quick start guide — OpenRouter and Ollama setup | MVP-1 | Not Started |
| 3.4 | Open source preparation — LICENSE, CONTRIBUTING.md, repo setup, issue templates | MVP-1 | Not Started |

### Implementation Detail

#### 3.1 Edge Case Handling

All cases from mvp-spec.md:

| # | Scenario | Implementation |
|---|----------|----------------|
| 1 | Cloud provider goes down | Engine reports error → CLI shows "model unavailable" — library files still on disk |
| 2 | API key runs out of credits | Provider returns auth error → graceful notification |
| 3 | Ollama local model | Same config pattern — different URL + model name, no API key |
| 4 | User edits files outside BrainDrive | Model re-reads files on next interaction via memory tools — files are source of truth |
| 5 | Folder with no documents | AI loads AGENT.md, ready for whatever user asks |
| 6 | User denies all proposed changes | Approval executor returns "Denied by owner" → model acknowledges, conversation continues |
| 7 | Terminal closed and reopened | Conversation lost. Library files persist. AI starts fresh, loads folder context via memory tools. |
| 8 | Context window exceeded | Sliding window — keep last N messages, drop oldest. System prompt + folder context (AGENT.md) always preserved. (D23) |
| 9 | Two terminals simultaneously | Not supported in MVP. One terminal per library. V1 addresses concurrent access. (D24) |
| 10 | Library folder missing/unwritable | Startup check → clear error → clean exit |
| 11 | No matching folder | Model lists existing folders via `memory_list`, offers to create new one |
| 12 | Invalid model URL | "Could not reach model provider" — no cryptic stack traces |
| 13 | Invalid model name | "Model not found — check BRAINDRIVE_MODEL_NAME" |

#### 3.2 End-to-End Testing

Test the complete user journey:

1. `docker run -it` → container starts → library initialized (git) → first-run greeting
2. User creates first folder → AGENT.md created
3. User pastes interview prompt → interview runs → probing, adaptive
4. User pastes spec prompt → spec generated → approved → saved
5. User pastes plan prompt → plan generated → approved → saved
6. "Update my goal" → change proposed → approved → saved → git commit
7. Exit (Ctrl+C at prompt) → `docker run -it` again → fresh conversation, but AI reads existing folder context via memory tools
8. Files browsable on host machine as plain markdown
9. Switch model from OpenRouter to Ollama → same behavior, different model

#### 3.3 README + Quick Start

For the public open-source launch:

- Prerequisites: Docker
- Install: one `docker run -it` command
- Configure: env vars for model provider
- First run: what to expect (greeting, first folder)
- Example prompts: interview, spec generation, plan generation (copy-paste ready)
- OpenRouter setup guide (get API key — recommended for best experience)
- Ollama setup guide (local models — fully user-owned, quality varies by model)
- What BrainDrive is / why it exists (link to mission)
- Contributing / feedback channels

#### 3.4 Open Source Preparation

- LICENSE (MIT or Apache 2.0)
- CONTRIBUTING.md
- GitHub repository setup
- Issue templates
- Clean commit history

### Phase 3 Milestone

**Success criteria:**

- [ ] All edge cases handled gracefully
- [ ] Full E2E journey works: docker run → init → greeting → folder → interview → spec → plan → edit → exit → relaunch → files persist
- [ ] Terminal close and reopen: conversation transcript stored on disk, fresh conversation starts, AI reads folder context via memory tools
- [ ] README gets a new user from zero to first interview in under 5 minutes (excluding Docker install)
- [ ] Repository ready for public launch
- [ ] API keys never stored in library files

**Drift remediation in Phase 3:**
- [ ] Gateway API contract conformance: `GET /conversations` returns `{ conversations, total, limit, offset }` envelope
- [ ] `X-Conversation-ID` header on streamed responses
- [ ] `done` event includes `message_id`
- [ ] `GET /conversations/:id` returns per-message IDs and timestamps
- [ ] `docker-compose.yml` does not expose Gateway port to host by default
- [ ] Minimal auth config stored in library (owner identity, auth mode, basic policy)
- [ ] All conformance tests pass: ARCH-5 through ARCH-9, DEPLOY-5

**Validates:** MVP-1 (complete — Docker install + first run + greeting), all invariants from mvp-spec.md

---

## Invariants

These must hold at ALL times, across ALL phases. Each traces to a pillar from the mission:

| # | Invariant | Pillar | Enforced By |
|---|-----------|--------|-------------|
| 1 | Owner owns their files — plain markdown, browsable on disk, exportable | Ownership | Foundation memory tools write to mounted volume |
| 2 | Nothing written without owner approval (D21, D12) | Empowerment | Approval-aware ToolExecutor wrapper (Phase 1) |
| 3 | API keys never stored in library files | Freedom | Configuration system — secrets in env vars/config file inside container, never in `/library/` |
| 4 | Agent sandboxed to library folder (D5) | Empowerment | Foundation memory tools — `resolveSafePath()` validates all paths against memory root |
| 5 | No externally exposed network ports | Ownership | Gateway bound to `127.0.0.1` inside container (D26) — `bind_address` configurable for dev, default is localhost |
| 6 | Your Memory uses open formats — readable without BrainDrive | Freedom | Filesystem + git, no proprietary format |
| 7 | Auth boundary exists on every request path | Freedom | Auth middleware wired with local-owner-mode — boundary is real even when policy is permissive |
| 8 | Version history is guaranteed, not best-effort | Ownership | Git init must succeed at startup or fail clearly — no silent degradation |
| 9 | Full export available from day one | Freedom | `memory_export` tool packages library into open-format archive |
| 10 | Error messages safe for client display | Empowerment | No raw stack traces, paths, or credentials in SSE error events |

---

## Cross-Cutting Concerns

### Agent Loop Purity

The Agent Loop has zero BrainDrive-specific code throughout all phases. The Agent Loop comes from the foundation package — it accepts a `ProviderAdapter` and a `ToolExecutor`, runs the agent loop, and streams events. BrainDrive behavior comes from:

- System prompt (bootstrap prompt → folder AGENT.md context)
- Tool definitions (foundation memory tools + git tool)
- Paste-in prompts (user controls the methodology)

If you find yourself adding BrainDrive logic to the Agent Loop, stop. It belongs in the system prompt, or an Implementation tool wrapper.

### Lock-In Disciplines

Key disciplines from the foundation's lock-in analysis that apply to MVP:

- [ ] **LD-2: Keep the integration thin** — Agent Loop is generic; all BrainDrive behavior comes from Memory and tools
- [ ] **LD-3: Test against multiple models** — verify folder creation and paste-in prompts work with at least 2 models (one via OpenRouter, one via Ollama)
- [ ] **LD-6: Pin dependency versions** — foundation package version, runtime dependencies locked in package.json

### Auth — Local Owner Mode (D99, drift remediation)

Auth middleware is **wired and active** on the Gateway→Engine path, with a local-owner-mode policy. The boundary exists; the policy is permissive. This is cheap to add now and expensive to retrofit later.

- Auth middleware auto-attaches `X-Actor-ID: owner` and `X-Actor-Permissions: {"type":"owner","permissions":["*"]}` to every request
- `authorize()` called before tool execution — always returns "allow" for owner
- Auth tools registered: `auth_whoami` (returns owner identity), `auth_check` (returns allowed), `auth_export` (returns auth config minus credentials)
- Minimal auth config stored in library (Your Memory): owner identity, auth mode, basic policy
- The foundation provides `createV1AuthProvider()` and `createAuthMiddleware()` — wired into the runtime path, not disabled

**Discipline until V1:** Don't store anything that becomes a security problem when auth policies tighten. API keys stay in environment variables, never in library files.

### Audit Logging (drift remediation)

Structured JSON logging to stdout from day one. Every tool call, auth event, and error gets a structured log line: `{ timestamp, correlation_id, component, level, message }`. In Docker, stdout goes to `docker logs` — queryable with `docker logs --since` and grep. Configurable detail levels deferred to post-MVP.

### Error Sanitization (drift remediation)

SSE error events must be safe for client display. The Engine maps each error code to a fixed safe message — never forwards raw `Error.message`, stack traces, or file paths into the stream. Raw diagnostic detail goes to structured stdout logs only. Error codes classified correctly: `provider_error` for model/network, `tool_error` for unrecoverable tool failures, `context_overflow` for context limits.

### Memory Export (drift remediation)

A `memory_export` tool is available from day one. For MVP, it packages the library into a tar/zip archive. Files on disk + git history. Export is non-negotiable — the architecture's strongest promise is "you can always get your data out."

### Conversations — Stored but Not Resumable (drift remediation)

Conversations are stored to disk in the library (Your Memory) as inspectable files — one per conversation. This satisfies the architecture requirement that conversations live in Your Memory. Closing the terminal starts a fresh conversation; the stored transcript is available as a file but is not auto-loaded.

**What persists:** Library files (AGENT.md, spec.md, plan.md, documents) AND conversation transcripts on disk.

**What's not resumable (MVP):** Conversation loading/resumption is post-MVP. Users point the AI at docs/specs to get context, not at old conversations. This mirrors how Claude Code works — and it's better for context efficiency.

**Message limit:** Configurable preference (not hard-coded). Controls how many messages are sent to the model. Store everything on disk; send the last N to the model. Default: 24. Users with large context windows can increase it.

**V1 path:** Add conversation resumption via dedicated conversation-store tool. Web interface with thread list (conversations on the left, chat on the right, delete when done).

### Context Management (Sliding Window)

MVP uses a simple sliding window — keep the last N messages, drop the oldest (D23). Smart context summarization deferred to V1.

- System prompt + folder context (AGENT.md) always preserved regardless of window position
- If folder context alone exceeds window: warn user, load only AGENT.md
- V1 adds intelligent compaction for persistent conversations

---

## Changelog

| Date | Change | Source |
|------|--------|--------|
| 2026-03-02 | Build plan created — 4 phases, foundation dependency model | Working session (Dave W + Claude) |
| 2026-03-16 | Full rewrite against current mvp-spec.md. Key changes: (1) 4 user stories not 6 — old MVP-3/4/5 consolidated into MVP-4 paste-in prompts, old MVP-6 expanded into MVP-3 document CRUD. (2) Conversation persistence removed — ephemeral, same as Claude Code. No SQLite, no session resume. (3) Skill system removed — no load_skill tool, no .braindrive/skills/, no shipped skill files. MVP uses paste-in prompts. (4) Tool count 3→2 — git tool + approval gates only. (5) Phase 2 rewritten for system prompt + paste-in validation instead of skill files. (6) Architecture diagram simplified. (7) Gateway note updated — may use programmatically or skip for MVP. | Spec alignment session (Dave W + Claude) |
| 2026-03-16 | Aligned with Monday meeting decisions (D19-D24): CLI flags removed from config precedence, library config added, Docker compose + configurable library path, sliding window replaces auto-compact, multi-terminal deferred to V1. | Meeting (Dave W + Dave J) |
| 2026-03-16 | Gateway changed from programmatic to HTTP (D26, Q4 resolved). All references updated: architecture diagram, tech stack, Phase 1 REPL, Phase 3 Docker, invariants. | Decision (Dave W) |
| 2026-03-16 | Docker moved from Phase 3 to Phase 0. All development happens inside Docker from day one. Phase 3 renamed "Hardening + Launch." | Build session (Dave W + Dave J) |
| 2026-03-17 | Drift remediation integrated. 34 drift points across 6 analyses (Engine, Init, Gateway, Auth, Memory, Provider). Key changes: auth wired with local-owner-mode (not "off"), conversations stored to disk (not in-memory Map), config restructured to four-field bootstrap + adapter config, error taxonomy/sanitization, memory export, structured audit logging, git init must fail loudly, Gateway API contract conformance, adapter selection config-driven. See `drift-remediation-worklist.md` for full item list. | MVP Build Review call (Dave W + Dave J + Claude) |
