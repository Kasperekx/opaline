# P1 — implementacja i lokalna weryfikacja

Data: 2026-09-05. Wdrożono główny zakres etapów 6–8.
To nie jest deklaracja ukończenia P0 ani gotowości publicznej bety.

## Co jest dostępne

### SQL — etap 6

- Autocomplete schematów, tabel i kolumn z bieżącej sesji; niezależny cache
  i ręczne odświeżenie. Limit 10 000 kolumn; przy przekroczeniu pozostają
  podpowiedzi tabel i jawny komunikat.
- Formatowanie PostgreSQL lokalnie, sprawdzane przez porównanie AST w Rust.
  Nieobsługiwana składnia nie jest zmieniana. Zmiana w CodeMirror jest cofana przez Undo.
  Opóźniony wynik formatowania nie nadpisuje nowszej edycji ani innej karty.
- Biblioteka per workspace, wyszukiwanie, zapis kopii, usuwanie z potwierdzeniem.
  Kontekst „Open in [connection]” jest jawny; otwarcie nigdy nie wykonuje SQL.
- Natywne Open / Save / Save as dla UTF-8 .sql, limit 1 MiB. Sprawdzenie zmian
  pliku przed atomową podmianą; konflikt nie nadpisuje cudzej wersji. Edycje wykonane
  w czasie zapisu nadal są oznaczone jako niezapisane.
- Paleta poleceń: Cmd/Ctrl+Shift+P, Open: Cmd/Ctrl+O, Save: Cmd/Ctrl+S,
  Save as: Cmd/Ctrl+Shift+S. Skróty są przypisane do widocznej sesji i nie przejmują
  otwartych formularzy/dialogów. Brak polecenia automatycznie wykonującego SQL w palecie.
- Wcześniejsze odzyskiwanie zamkniętych kart zachowane. UI odróżnia lokalny szkic,
  plik i stan względem ostatniego wykonania. Po restarcie plik staje się lokalnym szkicem:
  systemowe uprawnienie do pliku nie jest utrwalane.

### Dane i organizacja — etap 7

- Wspólny mechanizm komórek dla wyników SQL i tabel: zaznaczenie prostokąta
  przez Shift-click / Shift-strzałki, Copy cells, Copy JSON, pełny podgląd wartości.
  Wynik SQL pozostaje read-only; edycja tabeli odbywa się przez jawne akcje wiersza.
- TSV jest escapowany: NULL to `\N`, dosłowny backslash, tab i nowa linia są
  rozróżnialne. JSON kopiuje macierz tekstów/null bez konwersji liczb na JS Number.
  Inspektor pokazuje oryginalny tekst JSON bez ponownego parsowania i utraty precyzji.
- Szerokość kolumn można zmieniać uchwytem lub klawiaturą. Naprawiono nachodzenie
  przycisków nagłówka na pierwszy wiersz oraz indeksowanie komórek przy szkicu nowego wiersza.
- Przywracanie kart tabel, filtrów, sortowania, strony i ostatniego workspace.
  Wyniki, szkice edycji wiersza i uchwyty plików nie są zapisywane. Dane tabel pobierane
  są dopiero po świadomym otwarciu połączenia; zapisany SQL nie wykonuje się sam.
- Przeniesienie rozłączonego profilu zachowuje jego ID, cel, szkice, historię i wpis
  magazynu haseł. Usuwanie workspace blokują aktywne sesje; profile i biblioteka
  wymagają przeniesienia, nie ma kaskadowego kasowania.
- Biblioteka kopiowana jest przed usunięciem workspace; lokalny oryginał pozostaje
  kopią odzyskiwania. Przy błędzie operacji może istnieć kopia w obu workspace,
  ale nie tracimy oryginału. Szkice/historia pozostają przypisane do ID profilu.
- Import/eksport profili przez natywne okna: ścisła lista pól, brak haseł,
  ID Keychain i ścieżek CA. Nowe ID przy imporcie; jawna zgoda na tworzenie nowych
  profili i sufiksy nazw. Nie nadpisuje istniejących profili.
  Wymaganie własnego CA nie znika: trzeba wybrać lokalny certyfikat przed połączeniem.

### Backup / Restore — etap 8

- Aktualizacja UX: aplikacja dołącza klientów PostgreSQL 14–18 i automatycznie
  dobiera major do aktywnego serwera. Bez instalacji, pobierania i Detect tools
  po stronie użytkownika. Domyślnie ponownie używa hasła aktywnej sesji w Rust.
  Ręczny wybór klienta pozostaje wyłącznie w Advanced; wymaga świadomego zaufania.
  [Opis pakowania i nowsza weryfikacja](bundled-postgres.md).
- Dump custom albo plain SQL, cała baza/wybrane schematy/tabele,
  struktura/dane/oba. Nazwy są dokładnie cytowane, nie rozwijane przez shell.
  Prywatny plik obok celu jest publikowany dopiero po sukcesie.
  Błędne hasło i anulowanie nie nadpisują istniejącego backupu.
