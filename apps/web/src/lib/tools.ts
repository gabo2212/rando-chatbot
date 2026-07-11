import { tool } from "ai";
import { z } from "zod";

import { createApiClient } from "./api-client";
import { searchDocuments as ragSearch } from "./rag";
import { getSkillByName, skills } from "./skills-registry";

// TODO: implement real API calls using createApiClient

export function createTools(token: string, options?: { userId?: string }) {
  const _api = createApiClient(token);
  const userId = options?.userId;

  return {
    getSkillDetails: tool({
      description:
        "Load the full instructions for a skill by its name. Call this before responding whenever a skill is relevant to the user's request.",
      inputSchema: z.object({
        name: z
          .string()
          .describe(
            `The name of the skill to load. Available names: ${skills.map((s) => s.name).join(", ")}`,
          ),
      }),
      execute: async ({ name }) => {
        const skill = getSkillByName(name);
        if (!skill) return { error: `Skill "${name}" not found.` };
        return { name: skill.name, instructions: skill.body };
      },
    }),

    getItems: tool({
      description: "Fetches a list of items from the API.",
      inputSchema: z.object({}),
      execute: async () => ({ items: [] }),
    }),

    getItemById: tool({
      description: "Fetches a single item by its ID from the API.",
      inputSchema: z.object({
        id: z.string().describe("The unique identifier of the item to fetch."),
      }),
      execute: async ({ id: _id }) => ({ item: null }),
    }),

    submitAction: tool({
      description: "Submits an action or data payload to the API.",
      inputSchema: z.object({
        action: z.string().describe("The action to submit."),
        data: z.record(z.string(), z.unknown()).optional().describe("Optional payload data."),
      }),
      execute: async () => ({ success: true }),
    }),

    searchDocuments: tool({
      description:
        "Search the user's uploaded documents for relevant information. Use when the question may depend on private files.",
      inputSchema: z.object({
        query: z.string().describe("The search query."),
      }),
      execute: async ({ query }) => {
        if (!userId) {
          return { results: [], note: "Sign in to search documents." };
        }
        try {
          return await ragSearch({ userId, query });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Search failed";
          return { results: [], note: message };
        }
      },
    }),
  };
}
