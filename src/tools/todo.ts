import { err, ok, schemaFor, type ToolDefinition } from "./types";

export type TodoStatus = "pending" | "in_progress" | "completed";

export interface TodoItem {
  content: string;
  status: TodoStatus;
  activeForm: string;
}

/** In-memory todo list, one per session. */
export class TodoStore {
  private todos: TodoItem[] = [];

  set(todos: TodoItem[]): void {
    this.todos = todos;
  }

  list(): TodoItem[] {
    return this.todos;
  }
}

function formatTodos(todos: TodoItem[]): string {
  if (todos.length === 0) return "No todos.";
  return todos
    .map((t, i) => {
      const box = t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[~]" : "[ ]";
      return `${i + 1}. ${box} ${t.content}`;
    })
    .join("\n");
}

function parseTodos(raw: unknown): TodoItem[] | null {
  if (!Array.isArray(raw)) return null;
  const out: TodoItem[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) return null;
    const r = item as Record<string, unknown>;
    if (typeof r.content !== "string" || typeof r.activeForm !== "string") return null;
    if (r.status !== "pending" && r.status !== "in_progress" && r.status !== "completed") return null;
    out.push({ content: r.content, status: r.status, activeForm: r.activeForm });
  }
  return out;
}

export function createTodoTools(store: TodoStore): ToolDefinition[] {
  const todoWrite: ToolDefinition = {
    name: "todo_write",
    description:
      "Replace the session todo list. Use for multi-step tasks: break work into small items, mark one in_progress at a time.",
    inputSchema: schemaFor(
      {
        todos: {
          type: "array",
          description: "Full todo list: [{content, status: pending|in_progress|completed, activeForm}]",
        },
      },
      ["todos"],
    ),
    permission: "read", // session-local state; no side effects, never prompts
    handler: async (args) => {
      const todos = parseTodos(args.todos);
      if (!todos) return err(`Invalid "todos" argument.`);
      store.set(todos);
      return ok(`Todo list updated:\n${formatTodos(todos)}`);
    },
  };

  const todoRead: ToolDefinition = {
    name: "todo_read",
    description: "Read the current session todo list.",
    inputSchema: schemaFor({}, []),
    permission: "read",
    handler: async () => ok(formatTodos(store.list())),
  };

  return [todoWrite, todoRead];
}
