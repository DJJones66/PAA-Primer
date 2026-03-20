import http from "node:http";

const host = process.env.MANUAL_PROVIDER_HOST ?? "127.0.0.1";
const port = Number(process.env.MANUAL_PROVIDER_PORT ?? "11434");

const server = http.createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
    res.writeHead(404).end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastMessage = messages[messages.length - 1] ?? { role: "user", content: "" };
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  const prompt = String(lastUserMessage?.content ?? "").toLowerCase();

  let response;

  if (lastMessage.role === "tool") {
    response = {
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: `Completed request with tool output: ${String(lastMessage.content ?? "")}`,
            tool_calls: [],
          },
        },
      ],
    };
  } else if (prompt.includes("update spec")) {
    response = {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I will update the requested spec.",
            tool_calls: [
              {
                id: "tool_update_spec",
                function: {
                  name: "memory_write",
                  arguments: JSON.stringify({
                    path: "documents/fitness-tracker/spec.md",
                    content: "# Fitness Tracker\n\nAn updated MVP spec.\n",
                  }),
                },
              },
            ],
          },
        },
      ],
    };
  } else if (prompt.includes("show history")) {
    response = {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I will read the history.",
            tool_calls: [
              {
                id: "tool_history_spec",
                function: {
                  name: "memory_history",
                  arguments: JSON.stringify({
                    path: "documents/fitness-tracker/spec.md",
                  }),
                },
              },
            ],
          },
        },
      ],
    };
  } else if (prompt.includes("write spec") || prompt.includes("create folder")) {
    response = {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I will write the requested spec.",
            tool_calls: [
              {
                id: "tool_write_agent",
                function: {
                  name: "memory_write",
                  arguments: JSON.stringify({
                    path: "documents/fitness-tracker/AGENT.md",
                    content: "You are the agent for the fitness tracker project.\n",
                  }),
                },
              },
              {
                id: "tool_write_spec",
                function: {
                  name: "memory_write",
                  arguments: JSON.stringify({
                    path: "documents/fitness-tracker/spec.md",
                    content: "# Fitness Tracker\n\nA simple MVP spec.\n",
                  }),
                },
              },
              {
                id: "tool_write_plan",
                function: {
                  name: "memory_write",
                  arguments: JSON.stringify({
                    path: "documents/fitness-tracker/plan.md",
                    content: "# Plan\n\n1. Ship the fitness tracker MVP.\n",
                  }),
                },
              },
            ],
          },
        },
      ],
    };
  } else if (prompt.includes("auth export")) {
    response = {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I will export auth state.",
            tool_calls: [
              {
                id: "tool_auth_export",
                function: {
                  name: "auth_export",
                  arguments: "{}",
                },
              },
            ],
          },
        },
      ],
    };
  } else if (prompt.includes("export memory")) {
    response = {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I will export memory.",
            tool_calls: [
              {
                id: "tool_memory_export",
                function: {
                  name: "memory_export",
                  arguments: "{}",
                },
              },
            ],
          },
        },
      ],
    };
  } else if (prompt.includes("escape")) {
    response = {
      choices: [
        {
          finish_reason: "tool_calls",
          message: {
            content: "I will attempt the write.",
            tool_calls: [
              {
                id: "tool_escape_attempt",
                function: {
                  name: "memory_write",
                  arguments: JSON.stringify({
                    path: "../escape.txt",
                    content: "should be blocked",
                  }),
                },
              },
            ],
          },
        },
      ],
    };
  } else {
    response = {
      choices: [
        {
          finish_reason: "stop",
          message: {
            content: "Hello from the local model path.",
            tool_calls: [],
          },
        },
      ],
    };
  }

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(response));
});

server.listen(port, host, () => {
  process.stdout.write(`manual provider listening on ${host}:${port}\n`);
});
