import { Router } from "express";
import { createClient } from "@supabase/supabase-js";
import { logger } from "../lib/logger";

const router = Router();

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

const S1_TOPICS: Record<string, string> = {
  "1.1": "Properties and uses of materials",
  "1.2": "Atomic structure",
  "1.3": "Quantities of atoms",
  "2.1": "Types of materials",
  "2.2": "Bonding between atoms",
  "2.3": "Quantities of molecules and ions",
  "3.1": "Molecule polarity",
  "3.2": "Interactions between molecules",
  "3.3": "Hydrocarbons",
  "3.4": "Polymers",
  "4.1": "Miscibility and solutions",
  "4.2": "Solutions of ionic substances",
  "4.3": "Quantities in reactions",
  "4.4": "Energy in reactions",
  "5.1": "Acid–base concepts",
  "5.2": "Reactions of acids and bases",
  "5.3": "The pH scale",
  "6.1": "Concepts of oxidation and reduction",
  "6.2": "Metal reactivity",
  "6.3": "Electrochemistry",
};

const S2_TOPICS: Record<string, string> = {
  "1.1": "Global warming and climate change",
  "1.2": "Photochemical smog",
  "1.3": "Volumetric analysis",
  "1.4": "Chromatography",
  "1.5": "Atomic spectroscopy",
  "2.1": "Rates of reactions",
  "2.2": "Equilibrium and yield",
  "2.3": "Optimising production",
  "3.1": "Introduction to organic chemistry",
  "3.2": "Alcohols",
  "3.3": "Aldehydes and ketones",
  "3.4": "Carbohydrates",
  "3.5": "Carboxylic acids",
  "3.6": "Amines",
  "3.7": "Esters",
  "3.8": "Amides",
  "3.9": "Triglycerides",
  "3.10": "Proteins",
  "4.1": "Energy resources",
  "4.2": "Water",
  "4.3": "Soil",
  "4.4": "Materials resources",
};

// Per-topic SACE curriculum learning objective hints used to anchor Claude to syllabus language.
const S1_LEARNING_OBJECTIVES: Record<string, string> = {
  "1.1": "properties (physical/chemical) of metals, non-metals and metalloids; uses linked to properties; classification of materials",
  "1.2": "atomic number, mass number, isotopes, electron configuration, periodic trends; Bohr model and quantum model overview",
  "1.3": "mole concept, Avogadro's number, molar mass, empirical and molecular formulae, percentage composition",
  "2.1": "ionic, covalent, metallic bonding types; properties of ionic compounds, metals, network covalent solids, molecular substances",
  "2.2": "Lewis structures, VSEPR theory, bond polarity, electronegativity differences, naming binary compounds",
  "2.3": "molar mass of compounds, stoichiometry of reactions, limiting reagents, percentage yield",
  "3.1": "molecular polarity from bond polarity and shape; polar vs non-polar molecules; effect on physical properties",
  "3.2": "dispersion forces, dipole–dipole interactions, hydrogen bonding; effect on boiling points and solubility",
  "3.3": "homologous series, IUPAC nomenclature, structural and displayed formulae of alkanes, alkenes, alkynes",
  "3.4": "addition and condensation polymerisation; monomer to polymer; properties of polymers",
  "4.1": "like-dissolves-like principle; miscibility; distinguishing aqueous and non-aqueous solutions",
  "4.2": "solubility rules, dissociation of ionic solids in water, concentration in mol/L and g/L",
  "4.3": "stoichiometric calculations including moles, concentration, mass; dilution calculations",
  "4.4": "exothermic and endothermic reactions; enthalpy change; calorimetry calculations; bond energy",
  "5.1": "Arrhenius and Brønsted–Lowry definitions; conjugate acid–base pairs; amphoteric species",
  "5.2": "neutralisation reactions; reactions of acids with metals, carbonates and oxides; writing ionic equations",
  "5.3": "pH scale, relationship to [H+]; strong vs weak acids/bases; effect of dilution on pH",
  "6.1": "oxidation states; oxidation and reduction definitions; identifying oxidising and reducing agents",
  "6.2": "activity series of metals; displacement reactions; corrosion and galvanic cells",
  "6.3": "galvanic and electrolytic cells; electrode reactions; Faraday's laws; applications (batteries, electroplating)",
};

