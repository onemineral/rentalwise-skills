#!/usr/bin/env python3
"""Browse the RentalWise API schema that `POST settings/fetch` returns.

The schema is the authoritative, always-current description of every endpoint: for each
resource its actions, each action's arguments (type, required, nullable, default, picklist
values) and the fields of the records it returns. Use it instead of guessing parameters.

Usage (needs RENTALWISE_BASE_URL and RENTALWISE_API_TOKEN in the environment):

  schema.py resources                      # every resource with its action count
  schema.py actions property               # actions of one resource + response type
  schema.py args property/get-quote        # arguments of one endpoint
  schema.py fields property                # response fields of a resource (type, relation)
  schema.py find coupon                    # search resource/action/arg/field names
  schema.py status                         # where the cache is, how old, how many resources
  schema.py --refresh ...                  # re-download instead of using the cache

Download once, then work from the file: the first run (or --refresh) calls settings/fetch and
saves only its `schema` key (about 2 MB) as .rentalwise-schema.json at the project root (the
nearest ancestor of the current directory with .git, package.json or composer.json; override
with RENTALWISE_SCHEMA_CACHE). Every later command reads that file, needs no token and finds it
from any subdirectory. Refresh after a PMS upgrade, not per question. Add the file to .gitignore.

The schema is computed for the token that downloads it: resources, actions, arguments, fields
and relations the API key's role may not use are left out, and the API drops, refuses or omits
them at request time (rentalwise-api-auth SKILL.md section 4). So a field this script does not
list is one this token cannot use. Download the cache with the project's own token, and refresh
it after the customer changes the key's role.
"""
import json
import os
import sys
import time
import urllib.request

CACHE_NAME = '.rentalwise-schema.json'
ROOT_MARKERS = ('.git', 'package.json', 'composer.json')


def cache_path(for_write=False):
    """Explicit env path; else the first existing cache walking up from cwd; else the project root."""
    explicit = os.environ.get('RENTALWISE_SCHEMA_CACHE')
    if explicit:
        return explicit
    here = os.path.abspath(os.getcwd())
    root = None
    d = here
    while True:
        if os.path.exists(os.path.join(d, CACHE_NAME)):
            return os.path.join(d, CACHE_NAME)
        if root is None and any(os.path.exists(os.path.join(d, m)) for m in ROOT_MARKERS):
            root = d
        parent = os.path.dirname(d)
        if parent == d:
            break
        d = parent
    return os.path.join(root or here, CACHE_NAME)


