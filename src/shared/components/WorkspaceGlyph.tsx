/** A stable, local identity for each workspace; no generated imagery or network. */
export function WorkspaceGlyph({ name }: { name: string }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "W";
  let hash = 0;
  for (const character of name)
    hash = (hash * 31 + character.codePointAt(0)!) | 0;
  return (
    <span
      aria-hidden="true"
      className={`workspace-glyph tone-${Math.abs(hash) % 4}`}
    >
      {initial}
    </span>
  );
}
