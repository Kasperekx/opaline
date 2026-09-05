# P0 — implementacja i weryfikacja

Data: 2026-09-05. **P0 pozostaje otwarte.**
Raport opisuje stan po pracy nad P0; późniejsze wdrożenie P1 jest opisane w
[osobnym raporcie](p1-verification.md). Poniższe liczby testów pozostają historyczne.
To raport wykonanej pracy, nie deklaracja gotowości publicznej bety.
Główny zakres nadal określa [plan bety](beta-plan.md).

## Wdrożone

- Przełącznik w nagłówku eksploratora: profile bieżącego workspace, wyszukiwanie,
  oznaczenie środowiska/read-only i otwartej sesji, dodawanie połączenia oraz przejście
  do zarządzania właściwym workspace. Istniejące karty nie zmieniają celu połączenia.
- Zachowanie zamontowanych widoków tabel podczas przełączania kart i sesji.
  Wspólny rejestr szkiców/operacji chroni zamykanie kart, rozłączenie i wyjście.
  Nawigacja tabeli pyta o odrzucenie szkicu; formularze profilu/workspace także są chronione.
  Zajętej operacji nie można odrzucić wraz z widokiem.
- Zapis szkiców SQL po zmianie; archiwum ostatnich 20 zamkniętych kart i przywracanie
  bez wykonania SQL. Błędy/quota lokalnego zapisu są widoczne, ponowienie zachowuje
  bieżące szkice. Nieczytelnych danych nie nadpisujemy; jawna próba odzyskania najpierw
  tworzy lokalną kopię oryginału. Zamknięcie karty jest blokowane, jeśli zapis się nie uda.
- Zamknięcie okna i natywne Quit kierowane do tego samego zabezpieczenia. Lock systemowy
  blokuje drugą instancję korzystającą z tej samej konfiguracji i zwalnia się po crashu.
- Status sesji sprawdzany w Rust co 2 sekundy (bez dodatkowych zapytań do bazy).
  Reconnect zastępuje tylko utraconą sesję, zachowując jej identyfikator i szkice.
  Stare dane mają ostrzeżenie, wyniki SQL są usuwane przy reconnect. Zapisy nie są ponawiane.
- Każde Run ma własną transakcję; sukces zapisu dopiero po potwierdzeniu COMMIT,
  błąd powoduje ROLLBACK. Kontrole transakcji między uruchomieniami są blokowane.
  Nieznany wynik COMMIT ma osobny komunikat; sesja z niepotwierdzonym cleanup jest zamykana.
- Timeout obejmuje SQL, oczekiwanie na metadane, odczyt/edycję tabel i eksport.
  Żądanie anulowania nie jest traktowane jako potwierdzenie zakończenia.
  Transport PostgreSQL należy do sesji: przerwanie/dropping zamyka też zadanie i socket.
- Eksport pełny i zaznaczony używa prywatnego pliku tymczasowego i atomowego zastąpienia.
  Drop operacji sprząta plik tymczasowy; Rust weryfikuje cel zatwierdzony w dialogu zapisu.
  CSV odróżnia NULL (puste pole) od pustego tekstu (`""`); JSON przechowuje liczby jako tekst.
- Budżet wyniku SQL: 8 MiB danych z narzutem komórek, maks. 32 result-sety/512 kolumn.
  Maks. 3 wyniki SQL na połączenie, 30 kart/połączenie, 8 otwartych połączeń.
  Widok wyników renderuje maks. 100 wierszy lub ok. 4000 komórek na stronę.
  Strona tabeli jest pobierana strumieniowo z budżetem 4 MiB; eksport zaznaczenia maks. 16 MiB.
- Wyłączanie nowej historii SQL, działająca pomoc i kopiowanie diagnostyki bez danych połączeń.
  Usunięte martwe przyciski zapowiedzi. Nowe komponenty używają wspólnych tokenów i dialogów.
- ESLint (w tym reguły hooków), typowanie także testów, Prettier, lokalny `npm run check`.
  Przygotowane CI dla macOS/Windows/Linux oraz PostgreSQL 16/17/18, skanu sekretów i RustSec.

## Zweryfikowane lokalnie

Host: macOS 26.3, Apple Silicon. Node 24.19.0 z dostarczonego runtime;
projekt wymaga Node 22.13+ lub 24+. Rust według przypiętego toolchain.

| Kontrola | Wynik |
| --- | --- |
| TypeScript, w tym testy | przechodzi |
| ESLint / reguły hooków | przechodzi |
| Prettier / Rust fmt / Clippy z `-D warnings` | przechodzi |
| Frontend | 40 testów przechodzi |
| Rust, jednorazowy PostgreSQL 17 | 20 testów przechodzi w podstawowym uruchomieniu |
| Dodatkowe testy sesji | 5 przechodzi: izolacja/anulowanie, read-only, atomowość, utrata/reconnect, budżety/precyzja |
| Własne CA/TLS | 1 przechodzi: szyfrowanie, hostname, niezaufany CA, anulowanie z tym samym TLS |
| Keychain | 1 przechodzi na własnym jednorazowym wpisie, usuwanym przez test |
| Build frontend / debugowa aplikacja macOS | przechodzi; to nie podpisany instalator |
| npm audit | 0 zgłoszonych podatności |
| Gitleaks 8.30.1 | brak wykrytych sekretów: 9 commitów historii; osobno `src`, kod Rust, testy, docs i `dist` |
| Browser, fixture syntetyczny | Local → Staging → Local zachowuje SQL; karta tabeli → SQL → tabela zachowuje szkic; zamykanie wymaga decyzji; Keep working przywraca fokus |
| Małe okno 760 × 560 | dialog mieści się w widoku, bez overflow dokumentu; sprawdzono także 1280 × 720 |

