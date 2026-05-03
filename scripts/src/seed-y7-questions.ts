/**
 * Seed script: inserts Year 7 Maths and Year 7 English questions using the
 * same workflow as the admin Generate → Review → Approve path:
 *   1. Inserts into draft_questions with status='approved' (audit trail)
 *   2. Inserts into questions (live bank)
 * Idempotent: skips subjects that already have ≥1 live question.
 *
 * Run:  pnpm --filter @workspace/scripts exec tsx ./src/seed-y7-questions.ts
 */

const SUPABASE_URL = "https://pslpxawrfpcuwnupdfbs.supabase.co";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SERVICE_KEY) {
  console.error("SUPABASE_SERVICE_KEY env var is not set.");
  process.exit(1);
}

interface QuestionRow {
  id: string;
  subject: string;
  topic: string;
  subtopic: string;
  concept_tag: string;
  difficulty: number;
  question: string;
  options: string[];
  answer_index: number;
  solution: string;
  tip: null;
}

function makeId(): string {
  return `admin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function q(
  subject: string,
  topic: string,
  subtopic: string,
  difficulty: number,
  question: string,
  options: string[],
  answer_index: number,
  solution: string
): QuestionRow {
  const concept_tag = `${subject}|${topic}|${subtopic}`.toLowerCase();
  return {
    id: makeId(),
    subject,
    topic,
    subtopic,
    concept_tag,
    difficulty,
    question,
    options,
    answer_index,
    solution,
    tip: null,
  };
}

// ─── Year 7 Mathematics ───────────────────────────────────────────────────────

const MATHS = "Year 7 Mathematics";

// Topic name constants (verbatim from AC v9)
const N1 = "describe the relationship between perfect square numbers and square roots, and use squares of numbers and square roots of perfect square numbers to solve problems";
const N2 = "represent natural numbers as products of powers of prime numbers using exponent notation";
const N4 = "find equivalent representations of rational numbers and represent rational numbers on a number line";
const N6 = "use the 4 operations with positive rational numbers including fractions, decimals and percentages to solve problems using efficient calculation strategies";
const N7 = "compare, order and solve problems involving addition and subtraction of integers";
const N8 = "recognise, represent and solve problems involving ratios";
const A1 = "recognise and use variables to represent everyday formulas algebraically and substitute values into formulas to determine an unknown";
const A2 = "formulate algebraic expressions using constants, variables, operations and brackets";
const A3 = "solve one-variable linear equations with natural number solutions; verify the solution by substitution";
const A4 = "describe relationships between variables represented in graphs of functions from authentic data";
const A5 = "generate tables of values from visually growing patterns or the rule of a function; describe and plot these relationships on the Cartesian plane";
const M1 = "solve problems involving the area of triangles and parallelograms using established formulas and appropriate units";
const M2 = "solve problems involving the volume of right prisms including rectangular and triangular prisms, using established formulas and appropriate units";
const M3 = "describe the relationship between π and the features of circles including the circumference, radius and diameter";
const M4 = "identify corresponding, alternate and co-interior relationships between angles formed when parallel lines are crossed by a transversal; use them to solve problems and explain reasons";
const M5 = "demonstrate that the interior angle sum of a triangle in the plane is 180° and apply this to determine the interior angle sum of other shapes and the size of unknown angles";
const SP1 = "represent objects in 2 dimensions; discuss and reason about the advantages and disadvantages of different representations";
const SP2 = "classify triangles, quadrilaterals and other polygons according to their side and angle properties; identify and reason about relationships";
const SP3 = "describe transformations of a set of points using coordinates in the Cartesian plane, translations and reflections on an axis, and rotations of multiples of 90°";
const ST1 = "acquire data sets for discrete and continuous numerical variables and calculate the range, median, mean and mode; make and justify decisions about which measures of central tendency provide useful insights into the nature of the distribution of data";
const ST2 = "create different types of numerical data displays including stem-and-leaf plots using software where appropriate; describe and compare the distribution of data, commenting on the shape, centre and spread including outliers and determining the range, median, mean and mode";
const ST3 = "plan and conduct statistical investigations involving data for discrete and continuous numerical variables; analyse and interpret distributions of data and report findings in terms of shape and summary statistics";
const P1 = "identify the sample space for single-stage events; assign probabilities to the outcomes of these events and predict relative frequencies for related experiments";
const P2 = "conduct repeated chance experiments and run simulations with a large number of trials using digital tools; compare observations with predictions about the likelihood of outcomes, and identify the effect of sample size on the reliability of predictions";

const mathsQuestions: QuestionRow[] = [
  // ── Number strand (6 questions) ──────────────────────────────────────────
  q(MATHS, N1, "perfect squares and square roots", 1,
    "What is the square root of 169?",
    ["11", "12", "13", "14"],
    2,
    "13 × 13 = 169, so √169 = 13. Squaring and finding the square root are inverse operations — squaring a number multiplies it by itself, while the square root undoes that operation."
  ),
  q(MATHS, N2, "prime factorisation", 2,
    "Which of the following shows the prime factorisation of 72 using exponent notation?",
    ["2² × 3³", "2³ × 3²", "2⁴ × 3", "6² × 2"],
    1,
    "Using a factor tree: 72 = 8 × 9 = 2³ × 3². Both 2 and 3 are prime numbers, and this is their unique factorisation."
  ),
  q(MATHS, N4, "equivalent fractions and decimals", 1,
    "Which fraction is equivalent to 0.6?",
    ["1/6", "2/5", "3/5", "6/100"],
    2,
    "0.6 = 6/10 = 3/5. To convert a decimal to a fraction, write the decimal part over the place value (tenths), then simplify by dividing numerator and denominator by their HCF (2)."
  ),
  q(MATHS, N6, "operations with fractions", 2,
    "What is 2/3 + 1/4?",
    ["3/7", "8/12", "11/12", "3/4"],
    2,
    "Convert to a common denominator of 12: 2/3 = 8/12 and 1/4 = 3/12. Adding the numerators gives 8/12 + 3/12 = 11/12."
  ),
  q(MATHS, N7, "addition and subtraction of integers", 1,
    "What is −8 + 5?",
    ["13", "−13", "−3", "3"],
    2,
    "Starting at −8 on a number line and moving 5 steps in the positive direction lands at −3. Alternatively, since the signs differ, subtract the smaller absolute value from the larger: 8 − 5 = 3, then keep the sign of the larger, which is negative."
  ),
  q(MATHS, N8, "simplifying ratios", 1,
    "Simplify the ratio 15 : 25.",
    ["5 : 9", "3 : 5", "1 : 2", "5 : 3"],
    1,
    "The HCF of 15 and 25 is 5. Dividing both parts by 5 gives 3 : 5. A ratio is in simplest form when both parts share no common factor other than 1."
  ),

  // ── Algebra strand (6 questions) ────────────────────────────────────────
  q(MATHS, A1, "substituting into formulas", 1,
    "The formula for the area of a rectangle is A = lw. If l = 9 and w = 6, what is A?",
    ["15", "30", "54", "45"],
    2,
    "Substituting l = 9 and w = 6 into A = lw gives A = 9 × 6 = 54. The formula uses multiplication, so area is found by multiplying length by width."
  ),
  q(MATHS, A2, "writing algebraic expressions", 1,
    "Which expression represents '5 more than three times a number n'?",
    ["5n + 3", "3n + 5", "3(n + 5)", "5(n + 3)"],
    1,
    "'Three times a number n' is written as 3n, and '5 more than' means we add 5. So the expression is 3n + 5."
  ),
  q(MATHS, A3, "solving linear equations", 2,
    "Solve: 4x + 3 = 19. What is x?",
    ["4", "5", "3", "6"],
    0,
    "Subtract 3 from both sides: 4x = 16. Then divide both sides by 4: x = 4. Verify by substituting back: 4(4) + 3 = 16 + 3 = 19 ✓"
  ),
  q(MATHS, A3, "solving linear equations", 2,
    "Solve: 5x − 7 = 18. What is x?",
    ["11", "5", "25", "3"],
    1,
    "Add 7 to both sides: 5x = 25. Then divide both sides by 5: x = 5. Check: 5(5) − 7 = 25 − 7 = 18 ✓"
  ),
  q(MATHS, A5, "tables of values and patterns", 2,
    "A pattern follows the rule y = 3x − 1. What is y when x = 4?",
    ["11", "12", "9", "13"],
    0,
    "Substitute x = 4 into y = 3x − 1: y = 3(4) − 1 = 12 − 1 = 11. This rule generates a linear pattern where each y-value increases by 3 as x increases by 1."
  ),
  q(MATHS, A4, "graphs of functions", 1,
    "A graph shows that as the temperature increases, ice cream sales also increase. This relationship is described as:",
    ["Negative", "No relationship", "Positive", "Constant"],
    2,
    "When both variables increase together, the relationship is called positive. On a graph, this appears as a line or curve that slopes upward from left to right."
  ),

  // ── Measurement strand (6 questions) ────────────────────────────────────
  q(MATHS, M1, "area of triangles", 1,
    "A triangle has a base of 10 cm and a perpendicular height of 6 cm. What is its area?",
    ["60 cm²", "30 cm²", "16 cm²", "120 cm²"],
    1,
    "Area of a triangle = ½ × base × height = ½ × 10 × 6 = 30 cm². The perpendicular height must be used, not the slant side."
  ),
  q(MATHS, M1, "area of parallelograms", 2,
    "A parallelogram has a base of 8 m and a perpendicular height of 5 m. What is its area?",
    ["13 m²", "20 m²", "40 m²", "80 m²"],
    2,
    "Area of a parallelogram = base × perpendicular height = 8 × 5 = 40 m². Note that the perpendicular height (not the slant height) is used in this formula."
  ),
  q(MATHS, M2, "volume of rectangular prisms", 1,
    "A rectangular prism is 6 cm long, 4 cm wide and 3 cm tall. What is its volume?",
    ["13 cm³", "36 cm³", "72 cm³", "48 cm³"],
    2,
    "Volume = length × width × height = 6 × 4 × 3 = 72 cm³. This formula works because the volume equals the area of the rectangular base multiplied by the height."
  ),
  q(MATHS, M3, "circumference of circles", 2,
    "A circle has a diameter of 10 cm. Using π ≈ 3.14, what is its circumference?",
    ["31.4 cm", "62.8 cm", "15.7 cm", "314 cm"],
    0,
    "Circumference = π × d = 3.14 × 10 = 31.4 cm. The circumference is approximately 3.14 times the diameter because π represents the ratio of circumference to diameter for any circle."
  ),
  q(MATHS, M4, "angles and parallel lines", 2,
    "Two parallel lines are cut by a transversal. The alternate interior angles are always:",
    ["Supplementary (add to 180°)", "Complementary (add to 90°)", "Equal", "Adjacent"],
    2,
    "Alternate interior angles formed when a transversal crosses two parallel lines are always equal. They appear on opposite sides of the transversal, between the parallel lines, in a 'Z' shape."
  ),
  q(MATHS, M5, "angle sum of triangles", 1,
    "A triangle has two angles measuring 65° and 48°. What is the size of the third angle?",
    ["67°", "117°", "132°", "52°"],
    0,
    "The interior angles of any triangle sum to 180°. Third angle = 180° − 65° − 48° = 67°."
  ),

  // ── Space strand (6 questions) ──────────────────────────────────────────
  q(MATHS, SP1, "2D representations of 3D objects", 1,
    "Which view of a 3D object shows what it looks like when viewed from directly above?",
    ["Front elevation", "Side elevation", "Plan view (top view)", "Cross-section"],
    2,
    "The top view, also called the plan view, shows an object as seen from directly above. Different views (front, side, top) together give a complete picture of a 3D object and each has advantages for different purposes."
  ),
  q(MATHS, SP2, "classifying triangles", 1,
    "A triangle has sides measuring 5 cm, 5 cm, and 8 cm. What type of triangle is it?",
    ["Equilateral", "Isosceles", "Scalene", "Right-angled"],
    1,
    "An isosceles triangle has exactly two sides of equal length. Since two sides are 5 cm and one side is 8 cm, this is an isosceles triangle."
  ),
  q(MATHS, SP2, "classifying quadrilaterals", 1,
    "A quadrilateral with exactly one pair of parallel sides is called a:",
    ["Parallelogram", "Rectangle", "Trapezium", "Rhombus"],
    2,
    "A trapezium has exactly one pair of parallel sides. A parallelogram has two pairs of parallel sides, while a rectangle and rhombus are special types of parallelogram."
  ),
  q(MATHS, SP3, "reflections on the Cartesian plane", 2,
    "A point at (4, −3) is reflected across the y-axis. What are the new coordinates?",
    ["(−4, −3)", "(4, 3)", "(−4, 3)", "(3, −4)"],
    0,
    "Reflecting a point across the y-axis changes the sign of the x-coordinate while keeping the y-coordinate the same. So (4, −3) maps to (−4, −3). This is because the y-axis acts as a mirror for horizontal distances."
  ),
  q(MATHS, SP3, "translations on the Cartesian plane", 1,
    "A point at (2, 5) is translated 3 units to the right and 2 units down. What are the new coordinates?",
    ["(5, 3)", "(5, 7)", "(−1, 3)", "(−1, 7)"],
    0,
    "Moving right increases the x-coordinate by 3: 2 + 3 = 5. Moving down decreases the y-coordinate by 2: 5 − 2 = 3. The new point is (5, 3)."
  ),
  q(MATHS, SP3, "rotations on the Cartesian plane", 3,
    "A point at (3, 2) is rotated 90° clockwise about the origin. What are the new coordinates?",
    ["(−2, 3)", "(2, −3)", "(−3, −2)", "(2, 3)"],
    1,
    "For a 90° clockwise rotation about the origin, the rule is (x, y) → (y, −x). Applying this to (3, 2): the new coordinates are (2, −3)."
  ),

  // ── Statistics strand (6 questions) ─────────────────────────────────────
  q(MATHS, ST1, "mean, median, mode, range", 1,
    "What is the mode of the data set: 4, 7, 9, 7, 3, 5, 7?",
    ["4", "7", "9", "6"],
    1,
    "The mode is the value that appears most often. The value 7 appears three times, more than any other value, so the mode is 7."
  ),
  q(MATHS, ST1, "calculating the mean", 2,
    "What is the mean of: 12, 15, 8, 10, 15?",
    ["12", "13", "15", "10"],
    0,
    "Mean = sum ÷ count = (12 + 15 + 8 + 10 + 15) ÷ 5 = 60 ÷ 5 = 12. The mean gives the 'average' by sharing the total equally among all values."
  ),
  q(MATHS, ST1, "finding the median", 1,
    "Find the median of the ordered data set: 3, 5, 8, 12, 14, 19, 22.",
    ["12", "8", "14", "5"],
    0,
    "The median is the middle value of an ordered data set. With 7 values, the 4th value is the middle one. Counting to the 4th value: 3, 5, 8, 12 — the median is 12."
  ),
  q(MATHS, ST1, "calculating the range", 1,
    "What is the range of the data set: 14, 9, 22, 5, 18?",
    ["14", "17", "22", "9"],
    1,
    "Range = maximum value − minimum value = 22 − 5 = 17. The range measures the spread of data from the lowest to the highest value."
  ),
  q(MATHS, ST2, "reading stem-and-leaf plots", 2,
    "In a stem-and-leaf plot, the stem '2' has leaves '3, 5, 8'. What data values do these represent?",
    ["2, 3, 5, 8", "23, 25, 28", "2.3, 2.5, 2.8", "32, 52, 82"],
    1,
    "In a stem-and-leaf plot, each stem represents the leading digit(s) and each leaf represents the final digit. Stem 2 with leaves 3, 5, 8 means the values 23, 25, and 28."
  ),
  q(MATHS, ST3, "planning statistical investigations", 2,
    "A student wants to investigate whether Year 7 students get more sleep on weekends than on weekdays. What type of data should they collect?",
    ["Categorical data about favourite activities", "Numerical data on hours of sleep on weekdays and weekends", "Data on what students eat for breakfast", "Numerical data on test scores"],
    1,
    "To investigate hours of sleep, the student needs numerical (continuous) data — specifically, the number of hours slept on weekday nights versus weekend nights. This allows comparison of distributions using statistics such as mean and range."
  ),

  // ── Probability strand (6 questions) ────────────────────────────────────
  q(MATHS, P1, "sample space and probability", 1,
    "A fair six-sided die is rolled once. What is the probability of rolling an even number?",
    ["1/3", "1/2", "2/3", "1/6"],
    1,
    "The sample space is {1, 2, 3, 4, 5, 6} — 6 equally likely outcomes. The even numbers are {2, 4, 6} — 3 favourable outcomes. P(even) = 3/6 = 1/2."
  ),
  q(MATHS, P1, "probability scale", 1,
    "An event that is certain to happen has a probability of:",
    ["0", "0.5", "1", "Between 0 and 1"],
    2,
    "Probabilities range from 0 (impossible) to 1 (certain). An event that is guaranteed to occur has a probability of 1, since all outcomes in the sample space are favourable."
  ),
  q(MATHS, P1, "assigning probabilities", 2,
    "A bag contains 4 red, 3 blue and 3 green marbles. One marble is picked at random. What is the probability it is blue?",
    ["3/10", "3/7", "1/3", "3/4"],
    0,
    "There are 4 + 3 + 3 = 10 marbles in total. There are 3 blue marbles. P(blue) = 3/10. Each marble is equally likely to be selected."
  ),
  q(MATHS, P1, "predicting relative frequency", 2,
    "A spinner has 5 equal sections numbered 1 to 5. If the spinner is spun 200 times, approximately how many times would you expect it to land on 3?",
    ["20", "40", "50", "5"],
    1,
    "P(landing on 3) = 1/5. Expected frequency = probability × number of trials = 1/5 × 200 = 40. This is the theoretical expected frequency, though actual results may vary."
  ),
  q(MATHS, P2, "relative frequency in experiments", 2,
    "A coin is tossed 80 times and lands on heads 36 times. What is the relative frequency of heads?",
    ["0.36", "0.45", "0.5", "0.44"],
    1,
    "Relative frequency = number of times the event occurred ÷ total number of trials = 36 ÷ 80 = 0.45. This is the experimental probability based on the results collected."
  ),
  q(MATHS, P2, "effect of sample size", 2,
    "A student rolls a die 10 times and gets a 6 four times. She then rolls it 1000 more times. The relative frequency of rolling a 6 in the larger experiment will most likely be:",
    ["Higher than 4/10", "Exactly 1/6", "Closer to 1/6 than the 10-trial result", "Further from 1/6 than the 10-trial result"],
    2,
    "As the number of trials increases, relative frequency tends to get closer to the theoretical probability. With only 10 rolls, results can vary greatly (4/10 = 0.4 is much higher than 1/6 ≈ 0.167). With 1000 rolls, the relative frequency should be much closer to 1/6."
  ),
];

// ─── Year 7 English ───────────────────────────────────────────────────────────

const ENGLISH = "Year 7 English";

// Topic name constants
const L3 = "identify and describe how texts are structured differently depending on their purpose and how language features vary in texts";
const L4 = "understand that the cohesion of texts relies on devices that signal structure and guide readers, such as overviews and initial and concluding paragraphs";
const L5 = "understand how complex and compound-complex sentences can be used to elaborate, extend and explain ideas";
const L6 = "understand how consistency of tense through verbs and verb groups achieves clarity in sentences";
const L8 = "investigate the role of vocabulary in building specialist and technical knowledge, including terms that have both everyday and technical meanings";
const L9 = "understand the use of punctuation including colons and brackets to support meaning";
const LT3 = "explain the ways that literary devices and language features such as dialogue, and images are used to create character, and to influence emotions and opinions in different types of texts";
const LT4 = "discuss the aesthetic and social value of literary texts using relevant and appropriate metalanguage";
const LT5 = "identify and explain the ways that characters, settings and events combine to create meaning in narratives";
const LT6 = "identify and explain how literary devices create layers of meaning in texts including poetry";
const LT2 = "form an opinion about characters, settings and events in texts, identifying areas of agreement and difference with others' opinions and justifying a response";
const LC3 = "analyse the ways in which language features shape meaning and vary according to audience and purpose";
const LC4 = "explain the structure of ideas such as the use of taxonomies, cause and effect, extended metaphors and chronology";
const LC5 = "use comprehension strategies such as visualising, predicting, connecting, summarising, monitoring, questioning and inferring to analyse and summarise information and ideas";
const LC6 = "plan, create, edit and publish written and multimodal texts, selecting subject matter, and using text structures, language features, literary devices and visual features as appropriate to convey information, ideas and opinions in ways that may be imaginative, reflective, informative, persuasive and/or analytical";
const LC8 = "understand how to use spelling rules and word origins; for example, Greek and Latin roots, base words, suffixes, prefixes and spelling patterns to learn new words and how to spell them";

const englishQuestions: QuestionRow[] = [
  // ── Language strand (6 questions) ───────────────────────────────────────
  q(ENGLISH, L3, "text structure and purpose", 1,
    "Which text structure would most likely be used in a recipe or instruction manual?",
    ["Narrative", "Procedure", "Exposition", "Report"],
    1,
    "A procedure text is structured to guide someone through a series of steps to achieve a goal. It typically includes a goal statement, a list of materials, and numbered steps — making it ideal for recipes and instruction manuals."
  ),
  q(ENGLISH, L4, "cohesive devices", 2,
    "Which device creates cohesion in a text by using a pronoun to refer back to a noun already mentioned?",
    ["Conjunction", "Reference chain (pronoun reference)", "Topic sentence", "Heading"],
    1,
    "A reference chain uses pronouns (e.g., 'he', 'she', 'it', 'they') to refer back to nouns or ideas already introduced in the text. This creates cohesion — a sense that the text holds together — by avoiding unnecessary repetition."
  ),
  q(ENGLISH, L5, "complex sentences", 2,
    "In the sentence 'Although it was raining heavily, we decided to go for a walk', what is the role of the clause 'Although it was raining heavily'?",
    ["It is the main clause", "It is a subordinate clause", "It is a noun phrase", "It is an independent clause"],
    1,
    "A subordinate clause cannot stand alone as a sentence; it depends on the main clause for its meaning. 'Although it was raining heavily' introduces a condition or contrast, and the main clause 'we decided to go for a walk' completes the meaning."
  ),
  q(ENGLISH, L6, "verb tense consistency", 1,
    "Which sentence is written consistently in the past tense?",
    ["She walks to school and bought a sandwich.", "She walked to school and bought a sandwich.", "She walks to school and buys a sandwich.", "She walked to school and buys a sandwich."],
    1,
    "'Walked' and 'bought' are both past tense verb forms, making the sentence consistent. Mixing past ('walked') and present ('buys') tense creates confusion about when events occurred."
  ),
  q(ENGLISH, L9, "colons and brackets", 2,
    "In which sentence is the colon used correctly?",
    ["She: ran quickly to the door.", "The box contained: a pen, a ruler, and scissors.", "She needed three things: a pen, a ruler, and an eraser.", "The cat: was sleeping on the mat."],
    2,
    "A colon is correctly used to introduce a list, explanation, or quotation that follows a complete clause. 'She needed three things' is a complete statement, and the colon correctly introduces the list that follows. A colon should not interrupt the natural flow between a verb and its object."
  ),
  q(ENGLISH, L8, "technical vocabulary", 2,
    "The word 'cell' has an everyday meaning and a specialist meaning in science. This is an example of a word that:",
    ["Is always used in a technical context", "Has both everyday and technical meanings depending on the context", "Should only be used in science texts", "Has no specific technical meaning"],
    1,
    "Many words have both everyday meanings (a prison cell, a room) and specialised technical meanings in specific fields (a biological cell in science, or a cell in a spreadsheet). Understanding how context shapes word meaning is important for building vocabulary across subjects."
  ),

  // ── Literature strand (6 questions) ─────────────────────────────────────
  q(ENGLISH, LT3, "literary devices — personification", 1,
    "'The wind whispered secrets through the trees.' This sentence is an example of which literary device?",
    ["Simile", "Alliteration", "Personification", "Hyperbole"],
    2,
    "Personification gives human qualities to non-human things. In this sentence, the wind is described as 'whispering', which is a human action. This creates a vivid image and gives the wind a sense of mystery or gentleness."
  ),
  q(ENGLISH, LT6, "poetic devices — alliteration", 1,
    "'Peter Piper picked a peck of pickled peppers.' Which literary device is used in this line?",
    ["Assonance", "Alliteration", "Onomatopoeia", "Rhyme"],
    1,
    "Alliteration is the repetition of the same consonant sound at the beginning of closely connected words. Here, the 'P' sound is repeated throughout, creating a rhythmic, memorable effect."
  ),
  q(ENGLISH, LT5, "narrative elements", 1,
    "The main problem or challenge that a protagonist must overcome in a story is called:",
    ["The resolution", "The theme", "The conflict", "The setting"],
    2,
    "Conflict is the central struggle or problem in a narrative. It drives the plot forward and creates tension. Conflict can be internal (character vs. self) or external (character vs. another person, society, or nature). The resolution is when the conflict is solved."
  ),
  q(ENGLISH, LT4, "metalanguage — theme", 1,
    "In literature, the word 'theme' refers to:",
    ["The physical setting of a story", "The central message or idea that the text explores", "The main character's personality", "The sequence of events in a plot"],
    1,
    "A theme is the underlying message, idea, or insight about life that a text explores. For example, themes might include 'the importance of friendship', 'the consequences of greed', or 'identity and belonging'. Theme is different from plot, which is the sequence of events."
  ),
  q(ENGLISH, LT2, "justifying a response to a text", 2,
    "When writing a response to a literary text, which approach best demonstrates a justified opinion?",
    ["State your opinion without any explanation", "Refer to specific evidence from the text to support your view", "Summarise the entire plot before giving an opinion", "Only agree with what the author says"],
    1,
    "Justifying an opinion in a text response requires referring to specific textual evidence — quotes, descriptions, character actions — to support your point of view. Simply stating an opinion without evidence is not a justified response."
  ),
  q(ENGLISH, LT6, "poetic devices — layers of meaning", 2,
    "In the poem 'The Road Not Taken' by Robert Frost, the two paths in the woods most likely represent:",
    ["A literal description of a forest walk", "The choices people face in life", "The difficulty of travelling in autumn", "The beauty of nature"],
    1,
    "Literary devices such as symbolism create layers of meaning beyond the literal. The two paths in the poem function as a symbol for the choices we face in life. The speaker's reflection on choosing a path represents reflection on life decisions and their consequences."
  ),

  // ── Literacy strand (6 questions) ───────────────────────────────────────
  q(ENGLISH, LC5, "comprehension strategies — predicting", 1,
    "Before reading a new chapter, a student looks at the title, headings, and images. She is using which comprehension strategy?",
    ["Summarising", "Inferring", "Predicting", "Connecting"],
    2,
    "Predicting involves using clues from the title, headings, images, and prior knowledge to make educated guesses about what a text will be about or what will happen next. This strategy activates prior knowledge and creates a purpose for reading."
  ),
  q(ENGLISH, LC3, "language for audience and purpose", 2,
    "A writer uses formal vocabulary, long complex sentences, and passive voice. The text is most likely written for:",
    ["Young children", "A general social media audience", "An academic or professional audience", "A personal diary entry"],
    2,
    "Formal vocabulary, complex sentence structures, and passive voice are features of academic and professional writing. These choices signal authority, distance, and objectivity, which suit formal contexts. Informal texts — like social media posts or diary entries — use simpler, more personal language."
  ),
  q(ENGLISH, LC4, "cause and effect text structure", 1,
    "Which sentence best demonstrates a cause-and-effect text structure?",
    ["The river is wide and blue.", "First, stir the mixture, then pour it into the tin.", "The river flooded because of three days of heavy rainfall.", "There are three types of clouds: cumulus, cirrus and stratus."],
    2,
    "A cause-and-effect structure explains why something happened (cause) and what resulted (effect). 'The river flooded because of three days of heavy rainfall' clearly shows both the effect (river flooded) and the cause (heavy rainfall)."
  ),
  q(ENGLISH, LC6, "the writing process", 1,
    "Which stage of the writing process involves reading through your work and fixing errors in spelling, grammar, and punctuation?",
    ["Drafting", "Planning", "Editing", "Publishing"],
    2,
    "Editing is the stage where you carefully check your writing for errors in spelling, grammar, and punctuation. It is different from revising, which focuses on improving content and organisation. After editing, the text is ready to be published or presented."
  ),
  q(ENGLISH, LC8, "word origins — Latin roots", 2,
    "The Latin root 'port' means 'to carry'. Which of the following words uses this root?",
    ["Portrait", "Transport", "Portion", "Portal"],
    1,
    "'Transport' comes from the Latin 'trans' (across) + 'portare' (to carry), literally meaning 'to carry across'. Understanding Latin and Greek roots helps you decode the meaning of unfamiliar words. The root 'port' also appears in 'import', 'export', and 'portable'."
  ),
  q(ENGLISH, LC8, "prefixes and spelling", 1,
    "Which word is correctly spelled using the prefix 'dis-' to mean the opposite?",
    ["Disapoint", "Disappoint", "Dissapoint", "Dissappointment"],
    1,
    "'Disappoint' is spelled with one 's' because the prefix 'dis-' is added to 'appoint'. The prefix 'dis-' means 'not' or 'opposite of'. When adding 'dis-' to a word beginning with 'a', there is no doubling of letters."
  ),
];

// ─── Supabase helpers ─────────────────────────────────────────────────────────

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function postRows(table: string, rows: object[]): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Insert into ${table} failed (${res.status}): ${text}`);
  }
}

