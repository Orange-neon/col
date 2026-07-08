import type { Difficulty, Problem } from "../../problemTypes";

interface ProblemSpec {
  difficulty: Difficulty;
  id: string;
  title: string;
  tags: string[];
  summary: string;
  input: string;
  output: string;
  solution: string;
  tests: Array<[input: string, expectedOutput: string]>;
  starter?: string;
}

function inline(value: string): string {
  return value.replace(/\n/g, " ↵ ") || "(empty)";
}

export function problem(spec: ProblemSpec): Problem {
  const [exampleInput, exampleOutput] = spec.tests[0];
  return {
    id: spec.id,
    title: spec.title,
    difficulty: spec.difficulty,
    tags: spec.tags,
    description: `# ${spec.title}

${spec.summary}

## Input
${spec.input}

## Output
${spec.output}

### Example
Input: \`${inline(exampleInput)}\`
Output: \`${inline(exampleOutput)}\``,
    starterCode: spec.starter ?? "# Write your solution here\n",
    solutionCode: spec.solution,
    testCases: spec.tests.map(([input, expectedOutput]) => ({ input, expectedOutput })),
  };
}