const S2_LEARNING_OBJECTIVES: Record<string, string> = {
  "1.1": "enhanced greenhouse effect; climate models; role of CO2, CH4, N2O, H2O; carbon cycle; mitigation strategies",
  "1.2": "formation of primary and secondary pollutants; NOx, VOCs, ozone in troposphere; health and environmental effects; photochemical reactions",
  "1.3": "standard solutions; titration technique and calculations; primary standards; back-titration; acid–base indicators",
  "1.4": "principles of chromatography; Rf values; paper, TLC, gas and HPLC; stationary and mobile phases",
  "1.5": "atomic emission and absorption spectra; flame tests; Beer–Lambert law; quantitative analysis using spectroscopy",
  "2.1": "collision theory; activation energy; effect of concentration, temperature, surface area, catalysts on rate; rate equations (qualitative)",
  "2.2": "dynamic equilibrium; Le Chatelier's principle; Kc expression and calculations; effect of changes on equilibrium position",
  "2.3": "industrial applications of equilibrium (Haber, Contact processes); optimising yield and rate; economic and environmental trade-offs",
  "3.1": "functional groups; homologous series; IUPAC nomenclature; structural isomers; primary/secondary/tertiary classification",
  "3.2": "structure and properties of alcohols; oxidation reactions (primary→aldehyde→carboxylic acid, secondary→ketone); dehydration; hydrogen bonding",
  "3.3": "structure of aldehydes and ketones; carbonyl group; oxidation tests (Tollens', Fehling's); reduction reactions",
  "3.4": "monosaccharides, disaccharides, polysaccharides; glycosidic bonds; structure of glucose, sucrose, starch, cellulose; hydrolysis",
  "3.5": "carboxyl group; acidic nature; esterification; reactions with bases; naming carboxylic acids",
  "3.6": "primary/secondary/tertiary amines; basicity; reactions with acids; naming amines",
  "3.7": "ester linkage; naming esters; esterification and hydrolysis reactions; uses of esters",
  "3.8": "amide bond (peptide bond); formation from amine + carboxylic acid; hydrolysis; polyamides (nylon)",
  "3.9": "structure of triglycerides; ester bonds; saponification; saturated vs unsaturated fats; role in biology",
  "3.10": "amino acid structure; peptide bonds; primary to quaternary protein structure; denaturation; enzyme function",
  "4.1": "renewable vs non-renewable energy; calorimetry; energy density; fossil fuels combustion; biofuels; hydrogen economy",
  "4.2": "water as a solvent; water treatment; hardness; chlorination; pH control; water quality indicators",
  "4.3": "soil components; pH effects on nutrient availability; fertilisers; nitrogen cycle; salinity and remediation",
  "4.4": "life-cycle analysis; recycling and reuse; green chemistry principles; e-waste; materials sustainability",
};

function extractJsonArray(text = ""): unknown[] {
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {}
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

router.post("/generate-questions", async (req, res) => {
  const { stage, topicCode, count = 10, difficulty = "mixed" } = req.body;
  if (!stage || !topicCode) {
    res.status(400).json({ error: "stage and topicCode required" });
    return;
  }

  const stageKey = stage === "Chemistry Stage 1" ? "s1" : "s2";
  const topicMap = stageKey === "s1" ? S1_TOPICS : S2_TOPICS;
  const topicName = topicMap[topicCode];
  if (!topicName) {
    res.status(400).json({ error: `Unknown topic code: ${topicCode}` });
    return;
  }

  const difficultyInstruction =
    difficulty === "mixed"
      ? "Vary difficulty across questions: include easy (1–2), medium (3), and hard (4–5) questions."
      : `All questions should have difficulty ${difficulty} out of 5.`;

  const objectivesMap = stageKey === "s1" ? S1_LEARNING_OBJECTIVES : S2_LEARNING_OBJECTIVES;
  const learningObjectives = objectivesMap[topicCode] || topicName;

  const system = [
    "You are generating multiple-choice questions for SACE Chemistry students.",
    "CRITICAL CONSTRAINT: All questions must be strictly based on the SACE Chemistry syllabus.",
    "Do NOT draw on general chemistry knowledge that falls outside the SACE learning requirements.",
    "Every question must be directly answerable using only what a SACE student is expected to know for this topic.",
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    `Generate exactly ${count} questions.`,
    "Each object must have these exact keys:",
    "  question (string)",
    "  options (array of exactly 4 strings)",
    "  answer_index (integer 0–3)",
    "  solution (string — explain why the answer is correct using SACE curriculum language, 2–4 sentences)",
    "  subtopic (short free-text label for the specific concept, matching SACE dot-point language)",
    "  difficulty (integer 1–5)",
    "Questions must be accurate, unambiguous, and test conceptual understanding aligned with SACE assessment descriptors.",
    "Use terminology consistent with the SACE Chemistry subject outline. Avoid IB, VCE, or HSC-specific content.",
    "Do not repeat the same scenario across questions.",
    difficultyInstruction,
  ].join("\n");

  const user = [
    `Generate ${count} MCQs for the SACE ${stage} topic: ${topicName} (${topicCode}).`,
    "",
    "SACE curriculum learning requirements for this topic:",
    learningObjectives,
    "",
    "All questions must directly assess one or more of these specific learning requirements.",
    "Use the exact concepts, terminology and scope listed above — nothing broader.",
  ].join("\n");

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: 6000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach Claude API");
    res.status(500).json({ error: "Failed to reach Claude API", detail: (err as Error).message });
    return;
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text();
    res.status(500).json({ error: "Claude API error", detail: errText });
    return;
  }

  const claudeData = await claudeResponse.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";
  const questions = extractJsonArray(rawText) as Array<{
    subtopic?: string; question: string; options: string[];
    answer_index: number; solution?: string; difficulty?: number;
  }>;

  if (!questions.length) {
    res.status(200).json({ inserted: 0, message: "No questions generated" });
    return;
  }

  const rows = questions.map((q) => ({
    source: "ai_generated",
    subject: stage,
    topic_code: topicCode,
    topic: topicName,
    subtopic: q.subtopic || null,
    question: q.question,
    options: q.options,
    answer_index: q.answer_index,
    solution: q.solution || null,
    difficulty: q.difficulty || null,
    status: "pending",
  }));

  const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY!);
  const { error } = await supabaseAdmin.from("draft_questions").insert(rows);
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ inserted: rows.length });
});

export default router;