- Restore do istniejącej bazy. Rozpoznanie zawartości, a nie rozszerzenia.
  Prywatny snapshot, SHA-256, podgląd TOC custom lub początku SQL.
  Podgląd jest związany z konkretną sesją i nie jest audytem bezpieczeństwa.
- Read-only blokuje restore. Osobne potwierdzenia: zaufany plik, dokładna nazwa
  bazy, production, niepusta baza oraz DROP istniejących obiektów z archiwum.
  Custom domyślnie pomija właścicieli i granty; ich odtworzenie jest opcjonalne.
- SQL przez psql -X, ON_ERROR_STOP i restricted mode z nowym losowym kluczem.
  Metakomendy klienta, m.in. shell i reconnect, są blokowane. To NIE jest sandbox
  dla SQL, funkcji lub rozszerzeń z efektami zewnętrznymi.
- Custom: jedna transakcja, zatrzymanie przy błędzie. SQL może zawierać własne
  komendy transakcyjne — częściowe zmiany i efekty zewnętrzne są możliwe.
  Nie obiecujemy rollbacku po anulowaniu ani po utracie odpowiedzi.
- Zadanie ma etapy/czas/anulowanie, bez fikcyjnego procentu i surowych logów SQL.
  Anulowanie snapshotu sprawdzane jest podczas kopiowania; lista TOC ma timeout.
  Anulowanie klienta najpierw próbuje przerwać zapytanie PostgreSQL po unikalnym
  application_name zadania, w bieżącej bazie i roli, potem zabija i zbiera proces.
- Maintenance wyklucza lokalne zapytania/edycje, również w innych sesjach.
  Inne aplikacje nie są blokowane. Po próbie restore sesje tego samego
  skonfigurowanego host/port/database wymagają reconnect. Aliasy hosta nie są rozpoznawane.
- Zachowanie szyfrowania bez downgrade: verify-full i CA profilu dla sesji
  szyfrowanej, także gdy profil używał Prefer i rzeczywiście połączył się po TLS.
  Magazyn systemowego zaufania klienta PostgreSQL może różnić się od tego w Tauri.
- Hasło tylko w prywatnym pliku tymczasowym pgpass, nie w argumentach ani logach.
  Środowisko subprocessu nie dziedziczy konfiguracji libpq, psqlrc, HOME ani
  zmiennych sterujących ładowaniem bibliotek.

## Podział odpowiedzialności

Frontend: osobne hooki dokumentów, autocomplete, biblioteki, komend i zadań;
osobne formularze opcji backup/restore; wspólne dialogi, zabezpieczenia pracy
i narzędzia siatki. Wykorzystano istniejące tokeny interfejsu, fokus i responsywne
układy zamiast osobnego systemu wizualnego.

Rust: SQL files, transfer profili oraz moduły backup/models, tools, process,
files i operations. UI nie buduje poleceń shellowych ani SQL odtwarzania.

## Wyniki lokalne

Host: macOS / Apple Silicon. Wszystkie operacje bazy wykonano na jednorazowym
kontenerze PostgreSQL 17, port hosta 50219, nigdy na `mmo-db-1`.
Narzędzia 17.11 zbudowano osobno z oficjalnego archiwum i sprawdzono SHA-256.
Globalne libpq 17.4 nie zostało zmienione; jest odrzucane przez nową politykę minimum.

| Kontrola | Wynik |
| --- | --- |
| TypeScript, ESLint, Prettier, build web | przechodzi |
| Frontend | 53 testy, w tym 13 nowych regresji P1 |
| Rust podstawowy, z jednorazową bazą | 29 przechodzi, 11 opt-in pominiętych w tym uruchomieniu |
| Backup Rust, opt-in + unit | 9 przechodzi; 5 z nich zawiera już suite podstawowy |
| Izolacja/transakcje/read-only/budżety/reconnect | 5 dodatkowych testów sesji przechodzi |
| Native TLS z własnym CA | 1 dodatkowy test przechodzi |
| Łącznie unikalne testy Rust w tej pracy | 39 przechodzi; test Keychain nie był ponawiany |
| Rust fmt / Clippy -D warnings | przechodzi |
| Tauri debug, macOS .app | przechodzi; nie jest to podpisany instalator release |
| npm audit | 0 zgłoszonych podatności |
| Gitleaks 8.30.1, źródła TS/Rust, testy, docs, dist | brak wykrytych sekretów |
| Cargo audit --deny unsound | nadal negatywny: glib 0.18.5 RUSTSEC-2024-0429; 16 unmaintained, 0 wpisów vulnerabilities |

Round-trip custom i SQL porównuje dane, bardzo duży numeric, Unicode, NULL/pusty
tekst, klucz główny, indeksy i sekwencję. Osobno sprawdzono odmowę niepustego celu
i jawny clean restore, błędne hasło, zachowanie istniejącego pliku, anulowanie,
niedozwolone metakomendy psql i rollback zwykłego błędu SQL.
TLS CLI: sukces z własnym CA, odmowa złej nazwy hosta i niezaufanego CA, bez plaintext fallback.

