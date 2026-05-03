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
  "5.1": "Acid\u2013base concepts",
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

// ─── AC v9 Year 7 Mathematics ─────────────────────────────────────────────────
// Names are verbatim from australiancurriculum.edu.au (Year 7 Maths, v9).
// Internal codes: N1–N9, A1–A6, M1–M6, SP1–SP3, ST1–ST3, P1–P2.
const Y7_MATHS_TOPICS: Record<string, string> = {
  // Number (AC9M7N01–N09)
  "N1": "describe the relationship between perfect square numbers and square roots, and use squares of numbers and square roots of perfect square numbers to solve problems",
  "N2": "represent natural numbers as products of powers of prime numbers using exponent notation",
  "N3": "represent natural numbers in expanded notation using place value and powers of 10",
  "N4": "find equivalent representations of rational numbers and represent rational numbers on a number line",
  "N5": "round decimals to a given accuracy appropriate to the context and use appropriate rounding and estimation to check the reasonableness of solutions",
  "N6": "use the 4 operations with positive rational numbers including fractions, decimals and percentages to solve problems using efficient calculation strategies",
  "N7": "compare, order and solve problems involving addition and subtraction of integers",
  "N8": "recognise, represent and solve problems involving ratios",
  "N9": "use mathematical modelling to solve practical problems, involving rational numbers and percentages, including financial contexts; formulate problems, choosing representations and efficient calculation strategies, using digital tools as appropriate; interpret and communicate solutions in terms of the situation, justifying choices made about the representation",
  // Algebra (AC9M7A01–A06)
  "A1": "recognise and use variables to represent everyday formulas algebraically and substitute values into formulas to determine an unknown",
  "A2": "formulate algebraic expressions using constants, variables, operations and brackets",
  "A3": "solve one-variable linear equations with natural number solutions; verify the solution by substitution",
  "A4": "describe relationships between variables represented in graphs of functions from authentic data",
  "A5": "generate tables of values from visually growing patterns or the rule of a function; describe and plot these relationships on the Cartesian plane",
  "A6": "manipulate formulas involving several variables using digital tools, and describe the effect of systematic variation in the values of the variables",
  // Measurement (AC9M7M01–M06)
  "M1": "solve problems involving the area of triangles and parallelograms using established formulas and appropriate units",
  "M2": "solve problems involving the volume of right prisms including rectangular and triangular prisms, using established formulas and appropriate units",
  "M3": "describe the relationship between \u03c0 and the features of circles including the circumference, radius and diameter",
  "M4": "identify corresponding, alternate and co-interior relationships between angles formed when parallel lines are crossed by a transversal; use them to solve problems and explain reasons",
  "M5": "demonstrate that the interior angle sum of a triangle in the plane is 180\u00b0 and apply this to determine the interior angle sum of other shapes and the size of unknown angles",
  "M6": "use mathematical modelling to solve practical problems involving measurement; formulate problems, interpret and communicate solutions in terms of the situation, justifying choices made about the representation",
  // Space (AC9M7SP01–SP03)
  "SP1": "represent objects in 2 dimensions; discuss and reason about the advantages and disadvantages of different representations",
  "SP2": "classify triangles, quadrilaterals and other polygons according to their side and angle properties; identify and reason about relationships",
  "SP3": "describe transformations of a set of points using coordinates in the Cartesian plane, translations and reflections on an axis, and rotations of multiples of 90\u00b0",
  // Statistics (AC9M7ST01–ST03)
  "ST1": "acquire data sets for discrete and continuous numerical variables and calculate the range, median, mean and mode; make and justify decisions about which measures of central tendency provide useful insights into the nature of the distribution of data",
  "ST2": "create different types of numerical data displays including stem-and-leaf plots using software where appropriate; describe and compare the distribution of data, commenting on the shape, centre and spread including outliers and determining the range, median, mean and mode",
  "ST3": "plan and conduct statistical investigations involving data for discrete and continuous numerical variables; analyse and interpret distributions of data and report findings in terms of shape and summary statistics",
  // Probability (AC9M7P01–P02)
  "P1": "identify the sample space for single-stage events; assign probabilities to the outcomes of these events and predict relative frequencies for related experiments",
  "P2": "conduct repeated chance experiments and run simulations with a large number of trials using digital tools; compare observations with predictions about the likelihood of outcomes, and identify the effect of sample size on the reliability of predictions",
};

