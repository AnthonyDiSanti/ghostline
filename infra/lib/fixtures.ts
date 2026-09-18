import { readFileSync } from 'node:fs';

export function renderFixture(path: URL, values: Record<string, string> = {}): string {
  // Replace explicit slots once; shell variables and replacement text must never be evaluated recursively.
  const used = new Set<string>();
  const rendered = readFileSync(path, 'utf8').replace(/@@([A-Z][A-Z0-9_]*)@@/g, (_, name: string) => {
    if (!Object.hasOwn(values, name)) throw new Error(`Missing fixture value: ${name}`);
    used.add(name);
    return values[name]!;
  });
  if (Object.keys(values).some(name => !used.has(name))) throw new Error('Unused fixture values.');
  return rendered;
}
