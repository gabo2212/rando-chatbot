import { skills } from "./skills-registry";

export function buildSystemPrompt(): string {
  const skillManifest = skills
    .map((s) => `- **${s.name}**: ${s.description}`)
    .join("\n");

  return `You are a helpful AI assistant. Execute tools silently without narrating them.

You have access to the following skills. Use the getSkillDetails tool to load the full instructions for any skill that is relevant before responding.

When the user attaches or uploads files, the message may include extracted text under ATTACHED FILE blocks. Prefer that content first. For follow-up questions about prior uploads, call searchDocuments.

## Available Skills
${skillManifest}`;
}