Testy nie korzystały z `mmo-db-1` ani konfiguracji użytkownika. Oddzielny serwer
testowy miał losowy port hosta; CA nie było dodawane do systemowego zaufania.
Po testach usunięto wyłącznie tymczasowy kontener PostgreSQL z jego wolumenem
oraz wygenerowane prywatne klucze testowego CA i serwera.
Nie publikowano zmian ani nie tworzono zdalnego repozytorium.

## Audyt Rust — nierozwiązane

Cargo-audit 0.22.2, baza RustSec z 2026-09-02:

- Kategoria `vulnerabilities`: 0 wpisów.
- **`unsound`: glib 0.18.5, RUSTSEC-2024-0429** — naruszenie bezpieczeństwa pamięci
  w iteratorze `VariantStrIter`. Nie jest to stwierdzenie wykorzystywalności w Opaline.
  Źródło i poprawione wersje: [RustSec](https://rustsec.org/advisories/RUSTSEC-2024-0429.html).
- 16 ostrzeżeń `unmaintained`: rodzina GTK3/atk/gdk, proc-macro-error i rust-unic.

`cargo tree --target x86_64-unknown-linux-gnu -i glib` potwierdza zależność przez
GTK/WebKit/Tauri. Sama zmiana naszej zależności na glib 0.20 nie zastępuje wersji
0.18 wymaganej przez GTK3. Potrzebna jest ocena osiągalności problematycznego API,
zweryfikowany backport/rozwiązanie upstream albo świadoma decyzja o zakresie platform bety.
Nie dodano wyjątków RustSec. Gate `cargo audit --deny unsound` ma zatem obecnie
oczekiwany wynik negatywny i blokuje ogłoszenie pełnego P0.

## Nadal wymagane przed zamknięciem P0

1. Rozwiązanie lub udokumentowana ocena powyższego findingu oraz ryzyka nieutrzymywanych zależności.
2. Zdalne repozytorium i rzeczywiste uruchomienie CI. `git remote -v` jest puste;
   plik workflow nie dowodzi przejścia jego macierzy. Ustalenie konta/organizacji wymaga właściciela.
3. Pełne natywne E2E: Quit/close podczas zapisu, restart/crash, suspend/resume,
   niedostępna sieć i magazyn haseł, opóźnione anulowanie, dysk pełny/uprawnienia.
   Testy dialogów i natywnego eventu w Vitest nie zastępują tego odbioru.
4. Szersza macierz PostgreSQL, RLS/triggery/zmiana schematu w trakcie edycji,
   globalne pomiary pamięci/RSS, startu i obciążenia przy wielu sesjach/dużym katalogu.
   Limity ograniczają zachowywane dane; nie gwarantują stałego RSS ani bezpiecznego
   odbioru dowolnie dużego pojedynczego pakietu z serwera.
5. Windows/Linux i pozostałe architektury, DPI, screen reader, fokus i skróty w pełnej macierzy.
6. Podpisywanie/notaryzacja, instalatory, polityka aktualizacji/rollback, kanał prywatnego
   zgłaszania problemów, pilotaż i jawna zgoda na publikację.

## Jawne ograniczenia tego wdrożenia

- Atomic Run nie obsługuje VACUUM, CREATE DATABASE i innych komend wymagających autocommit.
  SQL PREPARE także jest zablokowane przez konserwatywną politykę transakcji w tej wersji.
- Szkice SQL są lokalne, nie szyfrowane. Szkice tabel nie przeżywają crasha.
- Odtwarzanie ostatnich zamkniętych kart SQL to zabezpieczenie P0; obsługa plików SQL,
  autocomplete, zapisane zapytania, dump i restore opisuje teraz raport P1.
- Osobne okno szczegółów połączenia pokazuje „Session open”, nie deklaruje zdrowia
  utraconej sesji. Bieżący stan i reconnect są we właściwym workspace.
- Bez GitHub remote, certyfikatów i dostępnych hostów nie deklarujemy wydania wieloplatformowego.

## Powtarzanie testów bazy

Uruchom własny pusty PostgreSQL z użytkownikiem `postgres`, hasłem testowym
`opaline_test` i sprawdzonym portem. Ustaw `OPALINE_TEST_POSTGRES_PORT` **wyłącznie**
na jego port i uruchom:

```sh
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib session_tests -- --ignored --test-threads=1
```

TLS wymaga osobnego certyfikatu podpisanego przez jednorazowy CA, SAN `DNS:localhost`,
`OPALINE_TEST_CA_PATH` i `OPALINE_TEST_TLS_PORT`. Test Keychain uruchamia się osobno
z `OPALINE_TEST_NATIVE_VAULT=1`; nie wykonujemy go bez potrzeby w CI.