Po testach usunięto ten jednorazowy kontener i jego wolumen oraz prywatne klucze
testowego CA/serwera. Dane testowe są odtwarzalne przez suite, nie zachowano ich
kopii. Pozostawiono lokalną instalację narzędzi. Baza MMO i systemowy Keychain
użytkownika nie były używane ani zmieniane.

UI sprawdzono na syntetycznej stronie testowej: format/Undo, zapis/otwarcie
biblioteki bez Run, podgląd dumpa i potwierdzenia restore, zakres komórek,
klawiatura i inspektor. Viewport 811 × 1044: przewijana treść restore, zawsze widoczne
akcje i kontekst celu w nagłówku. Wcześniejsza kontrola formularza również
1280 × 720. To test webview-fixture, nie pełne natywne E2E.
Naprawę nakładania nagłówka potwierdzono pomiarem DOM: przyciski kończą się przed
pierwszym wierszem, a Shift+ArrowDown zaznacza obie komórki zamiast sortować.

Materiały: [backup](screenshots/p1-backup.png), [restore](screenshots/p1-restore.png),
[biblioteka](screenshots/p1-library.png), [siatka](screenshots/p1-grid.png).

## Limity i odbiór, którego jeszcze brakuje

- Nie ma automatycznego CREATE DATABASE podczas restore. Użytkownik musi wskazać
  istniejącą bazę; domyślnie pustą. Pełny kreator nowej bazy pozostaje otwartym elementem 8C.
- Archiwum custom maks. 100 GiB; SQL restore 64 MiB; TOC 512 KiB;
  cztery przygotowane podglądy. Operacja ma limit 1 h, kontrola narzędzia 5 s,
  połączenie 10 s. Limity nie są deklaracją testu wydajności na maksymalnym rozmiarze.
- Pamięć biblioteki: 200 zapytań / 2 MiB UTF-8. Import: 4 MiB / 200 profili,
  łącznie najwyżej 500 profili. LocalStorage może odmówić zapisu wcześniej.
- Zapis i snapshot wymagają miejsca na dodatkowy plik. Zwykłe zakończenie sprząta
  pliki tymczasowe; crash/kill może pozostawić prywatne pozostałości. Nie jest
  to zaszyfrowany backup ani gwarancja odporności na utratę zasilania.
- Cancel przed uruchomieniem procesu, np. podczas systemowego wyboru pliku lub
  dostępu do Keychain, może poprosić o oczekiwanie. Anuluj również systemowy dialog.
- Pierwotny odbiór P1 poniżej obejmował PostgreSQL 17. Nowsza
  [macierz dołączonych klientów](bundled-postgres.md) obejmuje już 14–18.
  Windows/Linux, inne architektury, pełne natywne dialogi i test instalacji/aktualizacji
  nadal wymagają odbioru.
- Nadal wymagane: dysk pełny/uprawnienia, utrata sieci podczas commit, bardzo duże
  archiwa/schematy, rozszerzenia i różne role, dump częściowy z zależnościami,
  crash z plikami tymczasowymi, minimalne natywne okno/DPI/screen reader.
- Testy backupu pozostają opt-in lokalnie. Konfiguracja CI zawiera teraz
  przygotowanie klientów i macierz backup/TLS, ale zdalne joby nie zostały
  uruchomione. Nie ogłaszamy przejścia nieuruchomionego CI.
- Wszystkie pozostałe [blokady P0](p0-verification.md) nadal obowiązują.
  Brak publikacji, podpisywania, nowego remote i zmian w bazie użytkownika.

## Powtarzanie testów

Tylko własny jednorazowy PostgreSQL, poza portem 5432, użytkownik/baza postgres,
hasło testowe opaline_test. Dla TLS wygeneruj odrębne CA i certyfikat SAN DNS:localhost;
nie dodawaj CA do zaufania systemowego.

Ustaw na czas polecenia:
- OPALINE_TEST_POSTGRES_PORT — port jednorazowego serwera;
- OPALINE_TEST_PG_TOOLS — absolutny katalog z zaufanym zestawem narzędzi;
- OPALINE_TEST_CA_PATH — PEM CA jednorazowego serwera TLS.

Następnie z repo:
```sh
npm run check
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib backup::tests -- --include-ignored --test-threads=1
cargo test --locked --manifest-path src-tauri/Cargo.toml --lib session_tests -- --ignored --test-threads=1
cargo clippy --locked --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
npm run tauri build -- --debug --bundles app
```

Dodatkowy test tls_tests używa OPALINE_TEST_TLS_PORT oraz tego samego CA.
Klienci użyci lokalnie są w katalogu poza repo:
`/Users/piotrkasperek/Documents/Codex/2026-09-04/ch/work/p1-postgres.QjYE2A/install/bin`.
To instalacja testowa, nie część dystrybucji ani aktualizacja systemowego libpq.

## Podstawa techniczna

[pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/18/app-pgrestore.html),
[psql restricted mode](https://www.postgresql.org/docs/18/app-psql.html),
[libpq / TLS](https://www.postgresql.org/docs/17/libpq-connect.html),
[źródła PostgreSQL 17.11](https://ftp.postgresql.org/pub/source/v17.11/).
