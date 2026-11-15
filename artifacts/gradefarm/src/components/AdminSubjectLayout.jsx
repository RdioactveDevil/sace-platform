import { useEffect, useRef, useState } from 'react'
import {
  LayoutDashboard, ListTree, ListChecks, PenLine, Link2, CirclePlus, FileStack, Library, Target,
  Inbox, Flag, ToggleRight, ScrollText, Settings2, ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight,
} from 'lucide-react'
import { FONT_B } from '../lib/adminUi'

/**
 * Everything about one subject lives in its own menu, in groups that fold
 * away. Each item is a page at /admin/subjects/<id>/<page>. Pages that
 * aren't built yet are left out by AdminCurriculumDetail (`available`).
 */
export const SUBJECT_MENU = [
  { id: 'start', items: [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  ]},
  { id: 'content', label: 'Content', items: [
    { id: 'topics', label: 'Topics', icon: ListTree },
    { id: 'questions', label: 'Questions', icon: ListChecks },
    { id: 'written', label: 'Written answers', icon: PenLine },
    { id: 'borrowed', label: 'Borrowed questions', icon: Link2 },
    { id: 'add', label: 'Add questions', icon: CirclePlus },
  ]},
  { id: 'sources', label: 'Sources', items: [
    { id: 'papers', label: 'Exam papers', icon: FileStack },
    { id: 'resources', label: 'Textbooks & resources', icon: Library },
    { id: 'scope', label: 'Course scope', icon: Target },
  ]},
  { id: 'quality', label: 'Quality', items: [
    { id: 'review', label: 'Review queue', icon: Inbox },
    { id: 'reports', label: 'Reports', icon: Flag },
  ]},
  { id: 'settings', label: 'Settings', items: [
    { id: 'features', label: 'Student features', icon: ToggleRight },
    { id: 'exam', label: 'About the exam', icon: ScrollText },
    { id: 'details', label: 'Name and level', icon: Settings2 },
  ]},
]

const MENU_KEY = 'gf-admin-subject-menu'
const GROUPS_KEY = 'gf-admin-subject-groups'
const read = (key, fallback) => { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v) } catch { return fallback } }
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* private mode */ } }

function useNarrow() {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < 860)
  useEffect(() => {
    const h = () => setNarrow(window.innerWidth < 860)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return narrow
}

/**
 * The subject's header, menu and page. `counts` maps an item id to
 * { text, alert }: shown beside the item (alert: a red badge).
 */
export default function AdminSubjectLayout({ section, onSection, available, counts = {}, header, children }) {
  const narrow = useNarrow()
  const pillsRef = useRef(null)
  // Phones: bring the open page's pill into view in the sideways row.
  useEffect(() => {
    if (narrow) pillsRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [narrow, section])
  const [collapsed, setCollapsed] = useState(() => read(MENU_KEY, false) === true)
  const [closedGroups, setClosedGroups] = useState(() => new Set(read(GROUPS_KEY, [])))
  const groups = SUBJECT_MENU
    .map(g => ({ ...g, items: g.items.filter(i => available.has(i.id)) }))
    .filter(g => g.items.length)

  const toggleMenu = () => setCollapsed(c => { write(MENU_KEY, !c); return !c })
  const toggleGroup = (id) => setClosedGroups(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    write(GROUPS_KEY, [...next])
    return next
  })

  const itemButton = (item, { iconOnly = false, pill = false } = {}) => {
    const on = section === item.id
    const count = counts[item.id]
    const Icon = item.icon
    return (
      <button key={item.id} type="button" onClick={() => onSection(item.id)} aria-current={on ? 'page' : undefined}
        title={iconOnly ? item.label : undefined} aria-label={iconOnly ? item.label : undefined}
        className="gf-subj-item"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', gap: 9, width: pill ? 'auto' : '100%', flexShrink: 0,
          justifyContent: iconOnly ? 'center' : 'flex-start',
          padding: iconOnly ? '9px 0' : pill ? '7px 12px' : '8px 9px', borderRadius: pill ? 999 : 8,
          border: pill ? `1px solid ${on ? 'var(--t-text)' : 'var(--t-border)'}` : 'none',
          background: on ? 'var(--t-text)' : 'transparent', color: on ? 'var(--t-bg)' : 'var(--t-textSub)',
          fontFamily: FONT_B, fontSize: 13.5, fontWeight: on ? 700 : 500, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
        }}>
        <Icon size={16} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0, opacity: on ? 1 : 0.8 }} />
        {!iconOnly && <span style={{ flex: pill ? 'none' : 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.label}</span>}
        {count && (count.alert
          ? <span style={iconOnly
              ? { position: 'absolute', top: 3, right: 6, minWidth: 8, height: 8, borderRadius: 99, background: 'var(--t-danger)' }
              : { fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--t-danger)', borderRadius: 99, padding: '1px 7px' }}>
              {iconOnly ? '' : count.text}
            </span>
          : !iconOnly && count.text != null && <span style={{ fontSize: 12, fontWeight: 600, color: on ? 'var(--t-bg)' : 'var(--t-textMuted)', opacity: on ? 0.75 : 1 }}>{count.text}</span>)}
      </button>
    )
  }

  // Phones: the menu is a row of pills that scrolls sideways.
  const menu = narrow ? (
    <nav ref={pillsRef} aria-label="Subject" className="gf-tabs" style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
      {groups.flatMap(g => g.items).map(i => itemButton(i, { pill: true }))}
    </nav>
  ) : (
    <nav aria-label="Subject" style={{
      width: collapsed ? 56 : 232, flexShrink: 0, alignSelf: 'flex-start', position: 'sticky', top: 0,
      background: 'var(--t-bgCard)', border: '1px solid var(--t-border)', borderRadius: 12, padding: collapsed ? '8px 6px' : '8px',
      display: 'flex', flexDirection: 'column', gap: 1, boxSizing: 'border-box', transition: 'width 0.15s ease',
    }}>
      {groups.map(g => {
        const closed = closedGroups.has(g.id) && !g.items.some(i => i.id === section)
        return (
          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {g.label && (collapsed
              ? <div aria-hidden="true" style={{ height: 1, background: 'var(--t-border)', margin: '6px 4px' }} />
              : (
                <button type="button" onClick={() => toggleGroup(g.id)} aria-expanded={!closed}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 8px 4px', border: 'none', background: 'none', cursor: 'pointer', fontFamily: FONT_B, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--t-textFaint)' }}>
                  {g.label}
                  {closed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
                </button>
              ))}
            {(collapsed || !closed) && g.items.map(i => itemButton(i, { iconOnly: collapsed }))}
          </div>
        )
      })}
      <button type="button" onClick={toggleMenu} aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
        style={{ marginTop: 8, border: 'none', borderTop: '1px solid var(--t-border)', background: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start', gap: 6, padding: '10px 9px 4px', fontFamily: FONT_B, fontSize: 12.5, color: 'var(--t-textMuted)' }}>
        {collapsed ? <ChevronsRight size={15} aria-hidden="true" /> : <><ChevronsLeft size={15} aria-hidden="true" /> Collapse menu</>}
      </button>
    </nav>
  )

  return (
    <div style={{ fontFamily: FONT_B, color: 'var(--t-textSub)', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <style>{`.gf-subj-item:hover:not([aria-current]) { background: var(--t-bgHover) !important; } .gf-subj-item:focus-visible { outline: 2px solid var(--t-accent); outline-offset: 1px; }`}</style>
      {header}
      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', gap: narrow ? 12 : 20, alignItems: narrow ? 'stretch' : 'flex-start' }}>
        {menu}
        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  )
}
