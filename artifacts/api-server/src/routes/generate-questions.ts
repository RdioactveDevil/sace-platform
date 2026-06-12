import { Router } from "express";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { CLAUDE_MODEL } from "../lib/anthropic-model";
import { logger } from "../lib/logger";
import { normalizeMathText } from "../lib/normalize-math";
import { filterVerifiedQuestions } from "../lib/verify-question";
import { extractJsonArray } from "../lib/json-latex";

const router = Router();
const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";

// ─── Learning objective hints ──────────────────────────────────────────────────
// Keyed by canonical subtopic name (curriculum_subtopics.name).
// Provides Claude focused curriculum context when generating questions.
// Topics without an entry fall back to the subtopic name alone — perfectly fine
// for newly created or custom curricula.
const LEARNING_OBJECTIVES: Record<string, string> = {
  // ── Chemistry Stage 1 ────────────────────────────────────────────────────────
  "Properties and uses of materials": "properties (physical/chemical) of metals, non-metals and metalloids; uses linked to properties; classification of materials",
  "Atomic structure": "atomic number, mass number, isotopes, electron configuration, periodic trends; Bohr model and quantum model overview",
  "Quantities of atoms": "mole concept, Avogadro's number, molar mass, empirical and molecular formulae, percentage composition",
  "Types of materials": "ionic, covalent, metallic bonding types; properties of ionic compounds, metals, network covalent solids, molecular substances",
  "Bonding between atoms": "Lewis structures, VSEPR theory, bond polarity, electronegativity differences, naming binary compounds",
  "Quantities of molecules and ions": "molar mass of compounds, stoichiometry of reactions, limiting reagents, percentage yield",
  "Molecule polarity": "molecular polarity from bond polarity and shape; polar vs non-polar molecules; effect on physical properties",
  "Interactions between molecules": "dispersion forces, dipole\u2013dipole interactions, hydrogen bonding; effect on boiling points and solubility",
  "Hydrocarbons": "homologous series, IUPAC nomenclature, structural and displayed formulae of alkanes, alkenes, alkynes",
  "Polymers": "addition and condensation polymerisation; monomer to polymer; properties of polymers",
  "Miscibility and solutions": "like-dissolves-like principle; miscibility; distinguishing aqueous and non-aqueous solutions",
  "Solutions of ionic substances": "solubility rules, dissociation of ionic solids in water, concentration in mol/L and g/L",
  "Quantities in reactions": "stoichiometric calculations including moles, concentration, mass; dilution calculations",
  "Energy in reactions": "exothermic and endothermic reactions; enthalpy change; calorimetry calculations; bond energy",
  "Acid\u2013base concepts": "Arrhenius and Br\u00f8nsted\u2013Lowry definitions; conjugate acid\u2013base pairs; amphoteric species",
  "Reactions of acids and bases": "neutralisation reactions; reactions of acids with metals, carbonates and oxides; writing ionic equations",
  "The pH scale": "pH scale, relationship to [H+]; strong vs weak acids/bases; effect of dilution on pH",
  "Concepts of oxidation and reduction": "oxidation states; oxidation and reduction definitions; identifying oxidising and reducing agents",
  "Metal reactivity": "activity series of metals; displacement reactions; corrosion and galvanic cells",
  "Electrochemistry": "galvanic and electrolytic cells; electrode reactions; Faraday's laws; applications (batteries, electroplating)",

  // ── Chemistry Stage 2 ────────────────────────────────────────────────────────
  "Global warming and climate change": "enhanced greenhouse effect; climate models; role of CO2, CH4, N2O, H2O; carbon cycle; mitigation strategies",
  "Photochemical smog": "formation of primary and secondary pollutants; NOx, VOCs, ozone in troposphere; health and environmental effects; photochemical reactions",
  "Volumetric analysis": "standard solutions; titration technique and calculations; primary standards; back-titration; acid\u2013base indicators",
  "Chromatography": "principles of chromatography; Rf values; paper, TLC, gas and HPLC; stationary and mobile phases",
  "Atomic spectroscopy": "atomic emission and absorption spectra; flame tests; Beer\u2013Lambert law; quantitative analysis using spectroscopy",
  "Rates of reactions": "collision theory; activation energy; effect of concentration, temperature, surface area, catalysts on rate; rate equations (qualitative)",
  "Equilibrium and yield": "dynamic equilibrium; Le Chatelier's principle; Kc expression and calculations; effect of changes on equilibrium position",
  "Optimising production": "industrial applications of equilibrium (Haber, Contact processes); optimising yield and rate; economic and environmental trade-offs",
  "Introduction to organic chemistry": "functional groups; homologous series; IUPAC nomenclature; structural isomers; primary/secondary/tertiary classification",
  "Alcohols": "structure and properties of alcohols; oxidation reactions (primary\u2192aldehyde\u2192carboxylic acid, secondary\u2192ketone); dehydration; hydrogen bonding",
  "Aldehydes and ketones": "structure of aldehydes and ketones; carbonyl group; oxidation tests (Tollens', Fehling's); reduction reactions",
  "Carbohydrates": "monosaccharides, disaccharides, polysaccharides; glycosidic bonds; structure of glucose, sucrose, starch, cellulose; hydrolysis",
  "Carboxylic acids": "carboxyl group; acidic nature; esterification; reactions with bases; naming carboxylic acids",
  "Amines": "primary/secondary/tertiary amines; basicity; reactions with acids; naming amines",
  "Esters": "ester linkage; naming esters; esterification and hydrolysis reactions; uses of esters",
  "Amides": "amide bond (peptide bond); formation from amine + carboxylic acid; hydrolysis; polyamides (nylon)",
  "Triglycerides": "structure of triglycerides; ester bonds; saponification; saturated vs unsaturated fats; role in biology",
  "Proteins": "amino acid structure; peptide bonds; primary to quaternary protein structure; denaturation; enzyme function",
  "Energy resources": "renewable vs non-renewable energy; calorimetry; energy density; fossil fuels combustion; biofuels; hydrogen economy",
  "Water": "water as a solvent; water treatment; hardness; chlorination; pH control; water quality indicators",
  "Soil": "soil components; pH effects on nutrient availability; fertilisers; nitrogen cycle; salinity and remediation",
  "Materials resources": "life-cycle analysis; recycling and reuse; green chemistry principles; e-waste; materials sustainability",

  // ── Year 7 Mathematics (AC v9 full content descriptions) ─────────────────────
  "describe the relationship between perfect square numbers and square roots, and use squares of numbers and square roots of perfect square numbers to solve problems": "AC9M7N01: understand that squaring and finding square roots are inverse operations; use the relationship to solve problems; estimate square roots of non-perfect-square numbers; connect perfect squares to square area models",
  "represent natural numbers as products of powers of prime numbers using exponent notation": "AC9M7N02: express numbers as products of prime factors using factor trees and repeated division; write using exponent (index) notation; connect prime factorisation to finding HCF and LCM",
  "represent natural numbers in expanded notation using place value and powers of 10": "AC9M7N03: write numbers in expanded form using place value and powers of 10 (e.g. 4375 = 4\u00d710\u00b3 + 3\u00d710\u00b2 + 7\u00d710 + 5); connect to scientific notation; understand the role of zero as a place holder",
  "find equivalent representations of rational numbers and represent rational numbers on a number line": "AC9M7N04: find equivalent fractions, decimals and percentages; compare and order rational numbers; plot fractions and decimals on a number line; convert between representations",
  "round decimals to a given accuracy appropriate to the context and use appropriate rounding and estimation to check the reasonableness of solutions": "AC9M7N05: round to a specified number of decimal places or significant figures; use estimation to check reasonableness of calculated answers; apply in measurement and financial contexts",
  "use the 4 operations with positive rational numbers including fractions, decimals and percentages to solve problems using efficient calculation strategies": "AC9M7N06: add, subtract, multiply and divide positive fractions (including mixed numbers), decimals and percentages; apply order of operations; choose efficient strategies; solve word problems",
  "compare, order and solve problems involving addition and subtraction of integers": "AC9M7N07: represent integers on a number line; compare and order integers; add and subtract integers using a number line and rules of sign; solve problems involving temperature, altitude, financial contexts",
  "recognise, represent and solve problems involving ratios": "AC9M7N08: understand ratio as a comparison of two quantities; simplify ratios; use ratios to divide quantities; solve ratio problems in practical contexts including recipes and scale drawings",
  "use mathematical modelling to solve practical problems, involving rational numbers and percentages, including financial contexts; formulate problems, choosing representations and efficient calculation strategies, using digital tools as appropriate; interpret and communicate solutions in terms of the situation, justifying choices made about the representation": "AC9M7N09: formulate practical problems involving rational numbers, percentages and ratios; select appropriate representations and strategies; use digital tools where appropriate; interpret and justify solutions in context (e.g. profit/loss, GST, best buys)",
  "recognise and use variables to represent everyday formulas algebraically and substitute values into formulas to determine an unknown": "AC9M7A01: identify variables and constants in real-world formulas; substitute values to find unknowns; use formulas for area, perimeter and other everyday applications; distinguish between dependent and independent variables",
  "formulate algebraic expressions using constants, variables, operations and brackets": "AC9M7A02: write algebraic expressions to represent situations; use correct algebraic notation including index notation and brackets; simplify expressions by collecting like terms; evaluate by substituting values",
  "solve one-variable linear equations with natural number solutions; verify the solution by substitution": "AC9M7A03: solve one-step and two-step linear equations using inverse operations; verify solutions by substituting back; write and solve equations arising from word problems with natural number solutions",
  "describe relationships between variables represented in graphs of functions from authentic data": "AC9M7A04: identify and describe features of graphs of functions from real-world data; connect shape of graph to the relationship described; identify linear vs non-linear trends",
  "generate tables of values from visually growing patterns or the rule of a function; describe and plot these relationships on the Cartesian plane": "AC9M7A05: continue geometric and numerical growth patterns; write rules describing the pattern; generate tables of values; plot (x, y) pairs on the Cartesian plane; identify the shape of the resulting graph",
  "manipulate formulas involving several variables using digital tools, and describe the effect of systematic variation in the values of the variables": "AC9M7A06: use spreadsheets or graphing tools to change variable values in formulas; observe and describe the effect on the output; identify how changes in one variable affect another",
  "solve problems involving the area of triangles and parallelograms using established formulas and appropriate units": "AC9M7M01: apply A = \u00bdbh for triangles and A = bh for parallelograms; identify the correct base and perpendicular height; decompose composite shapes; choose appropriate units; solve practical area problems",
  "solve problems involving the volume of right prisms including rectangular and triangular prisms, using established formulas and appropriate units": "AC9M7M02: apply V = lwh for rectangular prisms and V = \u00bdbhl for triangular prisms; connect volume to the area of the cross-section multiplied by the length; convert between units of volume and capacity",
  "describe the relationship between \u03c0 and the features of circles including the circumference, radius and diameter": "AC9M7M03: demonstrate that C = \u03c0d for all circles; use C = 2\u03c0r and relate to diameter; explain that \u03c0 is the ratio of circumference to diameter; use \u03c0 \u2248 3.14 or exact \u03c0 in calculations; apply to real contexts such as wheels and pipes",
  "identify corresponding, alternate and co-interior relationships between angles formed when parallel lines are crossed by a transversal; use them to solve problems and explain reasons": "AC9M7M04: identify corresponding, alternate and co-interior angles formed by a transversal crossing parallel lines; apply angle relationships to find unknown angles; provide geometric reasons; apply to real-world geometry problems",
  "demonstrate that the interior angle sum of a triangle in the plane is 180\u00b0 and apply this to determine the interior angle sum of other shapes and the size of unknown angles": "AC9M7M05: prove the triangle angle sum = 180\u00b0; use this to find unknown angles in triangles; extend to find the interior angle sum of quadrilaterals and other polygons; apply to problems involving missing angles",
  "use mathematical modelling to solve practical problems involving measurement; formulate problems, interpret and communicate solutions in terms of the situation, justifying choices made about the representation": "AC9M7M06: identify and formulate a measurement problem from a practical context; select an appropriate model, formula and units; carry out calculations and interpret results; evaluate reasonableness and justify choices",
  "represent objects in 2 dimensions; discuss and reason about the advantages and disadvantages of different representations": "AC9M7SP01: draw 2D representations of 3D objects including top, front and side views; identify advantages and disadvantages of each representation; recognise that different views can represent the same 3D object",
  "classify triangles, quadrilaterals and other polygons according to their side and angle properties; identify and reason about relationships": "AC9M7SP02: classify triangles by side length (equilateral, isosceles, scalene) and by angle (acute, right, obtuse); classify quadrilaterals by sides, angles and diagonals; construct a classification hierarchy; use classification to reason about properties",
  "describe transformations of a set of points using coordinates in the Cartesian plane, translations and reflections on an axis, and rotations of multiples of 90\u00b0": "AC9M7SP03: describe translations, reflections on an axis, and rotations of multiples of 90\u00b0 using coordinates; perform and draw transformations of sets of points; identify the image of a point after a transformation; note that distances and angles are preserved",
  "acquire data sets for discrete and continuous numerical variables and calculate the range, median, mean and mode; make and justify decisions about which measures of central tendency provide useful insights into the nature of the distribution of data": "AC9M7ST01: collect or acquire data sets; calculate range, median, mean and mode; discuss which measure best represents the data; investigate the effect of adding or removing outliers on the mean and median",
  "create different types of numerical data displays including stem-and-leaf plots using software where appropriate; describe and compare the distribution of data, commenting on the shape, centre and spread including outliers and determining the range, median, mean and mode": "AC9M7ST02: construct stem-and-leaf plots by correctly splitting data into stems and leaves; read and interpret the plots; use digital tools to create other displays; compare two data sets by examining shape, centre, spread and outliers",
  "plan and conduct statistical investigations involving data for discrete and continuous numerical variables; analyse and interpret distributions of data and report findings in terms of shape and summary statistics": "AC9M7ST03: formulate a statistical question; decide how to collect data (survey, experiment, existing source); identify potential sources of bias; analyse distribution shape (symmetric, skewed); report findings using summary statistics and appropriate displays",
  "identify the sample space for single-stage events; assign probabilities to the outcomes of these events and predict relative frequencies for related experiments": "AC9M7P01: list all outcomes in the sample space for single-stage events; assign probabilities as fractions, decimals or percentages on the scale 0 to 1; use P(event) to predict expected frequency in a number of trials",
  "conduct repeated chance experiments and run simulations with a large number of trials using digital tools; compare observations with predictions about the likelihood of outcomes, and identify the effect of sample size on the reliability of predictions": "AC9M7P02: run repeated chance experiments (e.g. rolling a die, tossing a coin) and record relative frequencies; use digital simulations for large numbers of trials; observe that relative frequency approaches theoretical probability as trial number increases; explain variability in small samples",

  // ── Year 7 English (AC v9 full content descriptions) ─────────────────────────
  "understand how language expresses and creates personal and social identities": "AC9E7LA01: examine how word choice, pronoun use and dialect reflect personal, cultural and social identity; analyse how the same language event (e.g. a greeting) differs across groups; discuss how code-switching is used to negotiate identity in different contexts",
  "recognise language used to evaluate texts including visual and multimodal texts, and how evaluations of a text can be substantiated by reference to the text and other sources": "AC9E7LA02: identify evaluative language such as judgements, appreciation and affect; explain how evidence from the text or other sources is used to substantiate an evaluation; distinguish between subjective opinions and evidence-based evaluation in print and multimodal texts",
  "identify and describe how texts are structured differently depending on their purpose and how language features vary in texts": "AC9E7LA03: compare how text structures (narrative, report, procedure, argument) differ across purposes; identify how language features such as connectives, modality and nominalisation vary; explain how structural choices guide reader understanding",
  "understand that the cohesion of texts relies on devices that signal structure and guide readers, such as overviews and initial and concluding paragraphs": "AC9E7LA04: identify cohesive devices including reference chains (pronouns, synonyms), conjunctions, and text connectives; explain how overviews, topic sentences and concluding paragraphs signal structure; trace how ideas are linked across paragraphs",
  "understand how complex and compound-complex sentences can be used to elaborate, extend and explain ideas": "AC9E7LA05: identify main and subordinate clauses in complex sentences; identify co-ordination and subordination in compound-complex sentences; explain how embedding clauses allows writers to elaborate, qualify and extend ideas more precisely than simple sentences",
  "understand how consistency of tense through verbs and verb groups achieves clarity in sentences": "AC9E7LA06: identify present, past and future tense; recognise how shifts in tense create confusion; explain why consistent tense use aids clarity; apply tense knowledge when writing imaginative and informative texts; identify verb groups and their tense function",
  "analyse how techniques such as vectors, angle and/or social distance in visual texts can be used to create a perspective": "AC9E7LA07: analyse how vectors (lines of gaze or pointing), camera angle (high/low), and social distance (close/far) in still images and film position the viewer; explain how these techniques construct relationships between represented participants and viewers",
  "investigate the role of vocabulary in building specialist and technical knowledge, including terms that have both everyday and technical meanings": "AC9E7LA08: investigate words with both everyday and technical meanings (e.g. 'force', 'power', 'cell'); explore word origins including Greek and Latin roots; build vocabulary by using context clues, morphological analysis and reference sources",
  "understand the use of punctuation including colons and brackets to support meaning": "AC9E7LA09: explain the function of colons (to introduce lists, explanations, quotations) and brackets (to add supplementary information); distinguish these from other punctuation marks; apply in own writing to support precision and clarity",
  "identify and explore ideas, points of view, characters, events and/or issues in literary texts, drawn from historical, social and/or cultural contexts, by First Nations Australian, and wide-ranging Australian and world authors": "AC9E7LE01: identify historical, social and cultural contexts in literary texts; explore ideas and perspectives by First Nations Australian authors and wide-ranging world authors; compare representations of similar themes or issues across texts from different contexts",
  "form an opinion about characters, settings and events in texts, identifying areas of agreement and difference with others\u2019 opinions and justifying a response": "AC9E7LE02: form and express opinions about characters, settings and events; justify opinions with reference to the text; identify where others hold different views and explain the basis of disagreement; engage respectfully with diverse interpretations",
  "explain the ways that literary devices and language features such as dialogue, and images are used to create character, and to influence emotions and opinions in different types of texts": "AC9E7LE03: identify literary devices including simile, metaphor, personification, alliteration and imagery; explain how dialogue reveals character; discuss how images work with text to influence emotions and opinions; compare how different authors use these techniques",
  "discuss the aesthetic and social value of literary texts using relevant and appropriate metalanguage": "AC9E7LE04: discuss aesthetic qualities such as a text's beauty, originality and emotional impact; identify social values such as justice, belonging, identity; use metalanguage (e.g. theme, motif, voice, genre) to discuss these qualities precisely",
  "identify and explain the ways that characters, settings and events combine to create meaning in narratives": "AC9E7LE05: identify narrative elements including protagonist, antagonist, setting, conflict, resolution; explain how the interaction of these elements creates meaning; compare structural choices across different narrative types (adventure, mystery, historical fiction)",
  "identify and explain how literary devices create layers of meaning in texts including poetry": "AC9E7LE06: identify poetic devices including rhythm, rhyme, assonance, onomatopoeia, symbolism; explain how these create layers of meaning beyond the literal; compare how device choices in different poems create different effects",
  "create and edit literary texts that experiment with language features and literary devices encountered in texts": "AC9E7LE07: plan and draft a literary text (narrative or poem) experimenting with language features and devices studied; respond to feedback to improve word choice, structure and literary effects; publish a final version with attention to presentation",
  "explain the effect of current technology on reading, creating and responding to texts including media texts": "AC9E7LY01: analyse how digital technologies (e.g. hyperlinks, interactive features, social media) affect how texts are read and responded to; discuss how digital tools change the creation and distribution of texts; evaluate the effects of technology on reading habits and media consumption",
  "use interaction skills when discussing and presenting ideas and information including evaluations of the features of spoken texts": "AC9E7LY02: use active listening, turn-taking and on-topic responses in discussion; build on others' contributions; evaluate the effectiveness of spoken texts by commenting on language features, structure and delivery; present evaluations clearly",
  "analyse the ways in which language features shape meaning and vary according to audience and purpose": "AC9E7LY03: identify how authors vary sentence length, vocabulary formality, modality and voice (active/passive) to suit audience and purpose; explain why the same idea might be expressed differently in a text message versus a formal report",
  "explain the structure of ideas such as the use of taxonomies, cause and effect, extended metaphors and chronology": "AC9E7LY04: identify taxonomies (categories and sub-categories) in informative texts; trace cause-and-effect chains; identify how extended metaphors structure an argument; follow chronological sequences in narrative and procedural texts; use these structures in own writing",
  "use comprehension strategies such as visualising, predicting, connecting, summarising, monitoring, questioning and inferring to analyse and summarise information and ideas": "AC9E7LY05: apply before-, during- and after-reading strategies including predicting from title/headings, visualising, connecting to prior knowledge, monitoring confusion, questioning the text, summarising key points, and making inferences from implied information",
  "plan, create, edit and publish written and multimodal texts, selecting subject matter, and using text structures, language features, literary devices and visual features as appropriate to convey information, ideas and opinions in ways that may be imaginative, reflective, informative, persuasive and/or analytical": "AC9E7LY06: use a writing process to create imaginative, informative and persuasive texts; plan using graphic organisers or outlines; draft with attention to text structure; revise to improve content, organisation and language choices; edit for accuracy; publish in appropriate format",
  "plan, create, rehearse and deliver presentations for purposes and audiences in ways that may be imaginative, reflective, informative, persuasive and/or analytical, by selecting text structures, language features, literary devices and visual features, and using features of voice including volume, tone, pitch and pace": "AC9E7LY07: plan and rehearse a spoken or multimodal presentation; choose text structures, language features and visual elements appropriate to purpose and audience; use volume, tone, pitch and pace deliberately to engage the audience; evaluate own and peers' presentations",
  "understand how to use spelling rules and word origins; for example, Greek and Latin roots, base words, suffixes, prefixes and spelling patterns to learn new words and how to spell them": "AC9E7LY08: apply spelling rules including vowel/consonant doubling, silent letters, and common patterns; use knowledge of Greek roots (e.g. bio-, graph-, photo-) and Latin roots (e.g. port-, rupt-, dict-) to decode and spell unfamiliar words; use prefixes (un-, dis-, pre-) and suffixes (-tion, -ment, -ly) correctly",

  // ── Year 10 Mathematics — standard topics ────────────────────────────────────
  "Percentages, errors and approximations with real numbers": "VC2M10N01/N02: calculate with percentages including percentage increases, decreases and errors; recognise the effect of using approximations of real numbers in repeated calculations; compare results using exact vs approximate values; apply in financial and scientific contexts",
  "Simple and compound interest": "VC2M10N03: distinguish between simple interest (I = Prn) and compound interest (A = P(1+r)^n); calculate interest and final amounts for both; compare outcomes over time; solve practical problems involving loans, savings and investments",
  "Expanding, factorising and simplifying algebraic expressions": "VC2M10A01: apply index laws for integer exponents including products, quotients and powers of expressions; expand binomial products using FOIL and the distributive law; factorise expressions including common factors, difference of two squares, and trinomials; simplify algebraic fractions",
  "Solving linear equations and inequalities": "VC2M10A02: solve linear equations with one variable including those with fractions and brackets; solve and graph linear inequalities on a number line; apply to practical word problems; understand that multiplying/dividing by a negative reverses the inequality sign",
  "Solving quadratic equations": "VC2M10A03: solve quadratic equations using factorisation, completing the square, and the quadratic formula; determine the number of solutions using the discriminant; connect solutions to x-intercepts of a parabola; apply to area and projectile problems",
  "Linear, quadratic and simple exponential functions and graphs": "VC2M10A04: recognise and sketch linear (y=mx+c), quadratic (y=ax\u00b2+bx+c), and simple exponential (y=a^x) functions; identify key features including intercepts, vertex, axis of symmetry, asymptotes; compare growth rates; use digital tools to explore effects of changing parameters",
  "Direct and inverse proportion": "VC2M10A05: identify direct proportion (y=kx) and inverse proportion (y=k/x); find the constant of proportionality from graphs or tables; solve problems involving proportional relationships in science, finance and everyday contexts",
  "Simultaneous linear equations": "VC2M10A06: solve pairs of simultaneous linear equations by substitution and elimination; interpret solutions graphically as the point of intersection; solve practical problems involving two unknown quantities; identify inconsistent and dependent systems",
  "Surface area and volume of pyramids, cones and spheres": "VC2M10M01: calculate the surface area and volume of pyramids (V=\u2153Ah), cones (V=\u2153\u03c0r\u00b2h, SA=\u03c0rl+\u03c0r\u00b2), and spheres (V=\u2074\u2044\u2083\u03c0r\u00b3, SA=4\u03c0r\u00b2); solve composite solid problems; choose appropriate units and convert between them",
  "Similarity and scale factors": "VC2M10M02: identify similar figures and use scale factors to find unknown lengths, areas and volumes; apply the enlargement transformation; use similarity in map reading, plans, and scale drawings; prove triangles similar using AA, SAS and SSS conditions",
  "Trigonometry \u2014 right-angled triangles (sin, cos, tan)": "VC2M10M03: define sine, cosine and tangent ratios for right-angled triangles; use SOH-CAH-TOA to find unknown sides and angles; apply inverse trigonometric functions; solve practical problems involving angles of elevation and depression",
  "Applications of Pythagoras\u2019 theorem and trigonometry": "VC2M10M04: apply Pythagoras' theorem in two and three dimensions; combine Pythagoras' theorem and trigonometric ratios to solve multi-step problems; determine bearings and distances; solve problems set in real contexts such as construction and navigation",
  "Geometric reasoning and proofs with plane shapes": "VC2M10SP01: identify and apply properties of parallel lines, triangles, quadrilaterals and other polygons; construct formal geometric arguments using known properties as reasons; understand what constitutes a valid geometric proof; present proofs in a logical sequence",
  "Congruence and similarity of triangles": "VC2M10SP02: apply congruence conditions (SSS, SAS, ASA, AAS, RHS) to prove triangles congruent; apply similarity conditions (AA, SAS, SSS) to prove triangles similar; use congruence and similarity to find unknown sides and angles and to prove properties of quadrilaterals",
  "Circle geometry \u2014 chord, tangent and angle properties": "VC2M10SP03: apply circle theorems including: angle at centre is double the angle at circumference; angles in the same segment are equal; angle in a semicircle is 90\u00b0; opposite angles of a cyclic quadrilateral are supplementary; tangent is perpendicular to the radius at the point of contact; use theorems to find unknown angles in circle diagrams",
  "Data distributions \u2014 displaying and comparing with statistical measures": "VC2M10ST01: construct and interpret box plots, histograms and back-to-back displays for numerical data; calculate and compare mean, median, mode, range and interquartile range; describe the shape of distributions (symmetric, skewed); identify and explain the effect of outliers on summary statistics",
  "Bivariate numerical data \u2014 scatter plots and lines of best fit": "VC2M10ST02: construct scatter plots for bivariate numerical data; describe the association (form, direction, strength) between two variables; draw and use lines of best fit by eye and using digital tools; use the line to make predictions; distinguish between interpolation and extrapolation",
  "Evaluating statistical reports and media claims": "VC2M10ST03: identify potential sources of bias, misrepresentation and distortion in statistical reports, graphs and surveys; evaluate claims made in media using statistical evidence; distinguish between correlation and causation; assess the reliability and validity of data collection methods",
  "Conditional probability and independence": "VC2M10P01: calculate conditional probabilities using two-way tables and tree diagrams; use the formula P(A|B) = P(A\u2229B)/P(B); determine whether two events are independent using P(A\u2229B) = P(A)\u00d7P(B); apply to real-world problems such as medical testing and quality control",
  "Two-step and multi-step chance experiments \u2014 tables and tree diagrams": "VC2M10P02: list sample spaces and calculate probabilities for two-step and multi-step chance experiments; use tables of outcomes and tree diagrams to represent combined events; apply the addition rule for mutually exclusive events; solve practical probability problems",

  // ── Year 10 Mathematics — 10A extension topics ────────────────────────────────
  "The real number system \u2014 surds and irrational numbers": "VC2M10AN01: define surds as irrational numbers that are square (or cube) roots of non-perfect-square integers; simplify surds by extracting perfect-square factors; perform operations with surds (add, subtract, multiply, divide, rationalise the denominator); distinguish rational from irrational numbers and locate both on the number line",
  "Logarithms \u2014 definition, laws and applications": "VC2M10AN02: define logarithm as the inverse of exponentiation: log_a(x)=y \u21d4 a^y=x; apply log laws (product, quotient, power); change of base; solve exponential equations using logarithms; apply to half-life, compound interest and earthquake magnitude (Richter scale)",
  "Binomial expansion and Pascal\u2019s triangle": "VC2M10AA01: apply the binomial theorem to expand (a+b)^n for small positive integer n; identify coefficients using Pascal's triangle or combinations \u207fC\u1d63; find a specific term in a binomial expansion; recognise the connection between Pascal's triangle and combinatorics",
  "Polynomial functions \u2014 graphs, roots and factorisation": "VC2M10AA02: define polynomials and identify degree, leading coefficient and roots; divide polynomials using long division; apply the remainder and factor theorems; factorise higher-degree polynomials; sketch graphs identifying intercepts, end behaviour and turning points",
  "Exponential and logarithmic functions and equations": "VC2M10AA03: graph y=a^x and y=log_a(x) as inverse functions; solve exponential equations by writing both sides as powers of the same base or using logarithms; solve logarithmic equations by converting to exponential form; identify domain, range and asymptotes; apply to growth and decay models",
  "Inverse functions and function notation": "VC2M10AA04: understand that inverse functions 'undo' each other; find the inverse of linear and simple non-linear functions algebraically and graphically; use correct function notation f(x), f\u207b\u00b9(x); understand the relationship between the graph of a function and its inverse (reflection in y=x); state domain and range restrictions for the inverse to exist",
  "Arithmetic and geometric sequences and series": "VC2M10AA05: recognise arithmetic sequences (common difference d) and geometric sequences (common ratio r); write the n-th term rule for each; find the sum of arithmetic series using Sn = n/2(2a+(n-1)d) and geometric series using Sn = a(r^n\u22121)/(r\u22121); apply to financial problems (annuities, loans) and scientific contexts",
  "Trigonometry \u2014 non-right-angled triangles (sine and cosine rules)": "VC2M10AM01: apply the sine rule (a/sinA = b/sinB = c/sinC) to find unknown sides and angles in non-right-angled triangles; apply the cosine rule (c\u00b2=a\u00b2+b\u00b2\u22122ab\u00b7cosC) to find unknown sides and angles; determine which rule to use depending on given information; solve ambiguous case for the sine rule; apply to bearing and navigation problems",
  "Trigonometric ratios of obtuse angles and exact values": "VC2M10AM02: extend trigonometric ratios to angles beyond 90\u00b0; identify signs of sin, cos and tan in each quadrant using the CAST diagram; recall exact values for 0\u00b0, 30\u00b0, 45\u00b0, 60\u00b0, 90\u00b0; apply supplementary angle identities sin(180\u00b0\u2212\u03b8)=sin\u03b8; solve equations such as sin\u03b8=k for \u03b8 in [0\u00b0,360\u00b0]",
  "Arc length, sectors and segments of circles": "VC2M10AM03: calculate arc length using l=r\u03b8 (\u03b8 in radians) and convert between degrees and radians; find the area of a sector A=\u00bdr\u00b2\u03b8; find the area of a segment (sector minus triangle); apply to problems involving wheels, clocks and circular motion",
  "Proof \u2014 congruent and similar triangles, angle and chord theorems": "VC2M10ASP01: construct formal proofs using congruent and similar triangles to establish properties of geometric figures; prove angle, chord and tangent theorems in circles; present deductive proofs in clear logical steps with explicit reasons; understand the distinction between inductive (observational) and deductive (formal) reasoning",
  "Vectors \u2014 representation, addition and scalar multiplication": "VC2M10ASP02: represent 2D vectors as directed line segments or column vectors; add and subtract vectors geometrically and algebraically; multiply a vector by a scalar; calculate the magnitude of a vector; apply vectors to describe translations, resultant forces and displacement; understand position vectors",
  "Statistical inference \u2014 sampling distributions and variability": "VC2M10AST01: understand the concept of a sampling distribution; recognise that different samples from the same population give different statistics; estimate population parameters from sample statistics; understand the effect of sample size on variability; interpret margin of error in survey results; compare sample proportions and means across repeated samples",
  "Correlation coefficient and lines of best fit \u2014 interpretation and use": "VC2M10AST02: calculate and interpret Pearson's correlation coefficient r (ranging from \u22121 to +1); understand that r measures the strength and direction of a linear association; distinguish between correlation and causation; find the equation of the least-squares regression line y=a+bx using digital tools; use the line to make predictions and interpret the gradient and intercept in context",
  "Counting techniques \u2014 permutations and combinations": "VC2M10AP01: apply the multiplication principle for counting ordered arrangements; calculate permutations nPr = n!/(n\u2212r)! for selecting and arranging r objects from n; calculate combinations nCr = n!/[r!(n\u2212r)!] for selecting r objects from n where order does not matter; solve probability problems using counting techniques; apply to card games, committee selection and code-making",
  "Probability distributions \u2014 discrete random variables": "VC2M10AP02: define a discrete random variable X and its probability distribution P(X=x); verify that probabilities sum to 1; calculate E(X)=\u03a3x\u00b7P(X=x) (expected value) and Var(X)=\u03a3(x\u2212\u03bc)\u00b2P(X=x); apply to decision-making and games of chance; compare theoretical expected values with experimental results from simulations",
};

