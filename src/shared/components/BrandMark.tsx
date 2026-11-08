/** The Opaline app icon. Markup stays a single element with one inner span so
 * the `.brand-mark` recipe in App.css applies at every size. */
export function BrandMark({
  className = "",
  label = "Opaline",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={("brand-mark " + className).trim()}
      role="img"
      aria-label={label}
    >
      <span />
    </div>
  );
}