// ─── AC v9 Year 7 English ─────────────────────────────────────────────────────
// Names are verbatim from australiancurriculum.edu.au (Year 7 English, v9).
// Strand codes: Language (AC9E7LA), Literature (AC9E7LE), Literacy (AC9E7LY).
const Y7_ENGLISH_TOPICS: Record<string, string> = {
  // Language (AC9E7LA01–LA09)
  "L1": "understand how language expresses and creates personal and social identities",
  "L2": "recognise language used to evaluate texts including visual and multimodal texts, and how evaluations of a text can be substantiated by reference to the text and other sources",
  "L3": "identify and describe how texts are structured differently depending on their purpose and how language features vary in texts",
  "L4": "understand that the cohesion of texts relies on devices that signal structure and guide readers, such as overviews and initial and concluding paragraphs",
  "L5": "understand how complex and compound-complex sentences can be used to elaborate, extend and explain ideas",
  "L6": "understand how consistency of tense through verbs and verb groups achieves clarity in sentences",
  "L7": "analyse how techniques such as vectors, angle and/or social distance in visual texts can be used to create a perspective",
  "L8": "investigate the role of vocabulary in building specialist and technical knowledge, including terms that have both everyday and technical meanings",
  "L9": "understand the use of punctuation including colons and brackets to support meaning",
  // Literature (AC9E7LE01–LE07)
  "LT1": "identify and explore ideas, points of view, characters, events and/or issues in literary texts, drawn from historical, social and/or cultural contexts, by First Nations Australian, and wide-ranging Australian and world authors",
  "LT2": "form an opinion about characters, settings and events in texts, identifying areas of agreement and difference with others\u2019 opinions and justifying a response",
  "LT3": "explain the ways that literary devices and language features such as dialogue, and images are used to create character, and to influence emotions and opinions in different types of texts",
  "LT4": "discuss the aesthetic and social value of literary texts using relevant and appropriate metalanguage",
  "LT5": "identify and explain the ways that characters, settings and events combine to create meaning in narratives",
  "LT6": "identify and explain how literary devices create layers of meaning in texts including poetry",
  "LT7": "create and edit literary texts that experiment with language features and literary devices encountered in texts",
  // Literacy (AC9E7LY01–LY08)
  "LC1": "explain the effect of current technology on reading, creating and responding to texts including media texts",
  "LC2": "use interaction skills when discussing and presenting ideas and information including evaluations of the features of spoken texts",
  "LC3": "analyse the ways in which language features shape meaning and vary according to audience and purpose",
  "LC4": "explain the structure of ideas such as the use of taxonomies, cause and effect, extended metaphors and chronology",
  "LC5": "use comprehension strategies such as visualising, predicting, connecting, summarising, monitoring, questioning and inferring to analyse and summarise information and ideas",
  "LC6": "plan, create, edit and publish written and multimodal texts, selecting subject matter, and using text structures, language features, literary devices and visual features as appropriate to convey information, ideas and opinions in ways that may be imaginative, reflective, informative, persuasive and/or analytical",
  "LC7": "plan, create, rehearse and deliver presentations for purposes and audiences in ways that may be imaginative, reflective, informative, persuasive and/or analytical, by selecting text structures, language features, literary devices and visual features, and using features of voice including volume, tone, pitch and pace",
  "LC8": "understand how to use spelling rules and word origins; for example, Greek and Latin roots, base words, suffixes, prefixes and spelling patterns to learn new words and how to spell them",
};