type GenResult = { status: number; body: Record<string, unknown> };

// Question formats the generator understands. 'mcq' is the legacy default.
export const ALLOWED_QUESTION_TYPES = ["mcq", "multi_select", "numeric", "short_text", "order", "hotspot", "image_label"];

export type GeneratedQuestion = {
  subtopic?: string;
  question: string;
  options?: string[];
  answer_index?: number;
  solution?: string | null;
  difficulty?: number;
  graph?: Record<string, unknown> | null;
  table_data?: Record<string, unknown> | null;
  diagram?: { svg?: string; caption?: string } | null;
  question_type?: string;
  answer_indices?: number[];
  answer?: number | string;
  tolerance?: number;
  unit?: string;
  accept?: string[];
  items?: string[];
  case_sensitive?: boolean;
  hotspots?: unknown[];
  markers?: unknown[];
  labels?: string[];
  image_url?: string | null;
};

// Build the type-specific DB columns for a generated question. Column names
// match the questions/draft_questions schema (and the frontend fields).
export function typeColumns(q: GeneratedQuestion): Record<string, unknown> {
  const qt = q.question_type && ALLOWED_QUESTION_TYPES.includes(q.question_type) ? q.question_type : "mcq";
  const cols: Record<string, unknown> = {
    question_type: qt,
    answer_indices: null,
    answer: null,
    tolerance: null,
    unit: null,
    accept: null,
    items: null,
    case_sensitive: null,
    hotspots: null,
    markers: null,
    labels: null,
  };
  if (qt === "multi_select") {
    cols.answer_indices = Array.isArray(q.answer_indices) ? q.answer_indices : [];
  } else if (qt === "numeric") {
    const n = typeof q.answer === "number" ? q.answer : parseFloat(String(q.answer));
    cols.answer = Number.isFinite(n) ? n : null;
    cols.tolerance = Number.isFinite(Number(q.tolerance)) ? Number(q.tolerance) : 0;
    cols.unit = q.unit ? (normalizeMathText(q.unit) as string) : null;
  } else if (qt === "short_text") {
    cols.accept = Array.isArray(q.accept) ? q.accept.map((a) => normalizeMathText(a) as string) : [];
    cols.case_sensitive = !!q.case_sensitive;
  } else if (qt === "order") {
    cols.items = Array.isArray(q.items) ? q.items.map((it) => normalizeMathText(it) as string) : [];
  } else if (qt === "hotspot") {
    cols.hotspots = Array.isArray(q.hotspots) ? q.hotspots : [];
  } else if (qt === "image_label") {
    cols.markers = Array.isArray(q.markers) ? q.markers : [];
    cols.labels = Array.isArray(q.labels) ? q.labels.map((l) => normalizeMathText(l) as string) : [];
  }
  return cols;
}

