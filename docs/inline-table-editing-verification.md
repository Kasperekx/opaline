# Edycja komórek — wdrożenie i weryfikacja

2026-09-05 · Zrealizowany wariant A zatwierdzonego planu.

## Zachowanie

- Usunięta stała kolumna ołówka/kosza. Dwuklik/F2 otwiera jedną komórkę; Enter
  zamyka edytor i zatwierdza szkic lokalnie. Dopiero Save changes / Cmd/Ctrl+S
  zapisuje aktywną tabelę.
- Bursztynowe oznaczenie komórki i karty, kompaktowy pasek zmian nad paginacją,
  podgląd Original / Pending oraz opcjonalne Database now. Odczyt porównawczy
  nie zmienia oryginalnej wersji rekordu i nie rozwiązuje konfliktów automatycznie.
- Escape cofa tylko aktualną edycję, Tab przechodzi między polami, menu komórki
  oferuje cofnięcie zmiany, NULL, inspekcję i oznaczenie/cofnięcie usunięcia.
- Nowe wiersze, edycja wielu pól/rekordów i dotychczasowe masowe ustawianie
  wartości korzystają z jednego bufora. Usunięcia wymagają potwierdzenia przed zapisem.
- JSON/długi tekst ma edytor przy komórce; Enter dodaje linię. Wartości liczbowe
  pozostają tekstem w przesyłanym żądaniu, bez zaokrąglania przez JS Number.
- Zachowanie szkiców między kartami/sesjami, ochrona odświeżenia, filtrów,
  sortowania, paginacji i zamknięcia; nieudany zapis blokuje kontynuację nawigacji.
- Krótki status udanego zapisu bez toastu. Błąd późniejszego odczytu nie przywraca
  już zapisanej operacji do bufora i nie ponawia zapisu.

## Podział odpowiedzialności

`table-change-set.ts` zawiera czyste operacje bufora i walidację; `useTableChanges`
zarządza szkicami i zapisem, a `useTableData` odczytem/nawigacją. Edytor komórki,
menu, nagłówek, paginacja, pasek i przegląd zmian są osobnymi komponentami.
`WorkSafety` jest wspólną ochroną niezapisanej pracy, także przy Save and continue.

Rust udostępnia `apply_table_changes`: jedna transakcja, oryginalny PK i `xmin`,
parametryzacja wartości, istniejące ograniczenia metadanych i backendowe read-only.
Limity: 500 zmian wierszy, 8 MiB wartości wejściowych/odpowiedzi, 30 s operacji,
25 s pojedynczego polecenia i 5 s oczekiwania na blokadę. W razie porzucenia
transakcji transport jest zamykany, a osobne żądanie anulowania zachowuje TLS/CA
sesji. Zerwanie transportu podczas COMMIT ma osobny, niepewny wynik i blokadę
ślepego ponowienia. `load_table_row` służy wyłącznie do odczytu porównawczego.

Skill `frontend-design` wpłynął na zachowanie obecnej stylistyki, stałą wysokość
wiersza, kompaktowy pasek, stany inne niż sam kolor i zawijanie akcji w małej
szerokości. Podgląd sprawdzono przez `browser:control-in-app-browser`.

## Wykonane kontrole

- `npm run check`: typecheck, ESLint, Prettier, **86 testów Vitest** i build Vite — PASS.
- `cargo clippy --all-targets -- -D warnings` — PASS.
- `cargo test --lib`: **31 testów**, 17 integracyjnych pominiętych w standardowym przebiegu — PASS.
- `cargo test --lib database::table_changes -- --include-ignored`: **7 testów** — PASS,
  w tym wspólny commit INSERT/UPDATE/DELETE, rollback całego zestawu po konflikcie
  i naruszeniu UNIQUE, błąd deferred constraint podczas COMMIT, odczyt porównawczy,
  anulowanie długiej operacji ze zwolnieniem blokad i zerwanie transportu podczas COMMIT.
- `cargo test --lib session_tests -- --include-ignored`: **5 testów** — PASS,
  w tym backendowe read-only, izolacja sesji i anulowanie.
- `cargo test --lib database::table_data -- --include-ignored`: **3 testy** — PASS.
- Integracje wykonano wyłącznie na tymczasowym PostgreSQL 17 w kontenerze
  `opaline-inline-20260905`, port 53962, bez wolumenów użytkownika. Baza MMO
  nie była używana do testów ani modyfikowana.
- Podgląd pełnej aplikacji na danych syntetycznych: dwuklik, Enter, zmiana karty
  i powrót, przegląd i odczyt bieżącej wartości, zapis i usunięcie znacznika — PASS.
- Wizualna kontrola komponentów w obszarach 440 × 580 i 760 × 440: pasek i akcje
  mieszczą się, przewijanie jest ograniczone do siatki, nagłówki nie nakładają się
  na rekordy. To test obszaru tabeli, nie deklaracja wsparcia aplikacji mobilnej.
- `npm run tauri -- build --debug --bundles app`: lokalny build **macOS ARM64** — PASS.

Zrzuty: [tabela](screenshots/inline-editing-grid.png),
[porównanie](screenshots/inline-editing-review.png),
[małe obszary robocze](screenshots/inline-editing-responsive.png).

## Świadome ograniczenia

- Szkice tylko w RAM; brak odzyskiwania po awarii procesu i undo po zatwierdzonym COMMIT.
- Brak edycji wyników dowolnego SQL/JOIN; wymagane bezpieczne metadane tabeli.
- Porównanie używa oryginalnego PK: zmiana klucza, usunięcie lub RLS mogą sprawić,
  że bieżącego rekordu nie będzie widać. To nie dowód braku wcześniejszego zapisu.
  Po utracie sesji może być konieczna weryfikacja w nowym połączeniu; automatyczny
  merge/rebase szkicu pozostaje poza zakresem.
- Przy mieszanych zmianach w różnych kartach Save and continue zapisuje karty
  kolejno, nie jedną transakcją między tabelami lub sesjami.
- Nie wykonano natywnego testu interakcji z WebView ani buildów Windows/Linux w tej iteracji.
  Obecny pakiet macOS jest buildem developerskim, nie podpisanym wydaniem beta.