// Per-topic SACE curriculum learning objective hints
const S1_LEARNING_OBJECTIVES: Record<string, string> = {
  "1.1": "properties (physical/chemical) of metals, non-metals and metalloids; uses linked to properties; classification of materials",
  "1.2": "atomic number, mass number, isotopes, electron configuration, periodic trends; Bohr model and quantum model overview",
  "1.3": "mole concept, Avogadro's number, molar mass, empirical and molecular formulae, percentage composition",
  "2.1": "ionic, covalent, metallic bonding types; properties of ionic compounds, metals, network covalent solids, molecular substances",
  "2.2": "Lewis structures, VSEPR theory, bond polarity, electronegativity differences, naming binary compounds",
  "2.3": "molar mass of compounds, stoichiometry of reactions, limiting reagents, percentage yield",
  "3.1": "molecular polarity from bond polarity and shape; polar vs non-polar molecules; effect on physical properties",
  "3.2": "dispersion forces, dipole\u2013dipole interactions, hydrogen bonding; effect on boiling points and solubility",
  "3.3": "homologous series, IUPAC nomenclature, structural and displayed formulae of alkanes, alkenes, alkynes",
  "3.4": "addition and condensation polymerisation; monomer to polymer; properties of polymers",
  "4.1": "like-dissolves-like principle; miscibility; distinguishing aqueous and non-aqueous solutions",
  "4.2": "solubility rules, dissociation of ionic solids in water, concentration in mol/L and g/L",
  "4.3": "stoichiometric calculations including moles, concentration, mass; dilution calculations",
  "4.4": "exothermic and endothermic reactions; enthalpy change; calorimetry calculations; bond energy",
  "5.1": "Arrhenius and Br\u00f8nsted\u2013Lowry definitions; conjugate acid\u2013base pairs; amphoteric species",
  "5.2": "neutralisation reactions; reactions of acids with metals, carbonates and oxides; writing ionic equations",
  "5.3": "pH scale, relationship to [H+]; strong vs weak acids/bases; effect of dilution on pH",
  "6.1": "oxidation states; oxidation and reduction definitions; identifying oxidising and reducing agents",
  "6.2": "activity series of metals; displacement reactions; corrosion and galvanic cells",
  "6.3": "galvanic and electrolytic cells; electrode reactions; Faraday's laws; applications (batteries, electroplating)",
};