def fetch_schema():
    base = os.environ.get('RENTALWISE_BASE_URL', '').rstrip('/') + '/'
    token = os.environ.get('RENTALWISE_API_TOKEN', '')
    if base == '/' or not token:
        sys.exit('set RENTALWISE_BASE_URL and RENTALWISE_API_TOKEN (only needed to download the schema once)')
    req = urllib.request.Request(
        base + 'settings/fetch', data=b'{}', method='POST',
        headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Accept': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        body = json.load(r)
    schema = body.get('schema')
    if not isinstance(schema, dict):
        sys.exit('settings/fetch returned no schema (does this token have API access?)')
    path = cache_path(for_write=True)
    with open(path, 'w') as f:
        json.dump(schema, f)
    print(f'schema cached at {path} ({len(schema)} resources); later runs read this file, add it to .gitignore', file=sys.stderr)
    return schema


def load_schema(refresh):
    path = cache_path()
    if not refresh and os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return fetch_schema()


def as_list(fields):
    """`fields` is a dict (name -> def) on resources and a list on composed args."""
    if isinstance(fields, dict):
        return [(k, v) for k, v in fields.items() if isinstance(v, dict)]
    return [(f.get('name'), f) for f in (fields or []) if isinstance(f, dict)]


def type_of(f):
    if not isinstance(f, dict):
        return str(f)
    t = f.get('type', '?')
    if t == 'picklist':
        pv = f.get('possible_values')
        if isinstance(pv, dict):
            t = 'picklist[' + '|'.join(list(pv)[:20]) + ']'
        if f.get('multivalue'):
            t += '[]'
    elif t in ('belongs-to', 'has-many', 'has-one', 'belongs-to-many', 'morph-to'):
        t = f'{t} -> {f.get("relates_to")}'
    elif t == 'list-of':
        inner = (f.get('options') or {}).get('field') if isinstance(f.get('options'), dict) else None
        t = 'list of ' + (type_of(inner) if inner else '?')
    elif t == 'composed':
        names = [n for n, _ in as_list(f.get('fields'))]
        t = 'object{' + ', '.join(names[:8]) + (', ...' if len(names) > 8 else '') + '}'
    return t


def flags(f):
    out = []
    if f.get('is_required'):
        out.append('required')
    if f.get('is_nullable'):
        out.append('nullable')
    if f.get('default_value') not in (None, '', []):
        out.append('default=' + json.dumps(f['default_value']))
    return ', '.join(out)


def table(rows, header):
    widths = [max(len(str(r[i])) for r in rows + [header]) for i in range(len(header))]
    line = lambda r: '  '.join(str(r[i]).ljust(widths[i]) for i in range(len(header)))
    print(line(header))
    print('  '.join('-' * w for w in widths))
    for r in rows:
        print(line(r))


def cmd_resources(s, _):
    table([(name, len(r.get('actions') or {}), len(as_list(r.get('fields')))) for name, r in sorted(s.items())],
          ('resource', 'actions', 'fields'))


def cmd_actions(s, arg):
    r = s.get(arg) or sys.exit(f'unknown resource {arg!r}')
    table([(f'POST {arg}/{a}', act.get('response_type') or '', len(act.get('args') or {}))
           for a, act in (r.get('actions') or {}).items()], ('endpoint', 'returns', 'args'))


def cmd_args(s, arg):
    res, _, action = arg.partition('/')
    act = ((s.get(res) or {}).get('actions') or {}).get(action) or sys.exit(f'unknown endpoint {arg!r}')
    print(f'POST {res}/{action}  ->  {act.get("response_type")}\n')
    rows = []
    for n, f in (act.get('args') or {}).items():
        rows.append((n, type_of(f), flags(f), f.get('label', '')))
        if f.get('type') == 'composed':
            for sn, sf in as_list(f.get('fields')):
                rows.append((f'  {n}.{sn}', type_of(sf), flags(sf), sf.get('label', '')))
        elif f.get('type') == 'list-of':
            inner = (f.get('options') or {}).get('field') if isinstance(f.get('options'), dict) else None
            if isinstance(inner, dict) and inner.get('type') == 'composed':
                for sn, sf in as_list(inner.get('fields')):
                    rows.append((f'  {n}[].{sn}', type_of(sf), flags(sf), sf.get('label', '')))
    table(rows, ('argument', 'type', 'flags', 'label'))


def cmd_fields(s, arg):
    r = s.get(arg) or sys.exit(f'unknown resource {arg!r}')
    table([(n, type_of(f), flags(f), f.get('label', '')) for n, f in as_list(r.get('fields'))],
          ('field', 'type', 'flags', 'label'))


def cmd_status(s, _):
    path = cache_path()
    if os.path.exists(path):
        age_h = (time.time() - os.path.getmtime(path)) / 3600
        print(f'cache: {path}\nage: {age_h:.1f} h\nresources: {len(s)}\nrefresh with: schema.py --refresh resources (after a PMS upgrade)')
    else:
        print(f'no cache yet; the next command downloads the schema to {path}')


def cmd_find(s, arg):
    q = arg.lower()
    hits = []
    for res, r in s.items():
        if q in res:
            hits.append(('resource', res))
        for a, act in (r.get('actions') or {}).items():
            if q in a:
                hits.append(('endpoint', f'{res}/{a}'))
            for n in (act.get('args') or {}):
                if q in n:
                    hits.append(('argument', f'{res}/{a} {n}'))
        for n, _ in as_list(r.get('fields')):
            if q in (n or ''):
                hits.append(('field', f'{res}.{n}'))
    table(hits or [('(nothing)', '')], ('kind', 'match'))


COMMANDS = {'resources': cmd_resources, 'actions': cmd_actions, 'args': cmd_args, 'fields': cmd_fields, 'find': cmd_find, 'status': cmd_status}

if __name__ == '__main__':
    argv = [a for a in sys.argv[1:] if a != '--refresh']
    refresh = '--refresh' in sys.argv
    if not argv or argv[0] not in COMMANDS or (argv[0] not in ('resources', 'status') and len(argv) < 2):
        sys.exit(__doc__)
    COMMANDS[argv[0]](load_schema(refresh), argv[1] if len(argv) > 1 else None)
