export function IconChemistry({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M9 3h6" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M10 3v6.5L6.5 15a5.5 5.5 0 0011 0L14 9.5V3" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="10" cy="15.5" r="1" fill={color}/>
      <circle cx="13.5" cy="13.5" r="0.8" fill={color}/>
      <circle cx="11" cy="17.5" r="0.6" fill={color}/>
    </svg>
  )
}

export function IconBiology({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M12 3c-3.5 2.5-4.5 5.5-3.5 8.5S12 17 12 21" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M12 3c3.5 2.5 4.5 5.5 3.5 8.5S12 17 12 21" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <line x1="8.8" y1="7.8" x2="15.2" y2="7.8" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8.2" y1="12" x2="15.8" y2="12" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8.8" y1="16.2" x2="15.2" y2="16.2" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconPhysics({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke={color} strokeWidth="1.5"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke={color} strokeWidth="1.5" transform="rotate(60 12 12)"/>
      <ellipse cx="12" cy="12" rx="9" ry="3.5" stroke={color} strokeWidth="1.5" transform="rotate(120 12 12)"/>
      <circle cx="12" cy="12" r="2" fill={color}/>
    </svg>
  )
}

export function IconMaths({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M7 5c-.6 3.5.2 6-.6 9.5C5.6 18 5 19 5 19" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M7 5c2 0 4 .6 5.5 2.3" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M6.5 11.5c1.8 0 3.5-.5 5-1.3" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
      <path d="M14.5 8.5l5 7M14.5 15.5l5-7" stroke={color} strokeWidth="1.6" strokeLinecap="round"/>
    </svg>
  )
}

export function IconEnglish({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M4 19.5A2.5 2.5 0 016.5 17H20" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" stroke={color} strokeWidth="1.5" strokeLinejoin="round"/>
      <line x1="8" y1="7" x2="16" y2="7" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8" y1="11" x2="16" y2="11" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
      <line x1="8" y1="15" x2="13" y2="15" stroke={color} strokeWidth="1.3" strokeLinecap="round"/>
    </svg>
  )
}

export function IconQuant({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <polyline points="3,20 7,12 11,16 15,10 19,20" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="3" y1="20" x2="21" y2="20" stroke={color} strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  )
}

export function IconCurriculum({ color, size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth="1.5"/>
      <rect x="13" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth="1.5"/>
      <rect x="3" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth="1.5"/>
      <rect x="13" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth="1.5"/>
    </svg>
  )
}

const ICON_MAP = {
  chemistry_s1:     IconChemistry,
  chemistry_s2:     IconChemistry,
  biology_s1:       IconBiology,
  biology_s2:       IconBiology,
  physics_s1:       IconPhysics,
  physics_s2:       IconPhysics,
  maths_y7:         IconMaths,
  maths_y10:        IconMaths,
  maths_methods_s2: IconMaths,
  english_y7:       IconEnglish,
  quant_y10:        IconQuant,
}

export function SubjectIcon({ subj, color, size = 32 }) {
  const Icon = ICON_MAP[subj?.id] ?? IconCurriculum
  return <Icon color={color} size={size} />
}
