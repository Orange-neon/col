import { CURRICULUM_TOPICS, getProblemTopic } from "./curriculum";
import { DIFFICULTIES, DIFFICULTY_CONFIG } from "./difficulty";
import type { Difficulty, Problem, ProblemBank } from "./problemTypes";
import { timedModeForPosition } from "./timedProblems";

const SPECIFIC_EXPLANATIONS: Record<string, string> = {
  "v5-snack-crate-ceiling":
    "Any leftover snacks require one more crate. Adding `capacity - 1` before integer division rounds a partial crate up while leaving an exact multiple at the correct count.",
  "v5-chocolate-bar-breaks":
    "The bar starts as one piece, and every break increases the number of pieces by exactly one. Reaching `rows * columns` separate squares therefore always takes one fewer break than squares.",
  "v5-hexagon-chain-matchsticks":
    "The first hexagon needs six sticks. Every later hexagon shares one existing side, so it contributes only five new sticks; that gives `6 + 5 * (n - 1)`.",
  "v5-concert-seat-label":
    "The rows before the chosen row contain `(row - 1) * per_row` seats. Adding the position within the chosen row gives its one-based seat number.",
  "v5-origami-stack-thickness":
    "Every fold doubles the number of paper layers, so the thickness is multiplied by 2 once per fold. Repeated doubling `folds` times is exactly multiplication by `2 ** folds`.",
  "v5-missing-triangle-angle":
    "A triangle's interior angles always total 180 degrees. Subtracting the two known angles leaves exactly the third angle.",
  "v5-fahrenheit-workshop":
    "Subtracting 32 aligns Fahrenheit's freezing point with Celsius zero. A Fahrenheit degree is `5/9` of a Celsius degree, so multiplying the shifted value by `5/9` completes the conversion.",
  "v5-candle-height-after-burn":
    "Burned height is rate times time, so subtracting it gives what remains. Taking the maximum with zero enforces the physical rule that the candle cannot have negative height.",
  "v5-modular-power-tower":
    "Fermat's theorem makes powers of `a` repeat every `p - 1` exponents because `p` is prime and does not divide `a`. The huge exponent can therefore be reduced modulo `p - 1` first.",
  "v5-total-binary-ones":
    "At bit value `b`, binary numbers alternate between `b` zeros and `b` ones. Counting complete `2b` cycles plus the final partial cycle gives that bit's contribution without visiting every number.",
  "string-middle-character":
    "Zero-based positions run from 0 to `len(word) - 1`. For an odd length, integer-dividing the length by 2 lands exactly on the single middle position.",
  "v5-letter-alphabet-distance":
    "Character codes increase by one for each next letter. Their absolute difference is therefore the number of alphabet steps between the two letters, regardless of which comes first.",
};

/**
 * Give a short reason for the reference solution's main technique. More
 * specific concepts come first so, for example, a trie problem is explained
 * as a trie problem instead of receiving the generic class explanation.
 */