const S2_LEARNING_OBJECTIVES: Record<string, string> = {
  "1.1": "enhanced greenhouse effect; climate models; role of CO2, CH4, N2O, H2O; carbon cycle; mitigation strategies",
  "1.2": "formation of primary and secondary pollutants; NOx, VOCs, ozone in troposphere; health and environmental effects; photochemical reactions",
  "1.3": "standard solutions; titration technique and calculations; primary standards; back-titration; acid\u2013base indicators",
  "1.4": "principles of chromatography; Rf values; paper, TLC, gas and HPLC; stationary and mobile phases",
  "1.5": "atomic emission and absorption spectra; flame tests; Beer\u2013Lambert law; quantitative analysis using spectroscopy",
  "2.1": "collision theory; activation energy; effect of concentration, temperature, surface area, catalysts on rate; rate equations (qualitative)",
  "2.2": "dynamic equilibrium; Le Chatelier's principle; Kc expression and calculations; effect of changes on equilibrium position",
  "2.3": "industrial applications of equilibrium (Haber, Contact processes); optimising yield and rate; economic and environmental trade-offs",
  "3.1": "functional groups; homologous series; IUPAC nomenclature; structural isomers; primary/secondary/tertiary classification",
  "3.2": "structure and properties of alcohols; oxidation reactions (primary\u2192aldehyde\u2192carboxylic acid, secondary\u2192ketone); dehydration; hydrogen bonding",
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

// AC v9 Year 7 Mathematics — elaborations grounded in AC9M7N01–AC9M7P02
const Y7_MATHS_LEARNING_OBJECTIVES: Record<string, string> = {
  "N1":  "AC9M7N01: understand that squaring and finding square roots are inverse operations; use the relationship to solve problems; estimate square roots of non-perfect-square numbers; connect perfect squares to square area models",
  "N2":  "AC9M7N02: express numbers as products of prime factors using factor trees and repeated division; write using exponent (index) notation; connect prime factorisation to finding HCF and LCM",
  "N3":  "AC9M7N03: write numbers in expanded form using place value and powers of 10 (e.g. 4375 = 4×10³ + 3×10² + 7×10 + 5); connect to scientific notation; understand the role of zero as a place holder",
  "N4":  "AC9M7N04: find equivalent fractions, decimals and percentages; compare and order rational numbers; plot fractions and decimals on a number line; convert between representations",
  "N5":  "AC9M7N05: round to a specified number of decimal places or significant figures; use estimation to check reasonableness of calculated answers; apply in measurement and financial contexts",
  "N6":  "AC9M7N06: add, subtract, multiply and divide positive fractions (including mixed numbers), decimals and percentages; apply order of operations; choose efficient strategies; solve word problems",
  "N7":  "AC9M7N07: represent integers on a number line; compare and order integers; add and subtract integers using a number line and rules of sign; solve problems involving temperature, altitude, financial contexts",
  "N8":  "AC9M7N08: understand ratio as a comparison of two quantities; simplify ratios; use ratios to divide quantities; solve ratio problems in practical contexts including recipes and scale drawings",
  "N9":  "AC9M7N09: formulate practical problems involving rational numbers, percentages and ratios; select appropriate representations and strategies; use digital tools where appropriate; interpret and justify solutions in context (e.g. profit/loss, GST, best buys)",
  "A1":  "AC9M7A01: identify variables and constants in real-world formulas; substitute values to find unknowns; use formulas for area, perimeter and other everyday applications; distinguish between dependent and independent variables",
  "A2":  "AC9M7A02: write algebraic expressions to represent situations; use correct algebraic notation including index notation and brackets; simplify expressions by collecting like terms; evaluate by substituting values",
  "A3":  "AC9M7A03: solve one-step and two-step linear equations using inverse operations; verify solutions by substituting back; write and solve equations arising from word problems with natural number solutions",
  "A4":  "AC9M7A04: identify and describe features of graphs of functions from real-world data; connect shape of graph to the relationship described; identify linear vs non-linear trends",
  "A5":  "AC9M7A05: continue geometric and numerical growth patterns; write rules describing the pattern; generate tables of values; plot (x, y) pairs on the Cartesian plane; identify the shape of the resulting graph",
  "A6":  "AC9M7A06: use spreadsheets or graphing tools to change variable values in formulas; observe and describe the effect on the output; identify how changes in one variable affect another",
  "M1":  "AC9M7M01: apply A = ½bh for triangles and A = bh for parallelograms; identify the correct base and perpendicular height; decompose composite shapes; choose appropriate units; solve practical area problems",
  "M2":  "AC9M7M02: apply V = lwh for rectangular prisms and V = ½bhl for triangular prisms; connect volume to the area of the cross-section multiplied by the length; convert between units of volume and capacity",
  "M3":  "AC9M7M03: demonstrate that C = πd for all circles; use C = 2πr and relate to diameter; explain that π is the ratio of circumference to diameter; use π ≈ 3.14 or exact π in calculations; apply to real contexts such as wheels and pipes",
  "M4":  "AC9M7M04: identify corresponding, alternate and co-interior angles formed by a transversal crossing parallel lines; apply angle relationships to find unknown angles; provide geometric reasons; apply to real-world geometry problems",
  "M5":  "AC9M7M05: prove the triangle angle sum = 180°; use this to find unknown angles in triangles; extend to find the interior angle sum of quadrilaterals and other polygons; apply to problems involving missing angles",
  "M6":  "AC9M7M06: identify and formulate a measurement problem from a practical context; select an appropriate model, formula and units; carry out calculations and interpret results; evaluate reasonableness and justify choices",
  "SP1": "AC9M7SP01: draw 2D representations of 3D objects including top, front and side views; identify advantages and disadvantages of each representation; recognise that different views can represent the same 3D object",
  "SP2": "AC9M7SP02: classify triangles by side length (equilateral, isosceles, scalene) and by angle (acute, right, obtuse); classify quadrilaterals by sides, angles and diagonals; construct a classification hierarchy; use classification to reason about properties",
  "SP3": "AC9M7SP03: describe translations, reflections on an axis, and rotations of multiples of 90° using coordinates; perform and draw transformations of sets of points; identify the image of a point after a transformation; note that distances and angles are preserved",
  "ST1": "AC9M7ST01: collect or acquire data sets; calculate range, median, mean and mode; discuss which measure best represents the data; investigate the effect of adding or removing outliers on the mean and median",
  "ST2": "AC9M7ST02: construct stem-and-leaf plots by correctly splitting data into stems and leaves; read and interpret the plots; use digital tools to create other displays; compare two data sets by examining shape, centre, spread and outliers",
  "ST3": "AC9M7ST03: formulate a statistical question; decide how to collect data (survey, experiment, existing source); identify potential sources of bias; analyse distribution shape (symmetric, skewed); report findings using summary statistics and appropriate displays",
  "P1":  "AC9M7P01: list all outcomes in the sample space for single-stage events; assign probabilities as fractions, decimals or percentages on the scale 0 to 1; use P(event) to predict expected frequency in a number of trials",
  "P2":  "AC9M7P02: run repeated chance experiments (e.g. rolling a die, tossing a coin) and record relative frequencies; use digital simulations for large numbers of trials; observe that relative frequency approaches theoretical probability as trial number increases; explain variability in small samples",
};

// AC v9 Year 7 English — elaborations grounded in AC9E7LA, AC9E7LE, AC9E7LY descriptors
const Y7_ENGLISH_LEARNING_OBJECTIVES: Record<string, string> = {
  // Language (AC9E7LA)
  "L1":  "AC9E7LA01: examine how word choice, pronoun use and dialect reflect personal, cultural and social identity; analyse how the same language event (e.g. a greeting) differs across groups; discuss how code-switching is used to negotiate identity in different contexts",
  "L2":  "AC9E7LA02: identify evaluative language such as judgements, appreciation and affect; explain how evidence from the text or other sources is used to substantiate an evaluation; distinguish between subjective opinions and evidence-based evaluation in print and multimodal texts",
  "L3":  "AC9E7LA03: compare how text structures (narrative, report, procedure, argument) differ across purposes; identify how language features such as connectives, modality and nominalisation vary; explain how structural choices guide reader understanding",
  "L4":  "AC9E7LA04: identify cohesive devices including reference chains (pronouns, synonyms), conjunctions, and text connectives; explain how overviews, topic sentences and concluding paragraphs signal structure; trace how ideas are linked across paragraphs",
  "L5":  "AC9E7LA05: identify main and subordinate clauses in complex sentences; identify co-ordination and subordination in compound-complex sentences; explain how embedding clauses allows writers to elaborate, qualify and extend ideas more precisely than simple sentences",
  "L6":  "AC9E7LA06: identify present, past and future tense; recognise how shifts in tense create confusion; explain why consistent tense use aids clarity; apply tense knowledge when writing imaginative and informative texts; identify verb groups and their tense function",
  "L7":  "AC9E7LA07: analyse how vectors (lines of gaze or pointing), camera angle (high/low), and social distance (close/far) in still images and film position the viewer; explain how these techniques construct relationships between represented participants and viewers",
  "L8":  "AC9E7LA08: investigate words with both everyday and technical meanings (e.g. 'force', 'power', 'cell'); explore word origins including Greek and Latin roots; build vocabulary by using context clues, morphological analysis and reference sources",
  "L9":  "AC9E7LA09: explain the function of colons (to introduce lists, explanations, quotations) and brackets (to add supplementary information); distinguish these from other punctuation marks; apply in own writing to support precision and clarity",
  // Literature (AC9E7LE)
  "LT1": "AC9E7LE01: identify historical, social and cultural contexts in literary texts; explore ideas and perspectives by First Nations Australian authors and wide-ranging world authors; compare representations of similar themes or issues across texts from different contexts",
  "LT2": "AC9E7LE02: form and express opinions about characters, settings and events; justify opinions with reference to the text; identify where others hold different views and explain the basis of disagreement; engage respectfully with diverse interpretations",
  "LT3": "AC9E7LE03: identify literary devices including simile, metaphor, personification, alliteration and imagery; explain how dialogue reveals character; discuss how images work with text to influence emotions and opinions; compare how different authors use these techniques",
  "LT4": "AC9E7LE04: discuss aesthetic qualities such as a text's beauty, originality and emotional impact; identify social values such as justice, belonging, identity; use metalanguage (e.g. theme, motif, voice, genre) to discuss these qualities precisely",
  "LT5": "AC9E7LE05: identify narrative elements including protagonist, antagonist, setting, conflict, resolution; explain how the interaction of these elements creates meaning; compare structural choices across different narrative types (adventure, mystery, historical fiction)",
  "LT6": "AC9E7LE06: identify poetic devices including rhythm, rhyme, assonance, onomatopoeia, symbolism; explain how these create layers of meaning beyond the literal; compare how device choices in different poems create different effects",
  "LT7": "AC9E7LE07: plan and draft a literary text (narrative or poem) experimenting with language features and devices studied; respond to feedback to improve word choice, structure and literary effects; publish a final version with attention to presentation",
  // Literacy (AC9E7LY)
  "LC1": "AC9E7LY01: analyse how digital technologies (e.g. hyperlinks, interactive features, social media) affect how texts are read and responded to; discuss how digital tools change the creation and distribution of texts; evaluate the effects of technology on reading habits and media consumption",
  "LC2": "AC9E7LY02: use active listening, turn-taking and on-topic responses in discussion; build on others' contributions; evaluate the effectiveness of spoken texts by commenting on language features, structure and delivery; present evaluations clearly",
  "LC3": "AC9E7LY03: identify how authors vary sentence length, vocabulary formality, modality and voice (active/passive) to suit audience and purpose; explain why the same idea might be expressed differently in a text message versus a formal report",
  "LC4": "AC9E7LY04: identify taxonomies (categories and sub-categories) in informative texts; trace cause-and-effect chains; identify how extended metaphors structure an argument; follow chronological sequences in narrative and procedural texts; use these structures in own writing",
  "LC5": "AC9E7LY05: apply before-, during- and after-reading strategies including predicting from title/headings, visualising, connecting to prior knowledge, monitoring confusion, questioning the text, summarising key points, and making inferences from implied information",
  "LC6": "AC9E7LY06: use a writing process to create imaginative, informative and persuasive texts; plan using graphic organisers or outlines; draft with attention to text structure; revise to improve content, organisation and language choices; edit for accuracy; publish in appropriate format",
  "LC7": "AC9E7LY07: plan and rehearse a spoken or multimodal presentation; choose text structures, language features and visual elements appropriate to purpose and audience; use volume, tone, pitch and pace deliberately to engage the audience; evaluate own and peers' presentations",
  "LC8": "AC9E7LY08: apply spelling rules including vowel/consonant doubling, silent letters, and common patterns; use knowledge of Greek roots (e.g. bio-, graph-, photo-) and Latin roots (e.g. port-, rupt-, dict-) to decode and spell unfamiliar words; use prefixes (un-, dis-, pre-) and suffixes (-tion, -ment, -ly) correctly",
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
  const { stage, subject, topicCode, count = 10, difficulty = "mixed" } = req.body;

  const resolvedSubject: string = subject || stage;
  if (!resolvedSubject || !topicCode) {
    res.status(400).json({ error: "subject (or stage) and topicCode required" });
    return;
  }

  const isY7Maths   = resolvedSubject === "Year 7 Mathematics";
  const isY7English = resolvedSubject === "Year 7 English";
  const isY7 = isY7Maths || isY7English;

  let topicMap: Record<string, string>;
  let learningObjectivesMap: Record<string, string>;
  let curriculumLabel: string;

  if (isY7Maths) {
    topicMap = Y7_MATHS_TOPICS;
    learningObjectivesMap = Y7_MATHS_LEARNING_OBJECTIVES;
    curriculumLabel = "Australian Curriculum v9 Year 7 Mathematics";
  } else if (isY7English) {
    topicMap = Y7_ENGLISH_TOPICS;
    learningObjectivesMap = Y7_ENGLISH_LEARNING_OBJECTIVES;
    curriculumLabel = "Australian Curriculum v9 Year 7 English";
  } else {
    const stageKey = resolvedSubject === "Chemistry Stage 1" ? "s1" : "s2";
    topicMap = stageKey === "s1" ? S1_TOPICS : S2_TOPICS;
    learningObjectivesMap = stageKey === "s1" ? S1_LEARNING_OBJECTIVES : S2_LEARNING_OBJECTIVES;
    curriculumLabel = `SACE ${resolvedSubject}`;
  }

  const topicName = topicMap[topicCode];
  if (!topicName) {
    res.status(400).json({ error: `Unknown topic code: ${topicCode}` });
    return;
  }

  const difficultyInstruction =
    difficulty === "mixed"
      ? "Vary difficulty across questions: include easy (1\u20132), medium (3), and hard (4\u20135) questions."
      : `All questions should have difficulty ${difficulty} out of 5.`;

  const learningObjectives = learningObjectivesMap[topicCode] || topicName;

  let system: string;
  let user: string;

  if (isY7) {
    system = [
      `You are generating multiple-choice questions for Australian Curriculum v9 Year 7 students.`,
      `CRITICAL CONSTRAINT: All questions must be strictly based on the ${curriculumLabel} curriculum.`,
      "Do NOT draw on knowledge that falls outside the Year 7 curriculum level and scope.",
      "Every question must be directly answerable using only what a Year 7 student is expected to know.",
      "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
      `Generate exactly ${count} questions.`,
      "Each object must have these exact keys:",
      "  question (string)",
      "  options (array of exactly 4 strings)",
      "  answer_index (integer 0\u20133)",
      "  solution (string \u2014 explain why the answer is correct using Australian Curriculum v9 language, 2\u20134 sentences)",
      "  subtopic (short free-text label for the specific concept tested, using AC v9 content descriptor language)",
      "  difficulty (integer 1\u20135)",
      "Questions must be accurate, unambiguous, and test conceptual understanding aligned with AC v9 achievement standards.",
      "Use terminology consistent with the Australian Curriculum v9. Avoid SACE, VCE, IB or HSC-specific content.",
      "Do not repeat the same scenario across questions.",
      difficultyInstruction,
    ].join("\n");

    user = [
      `Generate ${count} MCQs for the ${curriculumLabel} content description: ${topicName} (${topicCode}).`,
      "",
      "AC v9 elaborations for this content description:",
      learningObjectives,
      "",
      "All questions must directly assess one or more of the specific concepts listed above.",
      "Use the exact scope and terminology of the content description \u2014 nothing broader.",
    ].join("\n");
  } else {
    system = [
      "You are generating multiple-choice questions for SACE Chemistry students.",
      "CRITICAL CONSTRAINT: All questions must be strictly based on the SACE Chemistry syllabus.",
      "Do NOT draw on general chemistry knowledge that falls outside the SACE learning requirements.",
      "Every question must be directly answerable using only what a SACE student is expected to know for this topic.",
      "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
      `Generate exactly ${count} questions.`,
      "Each object must have these exact keys:",
      "  question (string)",
      "  options (array of exactly 4 strings)",
      "  answer_index (integer 0\u20133)",
      "  solution (string \u2014 explain why the answer is correct using SACE curriculum language, 2\u20134 sentences)",
      "  subtopic (short free-text label for the specific concept, matching SACE dot-point language)",
      "  difficulty (integer 1\u20135)",
      "Questions must be accurate, unambiguous, and test conceptual understanding aligned with SACE assessment descriptors.",
      "Use terminology consistent with the SACE Chemistry subject outline. Avoid IB, VCE, or HSC-specific content.",
      "Do not repeat the same scenario across questions.",
      difficultyInstruction,
    ].join("\n");

    user = [
      `Generate ${count} MCQs for the SACE ${resolvedSubject} topic: ${topicName} (${topicCode}).`,
      "",
      "SACE curriculum learning requirements for this topic:",
      learningObjectives,
      "",
      "All questions must directly assess one or more of these specific learning requirements.",
      "Use the exact concepts, terminology and scope listed above \u2014 nothing broader.",
    ].join("\n");
  }

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
    subject: resolvedSubject,
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