async function getLiveCount(subject: string): Promise<number> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/questions?subject=eq.${encodeURIComponent(subject)}&select=id`,
    { headers: { ...HEADERS, Prefer: "count=exact" } }
  );
  const range = res.headers.get("content-range") || "0/0";
  return parseInt(range.split("/")[1] || "0", 10);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n── Year 7 Questions Seed ──────────────────────────────────────\n");

  const groups: Array<{ label: string; rows: QuestionRow[] }> = [
    { label: "Year 7 Mathematics", rows: mathsQuestions },
    { label: "Year 7 English",     rows: englishQuestions },
  ];

  for (const { label, rows } of groups) {
    const existing = await getLiveCount(label);
    if (existing > 0) {
      console.log(`  ⏭  ${label}: ${existing} questions already exist — skipping.`);
      continue;
    }

    console.log(`  Inserting ${rows.length} questions for ${label}…`);

    // 1. Insert into draft_questions with status='approved' (audit trail,
    //    mirrors what the admin Generate→Review→Approve workflow produces).
    const draftRows = rows.map((r) => ({
      source: "seed_script",
      subject: r.subject,
      topic: r.topic,
      subtopic: r.subtopic,
      question: r.question,
      options: r.options,
      answer_index: r.answer_index,
      solution: r.solution,
      difficulty: r.difficulty,
      status: "approved",
      reviewed_at: new Date().toISOString(),
    }));

    const BATCH = 20;
    for (let i = 0; i < draftRows.length; i += BATCH) {
      await postRows("draft_questions", draftRows.slice(i, i + BATCH));
    }
    console.log(`    ✓ draft_questions records created (status=approved)`);

    // 2. Insert into live questions table.
    for (let i = 0; i < rows.length; i += BATCH) {
      await postRows("questions", rows.slice(i, i + BATCH));
    }
    console.log(`    ✓ questions records created (live bank)`);
  }

  // Final verification
  const mathsCount = await getLiveCount("Year 7 Mathematics");
  const engCount   = await getLiveCount("Year 7 English");
  console.log(`\nDatabase totals:`);
  console.log(`  Year 7 Mathematics: ${mathsCount} live questions`);
  console.log(`  Year 7 English:     ${engCount} live questions`);
  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
