"""Build the per-state school lists onboarding's school picker uses.

Source: ACARA, School Location 2025 (every Australian school, all sectors),
from https://www.acara.edu.au/contact-us/acara-data-access
("School Location 2025", an .xlsx). Download it, then:

    python3 scripts/build-school-list.py "School Location 2025.xlsx"

It writes artifacts/gradefarm/public/schools/<STATE>.json, one per state:
{ "source": ..., "schools": [[name, suburb, type], ...] } sorted by name,
where type is P (primary), S (secondary) or C (combined). A school with
several campuses is listed once per suburb. Needs openpyxl.
"""
import json
import os
import sys
from collections import defaultdict

import openpyxl

OUT = os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'gradefarm', 'public', 'schools')
TYPES = {'Primary': 'P', 'Secondary': 'S', 'Combined': 'C'}


def main(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = next(w for w in wb.worksheets if w.title.startswith('SchoolLocations'))
    year = ws.title.split()[-1]
    rows = ws.iter_rows(values_only=True)
    head = next(rows)
    col = {h: i for i, h in enumerate(head)}
    by_state = defaultdict(dict)
    for r in rows:
        name, suburb, state = r[col['School Name']], r[col['Suburb']], r[col['State']]
        if not name or not state:
            continue
        name, suburb = ' '.join(str(name).split()), ' '.join(str(suburb or '').split())
        kind = TYPES.get(r[col['School Type']], 'C')
        by_state[state][(name.lower(), suburb.lower())] = [name, suburb, kind]
    os.makedirs(OUT, exist_ok=True)
    for state, schools in sorted(by_state.items()):
        listed = sorted(schools.values(), key=lambda s: (s[0].lower(), s[1].lower()))
        with open(os.path.join(OUT, f'{state}.json'), 'w', encoding='utf-8') as f:
            json.dump({'source': f'ACARA, School Location {year}', 'schools': listed}, f, ensure_ascii=False, separators=(',', ':'))
        print(state, len(listed))


if __name__ == '__main__':
    main(sys.argv[1])