export function explainSolution(problem: Problem): string {
  const has = (tag: string) => problem.tags.includes(tag);
  const code = problem.solutionCode;
  const specific = SPECIFIC_EXPLANATIONS[problem.id];

  if (specific) return specific;

  if (has("segment-trees")) {
    return "Each tree node summarizes one range, so a query only visits nodes that cover the requested range. Lazy values postpone full-range updates without losing the minimum stored for that range.";
  }
  if (has("tries")) {
    return "Words with the same prefix share the same path in a trie. Following the query prefix reaches exactly its possible completions, so unrelated words never need to be searched.";
  }
  if (has("disjoint-sets")) {
    return "Every connected component has one representative. Union merges representatives, and two nodes are connected exactly when `find` reaches the same representative for both.";
  }
  if (has("low-link")) {
    return "A node's low-link value records the earliest discovery reachable without using its parent edge. If a child cannot reach the parent or an ancestor, that parent edge is the only connection and must be a bridge.";
  }
  if (has("prefix-function")) {
    return "The prefix table records how much of the pattern already matches a suffix ending at each position. On a mismatch, that saved overlap skips starts that cannot work while preserving every possible match.";
  }
  if (has("booth-algorithm")) {
    return "Comparing two rotations until their first mismatch proves that a whole block of starts cannot be smallest. Discarding that block keeps the true best rotation while making the scan linear.";
  }
  if (has("euler-trail")) {
    return "A ticket is removed when used, so no edge can appear twice. Adding an airport to the route only after it has no unused exits builds a complete Euler trail in reverse without getting stranded early.";
  }
  if (has("profile-dp")) {
    return "The profile records which cells cross from the previous column into the current one. That boundary contains all information future placements need, so equal profiles can safely share one cached answer.";
  }
  if (has("dynamic-programming")) {
    return "Each state stores the answer for a smaller subproblem. Building larger states only from those saved answers covers every valid choice while avoiding the same work again.";
  }
  if (has("backtracking")) {
    return "Each recursive step makes one valid choice, and backtracking restores the earlier state before trying the next. This visits every valid candidate once while pruning choices that can no longer succeed.";
  }
  if (has("divide-and-conquer")) {
    return "Splitting creates smaller instances of the same problem. Solving both halves and accounting for candidates that cross the split covers all possibilities without comparing every pair directly.";
  }
  if (has("binary-search")) {
    return "The search condition changes only once across the ordered range. Testing the middle therefore proves that one entire half cannot contain the boundary, so that half can be discarded.";
  }
  if (has("sliding-window")) {
    return "The window holds one contiguous candidate and its current state. Moving its edges updates only what entered or left, so every relevant window is considered without rebuilding it from scratch.";
  }
  if (has("two-pointers")) {
    return "The two pointers mark the only undecided part of the ordered data. Each comparison proves that one endpoint can be accepted or discarded, so no possible answer is skipped.";
  }
  if (has("monotonic-stack")) {
    return "The stack keeps only candidates that can still matter, in monotonic order. When that order breaks, popped items have found the first value that resolves them and never need to be checked again.";
  }
  if (has("prefix-sums")) {
    return "A prefix total stores the sum before every position. Subtracting two prefix totals cancels everything outside a requested range, leaving exactly the values inside it.";
  }
  if (has("greedy")) {
    return "The locally best valid choice settles part of the answer without making the remaining choices worse. Repeating that exchange-safe choice produces an optimal complete result.";
  }
  if (has("graphs") && has("sorting") && code.includes("parent = list(range(")) {
    return "Edges are considered from cheapest to most expensive, and an edge is accepted only when it joins two different components. The cut property makes each such cheapest connection safe, while the component check prevents cycles.";
  }
  if (has("graphs")) {
    return "An edge records exactly which states can lead to which others. Traversing those edges explores every reachable option, while the visited or best-value record prevents useless repeated work.";
  }
  if (has("stacks")) {
    return "Only the most recent unresolved item can be matched or removed next, which is last-in, first-out order. A stack stores exactly that order, so each item is handled once.";
  }
  if (has("sorting")) {
    return "Sorting puts values in a predictable order, making the next relevant candidate adjacent or easy to locate. A single scan can then make the required comparisons without trying every ordering.";
  }
  if (has("parsing") || has("nested-structure")) {
    return "The parser's current position and nesting state describe exactly what may be read next. Consuming one complete piece at a time preserves grouping and operator order until the whole input is handled.";
  }
  if (has("recursion")) {
    return "Each call solves a smaller instance of the same task, and the base case stops at a result known directly. Combining returned results therefore builds the answer for the original input.";
  }
  if (has("sets")) {
    return "A set keeps one copy of each value and answers membership questions directly. Updating it as values are processed preserves exactly the distinct or reachable values found so far.";
  }
  if (has("dictionaries")) {
    return "A dictionary gives each key one place to store its current value. Updating that entry as data is read preserves the total or state for every key without repeatedly scanning earlier input.";
  }
  if (has("grids") || has("nested-lists")) {
    return "Row and column indices identify every cell exactly once. Checking the required neighbors or positions from each index covers the whole grid without omitting an edge or interior cell.";
  }
  if (has("classes")) {
    return "The object keeps related state in its fields, and each method applies one valid state change. After all operations, those fields therefore represent the final state being asked for.";
  }
  if (has("modules")) {
    return "The imported library operation already implements the required rule and its edge cases. Converting the input to the form it expects lets that tested operation produce the result directly.";
  }
  if (has("functions")) {
    return "The function gives the repeated transformation one clear input and return value. Calling it applies the same rule consistently, and the returned value can be combined into the final answer.";
  }
  if (has("while-loops")) {
    return "Each loop iteration performs one complete step of the process, so the variables always describe the state after that many steps. The stopping condition is exactly when the requested final state has been reached.";
  }
  if (/%\s*2\b/.test(code) && !/(?:^|\n)\s*(?:for|while)\s+/.test(code)) {
    return "An integer is even exactly when division by 2 leaves remainder 0. The remainder therefore separates every integer into the even and odd cases.";
  }
  if (has("loops") || /(?:^|\n)\s*for\s+/.test(code)) {
    if (/(?:^|\n)\s*\w+\s*\+=\s*1\b/.test(code)) {
      return "The loop examines every possible match once. Increasing the counter only when the rule holds keeps it equal to the number of matches seen so far, so the final count is complete.";
    }
    if (/(?:^|\n)\s*\w*(?:total|sum)\w*\s*\+=/.test(code)) {
      return "Each required contribution is visited once and added to the running total. After every iteration the total equals the sum of the processed contributions, so it is complete when the loop ends.";
    }
    if (/(?:^|\n)\s*\w+\s*\*=/.test(code)) {
      return "Each required factor is visited once and multiplied into the running product. The product therefore represents all processed factors after every iteration and the whole input at the end.";
    }
    if (/\.append\s*\(/.test(code)) {
      return "The loop visits the required values in order and appends each computed result once. The output list therefore contains exactly the processed results in the same predictable order.";
    }
    if (/\b(?:best|largest|smallest|maximum|minimum)\b/.test(code)) {
      return "After each iteration, the saved best value is the best candidate seen so far. Since the loop checks every candidate, that invariant makes the saved value globally best at the end.";
    }
    if (/\bbreak\b/.test(code)) {
      return "Candidates are checked in order, and the loop stops only when the required condition is found. Everything before that point has been ruled out, so the selected candidate is valid and no earlier one was missed.";
    }
    if (/(?:^|\n)\s*print\s*\(/.test(code)) {
      return "The loop generates every required step in order, and each iteration prints that step immediately. Nothing is skipped or reordered, so the output follows the intended sequence exactly.";
    }
    return "The loop visits every required value or position once and applies the same rule to it. Finishing the loop therefore covers the whole input without omitting a case.";
  }
  if (has("conditionals") || /(?:^|\n)\s*if\s+/.test(code)) {
    return "The conditions divide all allowed inputs into the required cases. Because an `if`/`elif` chain selects the first matching case, exactly one correct result is produced, including at the boundaries.";
  }
  if (has("modulo") && code.includes("//")) {
    return "Integer division gives the number of complete groups, while modulo gives what remains. Together they locate the value within a fixed-size cycle without repeated subtraction.";
  }
  if (has("modulo")) {
    return "Modulo returns the remainder after division, so values in the same repeating position have the same remainder. That turns a cycle or divisibility rule into one direct calculation.";
  }
  if (has("division") && code.includes("//")) {
    return "Integer division counts how many complete equal-sized groups fit. The task either asks only for complete groups or guarantees no remainder, so the discarded fractional part is intentionally irrelevant.";
  }
  if (has("conversion")) {
    return "The two units differ by a fixed scale factor. Multiplying or dividing by that factor changes the unit while preserving the underlying quantity.";
  }
  if (/\babs\s*\(/.test(code)) {
    return "Distance has no direction, so a negative difference and its positive counterpart must represent the same distance. Absolute value removes that sign while preserving the size of the difference.";
  }
  if (/\*[^\n]*(?:\*|\n[^\n]*\*)/.test(code)) {
    return "Each input dimension or repeated contribution is independent, so multiplication counts every combination exactly once. That product is the complete quantity requested by the task.";
  }
  if (/\s\/\s/.test(code)) {
    return "Division splits a total into equal shares or compares one quantity with another. The resulting ratio is therefore the requested per-part value or scale factor.";
  }
  if (/\s\*\s/.test(code)) {
    return "Multiplication represents equal groups or the same contribution repeated a fixed number of times. It counts all of those contributions directly instead of adding them one by one.";
  }
  if (/\s[+-]\s/.test(code)) {
    return "The calculation adds each contribution and subtracts each amount that is used or removed. Because every change is included once with the correct sign, the result is the final balance or difference.";
  }
  if (has("arithmetic") || has("geometry") || has("conversion")) {
    return "The formula mirrors the quantity relationship in the task. Applying that relationship to the supplied values works for every allowed case instead of only the example.";
  }
  if (has("slicing")) {
    return "A slice selects exactly the requested contiguous positions while preserving their order. Combining those slices performs the transformation without changing any other characters or values.";
  }
  if (has("strings")) {
    return "A string preserves character order, so each requested piece can be selected or transformed by position. Reassembling those pieces in the required order produces exactly the intended text.";
  }
  if (has("lists")) {
    return "The list preserves both the values and their positions. Processing its entries in order therefore applies the rule once to every required item and keeps the resulting order predictable.";
  }
  if (has("assignment") && /\w+,\s*\w+\s*=\s*\w+,\s*\w+/.test(code)) {
    return "Python evaluates every value on the right before assigning either name on the left. Reversing those right-hand values therefore swaps them without one assignment overwriting the other.";
  }
  if (has("print") || /(?:^|\n)\s*print\s*\(/.test(code)) {
    return "The variable text is kept unchanged while fixed text is placed around or between it. Printing those pieces in the requested order preserves the input and produces the exact layout.";
  }
  return "The solution applies the task's rule directly to the supplied values. No extra cases are needed, so the same steps work for every valid input.";
}

/** Keep the authored statement concise, then add one concept-focused reason. */
export function addProblemGuidance(problem: Problem): Problem {
  if (problem.description.includes("### Why this works")) return problem;
  const description = `${problem.description.trim()}\n\n### Why this works\n${explainSolution(problem)}`;
  return { ...problem, description };
}

export const BONUS_RANGES: Record<Difficulty, { minimum: number; maximum: number }> = {
  easy: { minimum: 20, maximum: 30 },
  medium: { minimum: 50, maximum: 100 },
  hard: { minimum: 100, maximum: 200 },
};

const ADVANCED_TAG_WEIGHTS: Record<string, number> = {
  recursion: 180,
  "dynamic-programming": 180,
  graphs: 160,
  algorithms: 140,
  "nested-loops": 110,
  grids: 90,
  sorting: 80,
  searching: 70,
  stacks: 60,
  sequences: 40,
};

export function scoreProblemComplexity(problem: Problem): number {
  const topicIndex = CURRICULUM_TOPICS.findIndex((topic) => topic.id === getProblemTopic(problem));
  const structuralScore = problem.tags.reduce(
    (total, tag) => total + (ADVANCED_TAG_WEIGHTS[tag] ?? 0),
    0,
  );
  const lines = problem.solutionCode.split("\n").filter((line) => line.trim()).length;
  const branchCount = (problem.solutionCode.match(/\b(?:if|elif|for|while|def|class)\b/g) ?? []).length;
  const maximumIndent = problem.solutionCode.split("\n").reduce((maximum, line) => {
    const spaces = line.match(/^ */)?.[0].length ?? 0;
    return Math.max(maximum, spaces);
  }, 0);
  return topicIndex * 1_000 + structuralScore + lines * 3 + branchCount * 8 + maximumIndent;
}

function bonusForPosition(difficulty: Difficulty, index: number, count: number): number {
  const { minimum, maximum } = BONUS_RANGES[difficulty];
  if (count <= 1) return minimum;
  return minimum + Math.round(((maximum - minimum) * index) / (count - 1));
}

export function applyProblemProgression(bank: ProblemBank): ProblemBank {
  const ranked = DIFFICULTIES.flatMap((difficulty) => {
    const problems = bank.problems
      .filter((problem) => problem.difficulty === difficulty)
      .map((problem) => ({ problem, complexityScore: scoreProblemComplexity(problem) }))
      .sort(
        (left, right) =>
          left.complexityScore - right.complexityScore ||
          left.problem.title.localeCompare(right.problem.title),
      );
    return problems.map(({ problem, complexityScore }, index) => ({
      ...addProblemGuidance(problem),
      complexityScore,
      progressionOrder: index + 1,
      bonusPoints: bonusForPosition(difficulty, index, problems.length),
      timedMode: timedModeForPosition(bank.version, index, problems.length),
    }));
  });
  return { ...bank, problems: ranked };
}

export function getProblemBonus(problem: Problem): number {
  return problem.bonusPoints ?? BONUS_RANGES[problem.difficulty].minimum;
}

export function getProblemReward(problem: Problem): number {
  return DIFFICULTY_CONFIG[problem.difficulty].points + getProblemBonus(problem);
}
