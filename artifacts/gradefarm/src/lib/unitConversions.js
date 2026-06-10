// Unit-converter data for the in-quiz tool. Each non-temperature category maps
// units to a multiplier relative to the category's base unit. Temperature is
// handled separately because the conversions are affine, not linear.

export const UNIT_CATEGORIES = {
  Length: {
    base: 'm',
    units: {
      'km': 1000, 'm': 1, 'cm': 0.01, 'mm': 0.001, 'µm': 1e-6, 'nm': 1e-9,
      'mile': 1609.344, 'yard': 0.9144, 'ft': 0.3048, 'inch': 0.0254,
    },
  },
  Mass: {
    base: 'g',
    units: {
      'tonne': 1e6, 'kg': 1000, 'g': 1, 'mg': 0.001, 'µg': 1e-6,
      'lb': 453.592, 'oz': 28.3495,
    },
  },
  Volume: {
    base: 'L',
    units: {
      'kL': 1000, 'L': 1, 'mL': 0.001, 'cm³': 0.001, 'm³': 1000,
      'gallon (US)': 3.78541, 'pint (US)': 0.473176,
    },
  },
  Energy: {
    base: 'J',
    units: {
      'kJ': 1000, 'J': 1, 'cal': 4.184, 'kcal': 4184, 'kWh': 3.6e6, 'eV': 1.602e-19,
    },
  },
  Pressure: {
    base: 'Pa',
    units: {
      'atm': 101325, 'bar': 1e5, 'kPa': 1000, 'Pa': 1, 'mmHg': 133.322, 'psi': 6894.76,
    },
  },
  Temperature: {
    base: '°C',
    units: { '°C': null, '°F': null, 'K': null }, // handled by convertTemperature
  },
}

export function convertTemperature(value, from, to) {
  // Normalise to Celsius first.
  let c
  if (from === '°C') c = value
  else if (from === '°F') c = (value - 32) * 5 / 9
  else if (from === 'K') c = value - 273.15
  else c = value

  if (to === '°C') return c
  if (to === '°F') return c * 9 / 5 + 32
  if (to === 'K') return c + 273.15
  return c
}

export function convert(category, value, from, to) {
  if (category === 'Temperature') return convertTemperature(value, from, to)
  const cat = UNIT_CATEGORIES[category]
  if (!cat) return value
  const fromFactor = cat.units[from]
  const toFactor = cat.units[to]
  if (!fromFactor || !toFactor) return value
  return (value * fromFactor) / toFactor
}