// Options/answer_index are MCQ-only; non-MCQ rows store null for both.
export function mcqColumns(q: GeneratedQuestion): { options: string[] | null; answer_index: number | null } {
  const isMcqLike = (!q.question_type || q.question_type === "mcq" || q.question_type === "multi_select") && Array.isArray(q.options);
  return {
    options: isMcqLike ? q.options!.map((o) => normalizeMathText(o) as string) : null,
    answer_index: typeof q.answer_index === "number" ? q.answer_index : null,
  };
}

// Generate questions for a single subtopic. Returns an HTTP-style status/body
// so callers can either forward it directly (single-topic request) or inspect
// it when aggregating a batch (multi-topic request) — all in-process, with no
// self-referential HTTP calls.
async function generateForTopic(opts: {
  adminDb: SupabaseClient;
  resolvedSubject: string;
  topicCode: string;
  count: number;
  difficulty: string | number;
  autoApprove: boolean;
  questionTypes?: string[];
  includeDiagrams?: boolean;
}): Promise<GenResult> {
  const { adminDb, resolvedSubject, topicCode, count, difficulty, autoApprove } = opts;
  // Which formats Claude may use. Defaults to MCQ-only so existing flows are
  // completely unchanged. Any unknown type is ignored.
  const requestedTypes = (Array.isArray(opts.questionTypes) ? opts.questionTypes : ["mcq"])
    .filter((tp) => ALLOWED_QUESTION_TYPES.includes(tp));
  const extraTypes = requestedTypes.filter((tp) => tp !== "mcq");
  const allowMulti = extraTypes.length > 0;
  const includeDiagrams = !!opts.includeDiagrams;

  // Normalise picker IDs to canonical curriculum names.
  const normalizedSubject = resolvedSubject === "maths_y10" ? "Year 10 Mathematics" : resolvedSubject;

  // All topics use T{n}.{m} format from the managed DB curriculum cache.
  const managedMatch = topicCode.match(/^T(\d+)\.(\d+)$/);
  if (!managedMatch) {
    return { status: 400, body: { error: `Unsupported topic code: ${topicCode}. Please select a topic from the Admin panel (topic codes must be in T{n}.{m} format).` } };
  }

  const topicIdx    = parseInt(managedMatch[1]) - 1;
  const subtopicIdx = parseInt(managedMatch[2]) - 1;

  const { data: currRow } = await adminDb
    .from("curricula").select("id").eq("name", normalizedSubject).maybeSingle();
  if (!currRow?.id) {
    return { status: 400, body: { error: `Curriculum not found: ${normalizedSubject}` } };
  }
  const { data: tRows } = await adminDb
    .from("curriculum_topics").select("id, name").eq("curriculum_id", currRow.id).order("order_index");
  const tRow = (tRows ?? [])[topicIdx];
  if (!tRow) {
    return { status: 400, body: { error: `Topic T${topicIdx + 1} not found in ${normalizedSubject}` } };
  }
  const { data: sRows } = await adminDb
    .from("curriculum_subtopics").select("name").eq("topic_id", tRow.id).order("order_index");
  const sRow = (sRows ?? [])[subtopicIdx];
  if (!sRow) {
    return { status: 400, body: { error: `Subtopic ${topicCode} not found in ${normalizedSubject}` } };
  }

  const topicName      = sRow.name;
  const parentTopicName = tRow.name;
  const curriculumLabel = normalizedSubject;
  const learningObjective = LEARNING_OBJECTIVES[topicName] || topicName;

  const numDiff = Number(difficulty);
  const difficultyInstruction =
    !difficulty || difficulty === "mixed" || isNaN(numDiff)
      ? "Vary difficulty across questions: include easy (1\u20132), medium (3), and hard (4\u20135) questions."
      : numDiff <= 2
        ? "All questions must be difficulty 1\u20132 out of 5 (easy). The student has been struggling with recent questions \u2014 keep questions accessible and confidence-building."
        : numDiff >= 4
          ? "All questions must be difficulty 4\u20135 out of 5 (challenging). The student has been answering recent questions correctly and is ready for harder material."
          : `Questions should be around difficulty ${Math.round(numDiff)} out of 5. You may vary between ${Math.max(1, Math.round(numDiff) - 1)} and ${Math.min(5, Math.round(numDiff) + 1)}.`;

  // Fetch generation_flags from DB (controls LaTeX, graph, table usage in prompts).
  const { data: _curriculumRow } = await adminDb
    .from("curricula").select("generation_flags").eq("name", normalizedSubject).maybeSingle();
  const flags: Record<string, boolean> = (_curriculumRow?.generation_flags as Record<string, boolean>) ?? {};

  // Admin-authored exam context (style/structure/terminology notes) injected into
  // the prompt. Queried separately so a missing column (migration not yet
  // applied) degrades to "no context" without losing generation_flags.
  const { data: _ctxRow } = await adminDb
    .from("curricula").select("exam_context").eq("name", normalizedSubject).maybeSingle();
  const examContext = typeof _ctxRow?.exam_context === "string"
    ? _ctxRow.exam_context.trim().slice(0, 3000)
    : "";

  // Exemplar packs distilled from admin-uploaded reference resources (textbooks,
  // exams, practice tests). Topic-scoped packs are preferred; subject-wide packs
  // (subtopic IS NULL) act as a fallback. Bounded by a char budget to protect
  // token usage. A missing table (migration not yet applied) degrades silently.
  let exemplarContext = "";
  try {
    const { data: exemplarRows } = await adminDb
      .from("curriculum_resource_exemplars")
      .select("content, subtopic")
      .eq("subject", normalizedSubject)
      .eq("enabled", true)
      .limit(50);
    if (exemplarRows && exemplarRows.length) {
      const scoped = (exemplarRows as { content: string; subtopic: string | null }[]).filter(
        (r) => (r.subtopic || "").trim().toLowerCase() === topicName.trim().toLowerCase(),
      );
      const subjectWide = (exemplarRows as { content: string; subtopic: string | null }[]).filter(
        (r) => !r.subtopic,
      );
      // Prefer topic-scoped exemplars; fall back to subject-wide ones.
      const EXEMPLAR_CHAR_BUDGET = 6000;
      const picked: string[] = [];
      let used = 0;
      for (const r of [...scoped, ...subjectWide]) {
        const c = (r.content || "").trim();
        if (!c) continue;
        if (used + c.length > EXEMPLAR_CHAR_BUDGET) break;
        picked.push(c);
        used += c.length;
      }
      exemplarContext = picked.join("\n\n---\n\n");
    }
  } catch {
    exemplarContext = "";
  }
  const flagGraphs = !!flags.graphs;
  const flagTables = !!flags.tables;
  const flagLatex  = flags.latex !== false; // default true

  const latexExample = flagGraphs
    ? "$\\frac{d}{dx}f(x)$, $$\\int_0^1 f(x)\\,dx$$"
    : "$x^2 + 3x - 4$";

  const GRAPH_INSTRUCTIONS = [
    `  graph (optional \u2014 include ONLY when the question genuinely requires a visual graph to be answered. If not needed, omit the key entirely or set to null.)`,
    `    graph schema: { "functions": [{ "expr": "<js-math-expression-in-x>", "color": "<optional hex>" }], "points": [{ "x": <number>, "y": <number>, "label": "<optional string>" }], "xRange": [<min>, <max>], "yRange": [<min>, <max>] }`,
    `    expr must be valid JavaScript math using x as the variable. Use ** for powers (not ^). Examples: "x**2 - 4", "2*x + 1", "Math.sqrt(x)", "-x**2 + 3*x + 4".`,
    `    Always write expr in terms of x for the horizontal axis, even when the question phrases the function with another letter (e.g. for N(t)=1200*(1/3)**(t/5) the expr is "1200 * (1/3)**(x/5)").`,
    `    Include graph for questions about: identifying graph features (vertex, intercepts, turning points), reading values off a graph, matching an equation to a graph, or describing transformations shown visually.`,
    `    Do NOT include graph for purely algebraic or numeric questions.`,
  ];

  const DIAGRAM_INSTRUCTIONS = [
    `  diagram (optional — include ONLY when a labelled figure genuinely helps the question, e.g. a circuit, cell, geometry figure, apparatus, force/energy diagram, or a simple bar/line chart. If not needed, omit the key or set to null.)`,
    `    diagram schema: { "svg": "<svg ...>...</svg>", "caption": "<short caption>" }`,
    `    The svg MUST be a complete, self-contained SVG with a viewBox (e.g. viewBox='0 0 320 180'). Use ONLY single quotes for every attribute so the JSON stays valid. No <script>, no external images, no <foreignObject>.`,
    `    Keep it clean and legible: a dark background (#0f1430) with light strokes (#cbd5e1), gold highlights (#f1be43) and readable sans-serif <text> labels works well. Label the key parts the question refers to.`,
    `    Do NOT include a diagram for questions answerable from text alone.`,
  ];

  const TABLE_INSTRUCTIONS = [
    `  table_data (optional \u2014 include ONLY when the question requires a data table to be answered. If not needed, omit the key entirely or set to null.)`,
    `    table_data schema: { "headers": ["col1", "col2", ...], "rows": [[val, val, ...], ...], "caption": "<optional string>" }`,
    `    Include table_data for questions about: reading values from a table, completing a table of values, comparing data sets, frequency/probability tables, or any question that presents structured data.`,
    `    Do NOT include table_data for questions that can be answered from text or equations alone.`,
  ];

  // Per-type schema instructions, emitted only when richer formats are requested.
  const TYPE_NOTE: Record<string, string> = {
    multi_select: `  multi_select: options (4\u20136 strings) and answer_indices (array of the 0-based indices that are ALL correct \u2014 use 2 or more). Phrase the stem as "Select all that apply".`,
    numeric: `  numeric: answer (the correct number, no units in this field), tolerance (acceptable absolute error as a number, e.g. 0.1; use 0 for exact), and unit (string, or "" if unitless). Do NOT include options or answer_index.`,
    short_text: `  short_text: accept (array of acceptable answer strings \u2014 include common equivalent forms/spellings) and case_sensitive (boolean; only true when case matters, e.g. chemical formulae). Keep answers short (a word, term, or formula). Do NOT include options or answer_index.`,
    order: `  order: items (array of 3\u20136 strings written in the CORRECT order \u2014 the app shuffles them for the student). Do NOT include options or answer_index.`,
  };
  const TYPE_INSTRUCTIONS = [
    `You may use a MIX of question formats. Add a "question_type" key to EVERY object. Allowed types: ${requestedTypes.join(", ")}.`,
    `Choose whichever format best tests each concept, but keep roughly half as "mcq". Do not force a format where it doesn't fit.`,
    `Type-specific keys (every object ALSO needs question, solution, subtopic, difficulty):`,
    `  mcq: options (array of exactly 4 strings) and answer_index (integer 0\u20133).`,
    ...extraTypes.map((tp) => TYPE_NOTE[tp]).filter(Boolean),
  ];

  const system = [
    allowMulti
      ? `You are generating exam-style practice questions in a VARIETY of formats for ${curriculumLabel} students.`
      : `You are generating multiple-choice questions for ${curriculumLabel} students.`,
    `CRITICAL CONSTRAINT: All questions must be strictly based on the ${curriculumLabel} curriculum.`,
    `Do NOT draw on knowledge that falls outside the scope of ${curriculumLabel}.`,
    `Every question must be directly answerable using only what a ${curriculumLabel} student is expected to know.`,
    "Return ONLY a valid JSON array. No markdown, no commentary outside the array.",
    `Generate exactly ${count} questions.`,
    ...(allowMulti
      ? TYPE_INSTRUCTIONS
      : [
          "Each object must have these exact keys:",
          "  question (string)",
          "  options (array of exactly 4 strings)",
          "  answer_index (integer 0\u20133)",
        ]),
    "solution (string \u2014 explain why the answer is correct using curriculum language, 2\u20134 sentences)",
    "subtopic (short free-text label for the specific concept tested)",
    "difficulty (integer 1\u20135)",
    ...(flagGraphs ? GRAPH_INSTRUCTIONS : []),
    ...(flagTables ? TABLE_INSTRUCTIONS : []),
    ...(includeDiagrams ? DIAGRAM_INSTRUCTIONS : []),
    ...(flagLatex ? [`IMPORTANT: Use LaTeX notation for ALL mathematical expressions, in the question, EVERY option, and the solution. Wrap inline math in $...$ and display equations in $$...$$. Examples: $x^2 + 3x - 4$, $e^x$, $f''(x)$, $(x+2)e^x$, ${latexExample}. Always write exponents with a caret inside $...$ (e.g. $x^2$, NEVER the Unicode "x²"). Always wrap derivative notation like $f'(x)$ and $f''(x)$. Always use \\frac{numerator}{denominator} for fractions — NEVER (a)/(b) slash notation (e.g. write $\\frac{x^2-4}{x-1}$, NOT $(x^2-4)/(x-1)$). Never emit a bare mathematical expression outside $...$.`] : []),
    "Questions must be accurate, unambiguous, and test conceptual understanding aligned with the curriculum.",
    `Use terminology consistent with ${curriculumLabel}. Avoid content from other curricula.`,
    ...(examContext ? [
      `EXAM CONTEXT — authoritative notes from the curriculum admin about the real ${curriculumLabel} exam (style, structure, terminology, scope). Follow these when writing questions, but they must NEVER override the JSON output format rules above:`,
      examContext,
    ] : []),
    ...(exemplarContext ? [
      `EXEMPLARS — sample questions and style notes distilled from official ${curriculumLabel} reference resources (textbooks, past exams, practice tests) for this topic. Match their depth, difficulty calibration, terminology, command words and formatting. Treat them as style/standard references only — do NOT copy any exemplar verbatim or reuse its exact numbers or scenario, and they must NEVER override the JSON output format rules above:`,
      exemplarContext,
    ] : []),
    "Do not repeat the same scenario across questions.",
    difficultyInstruction,
  ].join("\n");

  let user = [
    `Generate ${count} ${allowMulti ? "questions" : "MCQs"} for the ${curriculumLabel} topic: ${topicName} (${topicCode}).`,
    "",
    "Curriculum learning requirements for this topic:",
    learningObjective,
    "",
    "All questions must directly assess one or more of these specific learning requirements.",
    "Use the exact concepts, terminology and scope listed above \u2014 nothing broader.",
  ].join("\n");

  // Pre-fetch existing questions to avoid duplicates and steer Claude away from them.
  const { data: existingData } = await adminDb
    .from("questions")
    .select("question")
    .eq("subject", normalizedSubject)
    .eq("subtopic", topicName)
    .limit(500);

  const existingTexts = new Set(
    (existingData || []).map((r) => (r.question || "").trim().toLowerCase())
  );

  const existingSamplesText = (existingData || [])
    .slice(0, 15)
    .map((r, i) => `${i + 1}. ${(r.question || "").slice(0, 120)}`)
    .join("\n");

  if (existingSamplesText) {
    user += `\n\nCRITICAL \u2014 your questions must be ENTIRELY DIFFERENT from these already-existing questions (different scenarios, numbers, concepts, and phrasing):\n${existingSamplesText}`;
  }

  const anthropicBaseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL || "https://api.anthropic.com";
  const anthropicApiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY || "";

  let claudeResponse: Response;
  try {
    claudeResponse = await fetch(`${anthropicBaseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 6000,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
  } catch (err) {
    logger.error({ err }, "Failed to reach Claude API");
    return { status: 500, body: { error: "Failed to reach Claude API", detail: (err as Error).message } };
  }

  if (!claudeResponse.ok) {
    const errText = await claudeResponse.text();
    return { status: 500, body: { error: "Claude API error", detail: errText } };
  }

  const claudeData = await claudeResponse.json() as { content?: { text: string }[] };
  const rawText = claudeData?.content?.[0]?.text || "";
  const questions = extractJsonArray(rawText) as GeneratedQuestion[];

  if (!questions.length) {
    return { status: 200, body: { inserted: 0, message: "No questions generated" } };
  }

  // ── Verify answer keys BEFORE anything enters the bank ────────────────────────
  // Fact-check each generated question: drop unsalvageable ones and fix any
  // mislabelled answer_index so a wrong answer key can't reach students.
  const { kept: verifiedQuestions, dropped, fixed, errored } =
    await filterVerifiedQuestions(questions, { context: { topicCode } });
  if (dropped || fixed || errored) {
    logger.info(
      { topicCode, generated: questions.length, kept: verifiedQuestions.length, dropped, fixed, errored },
      "[generate-questions] answer-key verification adjusted the batch",
    );
  }
  if (!verifiedQuestions.length) {
    return { status: 200, body: { inserted: 0, message: "No questions passed verification" } };
  }

  // ── autoApprove: insert directly into the live questions table ────────────────
  if (autoApprove) {
    const now = new Date().toISOString();
    const allRows = verifiedQuestions
      .filter((q) => q.question)
      .map((q) => ({
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        subject: normalizedSubject,
        topic: parentTopicName,
        subtopic: topicName,
        concept_tag: `${normalizedSubject}|${parentTopicName}|${topicName}`.toLowerCase(),
        difficulty: q.difficulty || 3,
        question: normalizeMathText(q.question) as string,
        ...mcqColumns(q),
        ...typeColumns(q),
        solution: normalizeMathText(q.solution || "") as string,
        graph: q.graph || null,
        table_data: q.table_data || null,
        diagram: q.diagram || null,
        tip: null,
        created_at: now,
      }));

    const newRows = allRows.filter(
      (r) => !existingTexts.has(r.question.trim().toLowerCase())
    );

    let insertedCount = 0;
    if (newRows.length > 0) {
      const { data: insertedData } = await adminDb
        .from("questions")
        .insert(newRows)
        .select("id");
      insertedCount = (insertedData || []).length;
    }

    return { status: 200, body: { inserted: insertedCount, questions: newRows } };
  }

  // ── Default: insert into draft queue for admin review ─────────────────────────
  const rows = verifiedQuestions.map((q) => ({
    source: "ai_generated",
    subject: normalizedSubject,
    topic_code: topicCode,
    topic: parentTopicName,
    subtopic: topicName,
    question: normalizeMathText(q.question) as string,
    ...mcqColumns(q),
    ...typeColumns(q),
    solution: q.solution ? (normalizeMathText(q.solution) as string) : null,
    graph: q.graph || null,
    table_data: q.table_data || null,
    diagram: q.diagram || null,
    difficulty: q.difficulty || null,
    status: "pending",
  }));

  const { error } = await adminDb.from("draft_questions").insert(rows);
  if (error) {
    return { status: 500, body: { error: error.message } };
  }

  return { status: 200, body: { inserted: rows.length } };
}

router.post("/generate-questions", async (req, res) => {
  const { stage, subject, topicCode: topicCodeRaw, topicCodes: topicCodesRaw, count = 10, difficulty = "mixed", autoApprove = false, questionTypes, includeDiagrams } = req.body;

  const resolvedSubject: string = subject || stage;
  // Support both a single topicCode and a topicCodes array
  const topicCodes: string[] = topicCodesRaw
    ? (Array.isArray(topicCodesRaw) ? topicCodesRaw : [topicCodesRaw])
    : topicCodeRaw ? [topicCodeRaw] : [];

  if (!resolvedSubject || !topicCodes.length) {
    res.status(400).json({ error: "subject (or stage) and topicCode/topicCodes required" });
    return;
  }

  const adminDb = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY!);

  // For multi-topic batches process codes in-process with bounded concurrency
  // and aggregate. We call generateForTopic directly rather than issuing a
  // self-referential HTTP request per subtopic — the latter caused intermittent
  // "fetch failed" errors (localhost not routable on serverless). Running a few
  // subtopics in parallel keeps wall-clock under the function's maxDuration
  // without inflating token usage (still one Claude call per subtopic). The
  // pool is kept small to avoid tripping Claude rate limits.
  if (topicCodes.length > 1) {
    const CONCURRENCY = Math.min(4, topicCodes.length);
    let totalInserted = 0;
    const errors: string[] = [];
    let cursor = 0;

    const worker = async () => {
      while (cursor < topicCodes.length) {
        const code = topicCodes[cursor++];
        try {
          const { status, body } = await generateForTopic({
            adminDb, resolvedSubject, topicCode: code, count, difficulty, autoApprove, questionTypes, includeDiagrams,
          });
          if (status === 200) {
            totalInserted += (body.inserted as number) ?? 0;
          } else {
            errors.push(`${code}: ${(body.error as string) ?? `status ${status}`}`);
          }
        } catch (err) {
          logger.error({ err, code }, "Subtopic generation failed");
          errors.push(`${code}: ${(err as Error).message}`);
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    res.status(200).json({ inserted: totalInserted, topicsProcessed: topicCodes.length, errors: errors.length ? errors : undefined });
    return;
  }

  // Single topic
  try {
    const { status, body } = await generateForTopic({
      adminDb, resolvedSubject, topicCode: topicCodes[0], count, difficulty, autoApprove, questionTypes, includeDiagrams,
    });
    res.status(status).json(body);
  } catch (err) {
    logger.error({ err, topicCode: topicCodes[0] }, "Subtopic generation failed");
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
