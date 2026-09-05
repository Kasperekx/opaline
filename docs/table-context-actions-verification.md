# Menu komórki i duplikowanie — weryfikacja

2026-09-05. Uzupełnienie [edycji inline](inline-table-editing-verification.md).

## Zmiana UX

- Usunięto stały pasek Copy cells / Copy JSON / Inspect value oraz instrukcję
  edycji nad tabelą. Akcje są pod prawym przyciskiem myszy lub Shift+F10.
- Cmd/Ctrl+C nadal kopiuje komórki. Otwarcie menu wewnątrz zaznaczonego zakresu
  zachowuje zakres; poza nim wybiera wskazaną komórkę. Pierwsze otwarcie menu
  również kopiuje właściwą wartość, bez konieczności wcześniejszego kliknięcia.
- Udane kopiowanie ma wyłącznie komunikat dla czytnika ekranu; błąd schowka
  jest widoczny, kompaktowy i można go zamknąć. Inspektor zachowuje pełny tekst.
- Duplicate row tworzy nowy szkic z widocznych wartości, także lokalnych zmian.
  Nie uruchamia zapisu. Pasek zmian i znacznik karty pokazują niezapisany stan.
- PK z defaultem, identity i generated są pozostawione bazie. Ręczny PK, także
  złożony, enum lub boolean, wymaga jawnego uzupełnienia. Inne pola UNIQUE nie
  są automatycznie zmieniane — trzeba je sprawdzić przed zapisem.
- Duplikat można odrzucić z menu. Read-only, trwający zapis, niepewny COMMIT,
  brak możliwości INSERT, oznaczenie usunięcia i limit 500 zmian pozostają chronione.

Zmiana dotyczy tabeli Data. Pasek narzędzi wyników dowolnego SQL nie był usuwany.
Nie dodawano nowego polecenia SQL ani ścieżki zapisu: używany jest istniejący
atomowy mechanizm INSERT/UPDATE/DELETE. Bufor pozostaje wyłącznie w RAM.

## Podział odpowiedzialności

- `table-change-set.ts`: czyste tworzenie duplikatu i walidacja klucza.
- `useTableChanges`: wspólna ścieżka tworzenia nowego wiersza, blokady i zapis.
- `TableGridCell` / `TableCellMenu`: kontekst i dostępne akcje.
- `GridInteractions` / `GridFeedback`: zaznaczenie, schowek, inspektor i status;
  nie wymagają już renderowania widocznego paska przycisków.

Skill `frontend-design` wpłynął na ograniczenie stałych elementów UI, grupowanie
menu, dyskretne statusy i zachowanie klawiatury. Podgląd wykonano przez
`browser:control-in-app-browser`.

## Kontrole

- `npm run check` — PASS: TypeScript, ESLint, Prettier, **98 testów Vitest**,
  produkcyjny build Vite.
- Nowe regresje obejmują: brak paska, menu klawiaturowe i inspekcję, poprawny
  cel kopiowania, zachowanie zakresu, błąd schowka, duplikowanie lokalnych zmian,
  brak automatycznego zapisu, PK/default/identity/generated, NULL/pusty tekst,
  precyzję bigint/JSON, ręczne klucze enum/boolean, odrzucanie i read-only.
- Pełny podgląd aplikacji na syntetycznym adapterze: otwarcie menu, Duplicate row,
  wymagany nowy klucz, Enter, zapis i usunięcie oznaczenia szkicu — PASS.
  To nie był zapis na rzeczywistym serwerze PostgreSQL.
- Kontrola wizualna tabeli w obszarach 440 × 580 i 760 × 440 — PASS.
  Akcje zawijają się, dane przewijają w obrębie siatki; brak pustego paska.
- `npm run tauri -- build --debug --bundles app` — PASS po końcowych zmianach;
  lokalny build developerski macOS ARM64, nie podpisane wydanie beta.
- `git diff --check` — PASS.

Zrzuty syntetycznych danych: [menu](screenshots/table-context-menu.png),
[duplikat przed zapisem](screenshots/table-duplicate-row.png),
[tabela bez paska](screenshots/table-clean-grid.png),
[małe obszary](screenshots/table-context-responsive.png).

## Granice weryfikacji

Nie zmieniano backendu Rust ani nie powtarzano w tej iteracji integracji z żywą
bazą; poprzedni raport dokumentuje osobne testy transakcji. Nie używano bazy MMO.
Podgląd przeglądarkowy nie zastępuje natywnych testów WebView, schowka i klawiatury
na systemach deklarowanych w becie. Ich odbiór jest w [planie bety](beta-readiness.md).
