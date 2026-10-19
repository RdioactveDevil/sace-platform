/**
 * Repair for questions stored with a literal backslash-n ("...15, ...\n\nWhich
 * rule...") instead of a line break. Before #136, repairLatexJson doubled the
 * backslash of a model's JSON "\n" escape, as if it were a LaTeX command.
 *
 * NOTE: mirrors restoreLiteralNewlines in artifacts/gradefarm/src/lib/mathMarkup.js
 * and LATEX_N_COMMANDS in artifacts/api-server/src/lib/json-latex.ts. Keep them in sync.
 */

// LaTeX commands starting with "n". Any other "\n" + letters is a line break.
export const LATEX_N_COMMANDS = new Set(
  ("ne neq neg nabla nu ni not notin newline nleq ngeq nless ngtr nmid nexists natural " +
   "nearrow nwarrow nolimits nsubseteq nsupseteq nparallel nsim ncong nleftarrow nrightarrow " +
   "nLeftarrow nRightarrow nleftrightarrow nLeftrightarrow nvdash nVdash nprec nsucc").split(" "),
);

/** Turn literal "\n" into line breaks, leaving \neq, \nabla, \nu and `\\` row breaks alone. */
export function restoreLiteralNewlines(text: string): string {
  if (!text.includes("\\n")) return text;
  return text.replace(/(?<!\\)\\(n[A-Za-z]*)/g, (whole, name: string) =>
    LATEX_N_COMMANDS.has(name) ? whole : `\n${name.slice(1)}`,
  );
}
