// Reference data for the in-quiz "Data Sheet" tool — physical constants and
// commonly-needed formulas, grouped into tabs. Values follow the SACE Stage 1/2
// Chemistry & Mathematics reference booklets. `value` strings may contain LaTeX
// ($...$) and are rendered through MathText.

export const CONSTANTS = [
  { sym: '$N_A$',        name: 'Avogadro constant',        value: '$6.022 \\times 10^{23}\\ \\text{mol}^{-1}$' },
  { sym: '$R$',          name: 'Gas constant',             value: '$8.314\\ \\text{J mol}^{-1}\\text{K}^{-1}$' },
  { sym: '$V_m$',        name: 'Molar volume of gas (STP)',value: '$22.71\\ \\text{L mol}^{-1}$ (0 °C, 100 kPa)' },
  { sym: '$V_m$',        name: 'Molar volume of gas (SLC)',value: '$24.79\\ \\text{L mol}^{-1}$ (25 °C, 100 kPa)' },
  { sym: '$F$',          name: 'Faraday constant',         value: '$96\\,485\\ \\text{C mol}^{-1}$' },
  { sym: '$K_w$',        name: 'Ionic product of water',   value: '$1.0 \\times 10^{-14}$ (25 °C)' },
  { sym: '$c$',          name: 'Speed of light',           value: '$2.998 \\times 10^{8}\\ \\text{m s}^{-1}$' },
  { sym: '$g$',          name: 'Acceleration due to gravity', value: '$9.81\\ \\text{m s}^{-2}$' },
  { sym: '$e$',          name: 'Elementary charge',        value: '$1.602 \\times 10^{-19}\\ \\text{C}$' },
  { sym: '',             name: 'Specific heat of water',   value: '$4.18\\ \\text{J g}^{-1}\\text{°C}^{-1}$' },
  { sym: '',             name: 'Density of water',         value: '$1.00\\ \\text{g mL}^{-1}$ (25 °C)' },
]

export const FORMULAS = {
  Chemistry: [
    { name: 'Moles from mass',          value: '$n = \\dfrac{m}{M}$' },
    { name: 'Moles in solution',        value: '$n = c \\, V$' },
    { name: 'Moles of gas',             value: '$n = \\dfrac{V}{V_m}$' },
    { name: 'Ideal gas law',            value: '$pV = nRT$' },
    { name: 'Concentration',            value: '$c = \\dfrac{n}{V}$' },
    { name: 'pH',                       value: '$\\text{pH} = -\\log_{10}[\\text{H}^+]$' },
    { name: 'pOH',                      value: '$\\text{pOH} = -\\log_{10}[\\text{OH}^-]$' },
    { name: 'Water equilibrium',        value: '$K_w = [\\text{H}^+][\\text{OH}^-]$' },
    { name: 'Heat energy',              value: '$q = m c \\, \\Delta T$' },
    { name: 'Percentage yield',         value: '$\\%\\text{ yield} = \\dfrac{\\text{actual}}{\\text{theoretical}} \\times 100$' },
    { name: 'Dilution',                 value: '$c_1 V_1 = c_2 V_2$' },
  ],
  Mathematics: [
    { name: 'Quadratic formula',        value: '$x = \\dfrac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$' },
    { name: 'Distance',                 value: '$d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$' },
    { name: 'Gradient',                 value: '$m = \\dfrac{y_2 - y_1}{x_2 - x_1}$' },
    { name: 'Sine rule',                value: '$\\dfrac{a}{\\sin A} = \\dfrac{b}{\\sin B} = \\dfrac{c}{\\sin C}$' },
    { name: 'Cosine rule',              value: '$c^2 = a^2 + b^2 - 2ab\\cos C$' },
    { name: 'Area of triangle',         value: '$A = \\tfrac{1}{2}ab\\sin C$' },
    { name: 'Compound interest',        value: '$A = P\\left(1 + \\dfrac{r}{100}\\right)^n$' },
    { name: 'Derivative of power',      value: '$\\dfrac{d}{dx}\\,x^n = n x^{n-1}$' },
    { name: 'Definite integral',        value: '$\\int_a^b f(x)\\,dx = F(b) - F(a)$' },
    { name: 'Binomial probability',     value: '$P(X=k) = \\binom{n}{k} p^k (1-p)^{n-k}$' },
  ],
  Physics: [
    { name: 'Velocity',                 value: '$v = \\dfrac{\\Delta s}{\\Delta t}$' },
    { name: 'Acceleration',             value: '$a = \\dfrac{\\Delta v}{\\Delta t}$' },
    { name: 'Newton’s second law', value: '$F = ma$' },
    { name: 'Kinetic energy',           value: '$E_k = \\tfrac{1}{2}mv^2$' },
    { name: 'Gravitational PE',         value: '$E_p = mgh$' },
    { name: 'Momentum',                 value: '$p = mv$' },
    { name: 'Work',                     value: '$W = Fs\\cos\\theta$' },
    { name: 'Power',                    value: '$P = \\dfrac{W}{t}$' },
    { name: 'Ohm’s law',           value: '$V = IR$' },
    { name: 'Wave equation',            value: '$v = f\\lambda$' },
  ],
}
