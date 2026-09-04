import { useEffect, useState } from "react";

const getMatches = (query: string) =>
  typeof window !== "undefined" && window.matchMedia(query).matches;

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => getMatches(query));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}
