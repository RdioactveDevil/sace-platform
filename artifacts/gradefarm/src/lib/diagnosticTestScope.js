// The year levels and built-in subjects (with topics) the tutor's test builder offers.

export const YEAR_LEVEL_GROUPS = [
  { label: 'Primary',  levels: ['Year 3', 'Year 4', 'Year 5', 'Year 6'] },
  { label: 'Junior Secondary', levels: ['Year 7', 'Year 8', 'Year 9', 'Year 10'] },
  { label: 'Senior Secondary', levels: ['Year 11 / Stage 1', 'Year 12 / Stage 2'] },
]

// All subjects, keyed by id, with topics and which year groups they appear in
export const ALL_DIAGNOSTIC_SUBJECTS = [
  // ── Primary ────────────────────────────────────────────────────────────────
  {
    id: 'maths_primary', name: 'Mathematics',
    yearGroups: ['primary'],
    topics: ['Number & Place Value', 'Fractions & Decimals', 'Money & Financial Maths', 'Patterns & Algebra', 'Measurement', 'Geometry & Shape', 'Location & Transformation', 'Data & Graphs', 'Chance & Probability', 'Problem Solving'],
  },
  {
    id: 'english_primary', name: 'English',
    yearGroups: ['primary'], isWriting: true,
    topics: ['Reading Comprehension', 'Narrative Writing', 'Persuasive Writing', 'Grammar & Punctuation', 'Vocabulary', 'Spelling', 'Sentence Structure', 'Handwriting & Presentation'],
  },
  {
    id: 'science_primary', name: 'Science',
    yearGroups: ['primary'],
    topics: ['Biological Sciences', 'Chemical Sciences', 'Earth & Space Sciences', 'Physical Sciences', 'Science Inquiry'],
  },
  // ── Junior Secondary (Year 7–10) ───────────────────────────────────────────
  {
    id: 'science_y7', name: 'Science',
    yearGroups: ['junior'],
    topics: ['Cells & Living Things', 'Body Systems', 'Ecosystems & Ecology', 'Mixtures & Substances', 'Chemical Reactions', 'Forces & Motion', 'Energy Forms & Transfers', 'Waves — Light & Sound', 'Electricity & Magnetism', 'Earth & Space', 'Geology', 'Science Inquiry Skills'],
  },
  {
    id: 'history_y7', name: 'History',
    yearGroups: ['junior'],
    topics: ['Ancient Civilisations', 'The Mediterranean World', 'The Asian World', 'The Americas', 'Medieval Europe', 'Renaissance & Reformation', 'Age of Exploration', 'Industrial Revolution', 'Australian History', 'Source Analysis & Historical Skills'],
  },
  {
    id: 'geography_y7', name: 'Geography',
    yearGroups: ['junior'],
    topics: ['Landforms & Landscapes', 'Water in the World', 'Place & Liveability', 'Interconnections', 'Changing Nations', 'Environmental Change & Management', 'Geographies of Interconnections', 'Geographical Inquiry Skills'],
  },
  // ── Stage 1 (Year 11) ──────────────────────────────────────────────────────
  {
    id: 'maths_methods_s1', name: 'Mathematical Methods',
    yearGroups: ['stage1'],
    topics: ['Functions and graphs', 'Polynomials', 'Trigonometry', 'Counting and statistics', 'Growth and decay', 'Introduction to differential calculus', 'Arithmetic and geometric sequences', 'The logarithmic function', 'Exponential functions'],
  },
  {
    id: 'maths_specialist_s1', name: 'Specialist Mathematics',
    yearGroups: ['stage1'],
    topics: ['Arithmetic and geometric sequences and series', 'Geometry', 'Vectors in the plane', 'Further trigonometry', 'Matrices', 'Real and complex numbers', 'Proof', 'Logic'],
  },
  {
    id: 'maths_general_s1', name: 'General Mathematics',
    yearGroups: ['stage1'],
    topics: ['Investing and borrowing', 'Measurement', 'Statistical investigation', 'Applications of trigonometry', 'Linear functions and graphs', 'Exponential functions and graphs', 'Matrices and networks', 'Financial decisions'],
  },
  {
    id: 'biology_s1', name: 'Biology',
    yearGroups: ['stage1'],
    topics: ['Cells and microorganisms', 'Multicellular organisms', 'Nervous and endocrine systems', 'Biodiversity and evolution', 'Ecosystem dynamics', 'DNA and inheritance', 'Reproduction', 'Adaptations'],
  },
  {
    id: 'physics_s1', name: 'Physics',
    yearGroups: ['stage1'],
    topics: ['Linear motion', 'Forces and Newton\'s laws', 'Energy and momentum', 'Electricity — circuits and charge', 'Magnetism and electromagnetic induction', 'Waves — mechanical and sound', 'Light and optics', 'Nuclear physics', 'Thermodynamics'],
  },
  {
    id: 'english_literary_s1', name: 'English Literary Studies',
    yearGroups: ['stage1'], isWriting: true,
    topics: ['Close reading and analysis', 'Essay writing — analytical', 'Essay writing — comparative', 'Narrative and authorial technique', 'Intertextuality', 'Themes and ideas', 'Character and context', 'Genre conventions', 'Creative writing — responding to texts'],
  },
  {
    id: 'english_s1', name: 'English',
    yearGroups: ['stage1'], isWriting: true,
    topics: ['Reading and responding to texts', 'Analytical essay writing', 'Creative and imaginative writing', 'Multimodal and media texts', 'Language features and techniques', 'Context and purpose', 'Argument and persuasion'],
  },
  {
    id: 'history_modern_s1', name: 'Modern History',
    yearGroups: ['stage1'],
    topics: ['The making of the modern world (1750–1918)', 'World War I', 'The Russian Revolution', 'The Interwar period', 'World War II', 'The Cold War', 'Decolonisation', 'Historical inquiry and source analysis'],
  },
  {
    id: 'geography_s1', name: 'Geography',
    yearGroups: ['stage1'],
    topics: ['Landscapes and landforms', 'Interconnections', 'Hazards and disasters', 'Population and urbanisation', 'Global resource use', 'Environmental sustainability', 'Geographical inquiry skills'],
  },
  {
    id: 'economics_s1', name: 'Economics',
    yearGroups: ['stage1'],
    topics: ['Microeconomics — supply and demand', 'Market structures', 'Macroeconomics — GDP and growth', 'Unemployment', 'Inflation', 'Government policy — fiscal', 'Government policy — monetary', 'International trade', 'Economic indicators'],
  },
  {
    id: 'business_s1', name: 'Business Studies',
    yearGroups: ['stage1'],
    topics: ['Business planning and structure', 'Marketing', 'Human resource management', 'Financial management', 'Operations', 'Business ethics and social responsibility', 'Legal obligations'],
  },
  // ── Stage 2 (Year 12) ──────────────────────────────────────────────────────
  {
    id: 'maths_specialist_s2', name: 'Specialist Mathematics',
    yearGroups: ['stage2'],
    topics: ['Mathematical induction', 'Complex numbers', 'Functions and sketching graphs', 'Vectors in three dimensions', 'Integration techniques and applications', 'Rates of change and differential equations', 'Statistical inference'],
  },
  {
    id: 'maths_general_s2', name: 'General Mathematics',
    yearGroups: ['stage2'],
    topics: ['Modelling with linear relationships', 'Modelling with matrices', 'Statistical models', 'Financial models', 'Discrete models — networks and graph theory', 'Bivariate data', 'Modelling with trigonometry'],
  },
  {
    id: 'biology_s2', name: 'Biology',
    yearGroups: ['stage2'],
    topics: ['DNA and proteins', 'Gene expression and regulation', 'Continuity of life — reproduction and inheritance', 'Humans and disease', 'Immune response', 'Managing ecosystem change', 'Biotechnology', 'Evolution and natural selection'],
  },
  {
    id: 'physics_s2', name: 'Physics',
    yearGroups: ['stage2'],
    topics: ['Motion and relativity', 'Electricity and magnetism', 'Light and matter', 'Thermal physics', 'Gravitational fields', 'Electric and magnetic fields', 'Quantum physics', 'Nuclear and particle physics'],
  },
  {
    id: 'english_literary_s2', name: 'English Literary Studies',
    yearGroups: ['stage2'], isWriting: true,
    topics: ['Close analysis of texts', 'Comparative essay writing', 'Creating literary texts', 'Intertextual connections', 'Authorial choices and techniques', 'Themes, values and context', 'Genre and form', 'Oral communication'],
  },
  {
    id: 'english_s2', name: 'English',
    yearGroups: ['stage2'], isWriting: true,
    topics: ['Responding to and analysing texts', 'Crafting analytical writing', 'Creating texts for audience and purpose', 'Multimodal texts', 'Oral presentation', 'Language and stylistic choices', 'Argument and rhetoric'],
  },
  {
    id: 'history_modern_s2', name: 'Modern History',
    yearGroups: ['stage2'],
    topics: ['Power and people (1750–1918)', 'The twentieth century world (1919–2000)', 'Historical significance and causation', 'Source analysis and evaluation', 'Historical essay writing', 'In-depth case study — Revolution or Conflict', 'Contemporary issues'],
  },
  {
    id: 'geography_s2', name: 'Geography',
    yearGroups: ['stage2'],
    topics: ['Geographies of human wellbeing', 'Geographies of interconnections', 'Environmental change and sustainability', 'Natural hazards and disasters', 'Global population dynamics', 'Geographical inquiry and research', 'Data analysis and spatial technology'],
  },
  {
    id: 'economics_s2', name: 'Economics',
    yearGroups: ['stage2'],
    topics: ['Markets and pricing', 'Competition and market failure', 'Macroeconomic performance', 'Economic policies and their effects', 'Global economy and trade', 'Distribution of income and wealth', 'Evaluating economic outcomes', 'Extended research and analysis'],
  },
  {
    id: 'business_s2', name: 'Business Studies',
    yearGroups: ['stage2'],
    topics: ['Strategic management', 'Marketing strategy', 'Financial analysis and planning', 'Human resource strategy', 'Operations and supply chain', 'Stakeholders and corporate governance', 'Innovation and entrepreneurship'],
  },
]

export function getSubjectsForYearLevel(yearLevel, subjectList = ALL_DIAGNOSTIC_SUBJECTS) {
  if (!yearLevel) return []
  const lower = yearLevel.toLowerCase()
  if (lower.includes('stage 2') || lower.includes('year 12')) return subjectList.filter(s => s.yearGroups.includes('stage2'))
  if (lower.includes('stage 1') || lower.includes('year 11')) return subjectList.filter(s => s.yearGroups.includes('stage1'))
  if (['year 7', 'year 8', 'year 9', 'year 10'].some(y => lower.includes(y))) return subjectList.filter(s => s.yearGroups.includes('junior'))
  return subjectList.filter(s => s.yearGroups.includes('primary'))
}
