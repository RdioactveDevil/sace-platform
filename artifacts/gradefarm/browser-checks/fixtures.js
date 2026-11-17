// Questions for the browser checks: the cases a printed paper has to get
// right. source_question is set to each question's place, so a built exam
// and the preview number them the same.
const FIG = '/browser-checks/exam-papers/figure.png'
const base = { source: 'Fixture 2024 Trial Exam', source_kind: 'commercial', source_publisher: 'Fixture', source_year: 2024, source_paper: 'Exam' }

export const A = [
  { ...base, id: 'a1', exam_section: 'A', question_type: 'mcq', source_question: '1', question: 'The percentage error in the result obtained, expressed to the correct number of significant figures, is', options: ['0.26', '0.2648', '0.2654', '0.27'], answer_index: 0 },
  { ...base, id: 'a2', exam_section: 'A', question_type: 'mcq', source_question: '2', question: 'The energy profile below represents a reaction.\nWhich statement is correct?', image_url: FIG, options: ['It is exothermic.', 'It is endothermic.', 'It has no activation energy.', '$\\Delta H = 0$'], answer_index: 0 },
  { ...base, id: 'a3', exam_section: 'A', question_type: 'mcq', source_question: '3', question: 'Consider $\\ce{Ru(s) + Cl^- (aq) + NO3^- (aq) + x H^+ (aq) -> RuCl6^3- (aq) + NO2 (g) + y H2O (l)}$. The values of $x$ and $y$ are', options: ['$x = 3; y = 3$', '$x = 6; y = 3$', '$x = 3; y = 6$', '$x = 6; y = 6$'], answer_index: 1 },
]

export const B = [
  { ...base, id: 'b1', exam_section: 'B', question_type: 'extended', source_question: '1', question: 'Methanol is a very useful fuel. The energy profile diagram below represents the uncatalysed reaction.', image_url: FIG, parts: [
    { label: 'a', level: 1, text: 'On the energy profile diagram above, sketch how the catalyst would alter the reaction pathway.', marks: 1 },
    { label: 'b', level: 1, text: '', marks: 0 },
    { label: 'i', level: 2, text: 'How does the reaction temperature affect the yield of methanol? In your answer, refer to Le Chatelier’s principle.', marks: 2 },
    { label: 'ii', level: 2, text: 'How does the reaction pressure affect the yield of methanol?', marks: 2 },
    { label: 'c', level: 1, text: 'Write the expression for the equilibrium constant, $K_c$, for this reaction.', marks: 1 },
  ] },
  { ...base, id: 'b2', exam_section: 'B', question_type: 'extended', source_question: '2', question: 'The table below lists the viscosity of three organic compounds.\n\n| compound | viscosity (cP) |\n|---|---|\n| ethanoic acid | 1.06 |\n| octane | 0.74 |\n| octanoic acid | 4.11 |\n\nExplain the differences in viscosity of these three compounds.', parts: [{ label: '', level: 1, text: '', marks: 5 }] },
  { ...base, id: 'b3', exam_section: 'B', question_type: 'extended', source_question: '3', question: 'A student carried out an electrolysis.', parts: [
    { label: 'a', level: 1, text: 'Draw a labelled diagram of the electrolytic cell the teacher could set up.', marks: 3 },
    { label: 'b', level: 1, text: 'The power supply runs at 8.5 A for exactly 30.0 minutes. Calculate the mass of copper deposited.', marks: 4, image_url: FIG },
  ] },
]
