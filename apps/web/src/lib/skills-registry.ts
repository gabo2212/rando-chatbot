export type Skill = {
  name: string;
  description: string;
  body: string;
  folder: string;
};

export const skills: Skill[] = [
  {
    name: "Example Skill",
    description: "A placeholder skill. Replace with real domain instructions.",
    body: `# Example Skill

Instructions for this domain go here. Replace with real content.`,
    folder: "example-skill",
  },
  {
    name: "General Reply Style",
    description:
      "Controls tone, greeting style, and how the assistant talks to users in every reply.",
    body: `# General Reply Skill

## Tone
- Be clear, calm, and direct
- Prefer short paragraphs over walls of text
- Avoid fluff and corporate filler

## Ending Replies
End with a brief, useful next step when appropriate — never forced cheerleading.`,
    folder: "general-reply-style",
  },
];

export function getSkillByName(name: string): Skill | undefined {
  return skills.find((s) => s.name.toLowerCase() === name.toLowerCase());
}
