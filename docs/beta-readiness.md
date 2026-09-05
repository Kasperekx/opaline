# Beta Opaline — co jeszcze robimy

Data: 2026-09-05. **Stabilizacja w toku, nie zgoda na publikację.**

Decyzje właściciela: pierwsza beta na **macOS**, Windows/Linux później;
tworzenie bazy przy restore i jawny autocommit **wchodzą przed betą**.
Kod jest już w publicznym repozytorium. Aktualne dowody techniczne i pozostające
ograniczenia: [odbiór stabilizacji](beta-stabilization-verification.md).

Cel: tester instaluje aplikację, łączy się z PostgreSQL, wykonuje SQL, przegląda
i zmienia dane oraz robi backup bez pomocy autora i bez środowiska developerskiego.
Premium UX oznacza tu czytelność i przewidywalność, nie więcej widocznych przycisków.

To aktualna lista pozostałych prac. [Pierwotny plan P0/P1](beta-plan.md) zachowuje
historię etapów. Checkbox oznacza pełny odbiór, a nie samo istnienie kodu.
**P0 blokuje wydanie; P1 trzeba dostarczyć albo jawnie odłożyć.**

## Co już mamy — nie budujemy tego drugi raz

- Workspaces, profile, środowiska, wiele aktywnych sesji i przełącznik połączeń.
- Systemowy magazyn haseł, własne CA/TLS, read-only i ostrzeżenie dla production.
  Zachowujemy decyzję: production może zapisywać po ostrzeżeniu, bez narzucania read-only.
- Edytor SQL, autocomplete, formatowanie/Undo, pliki SQL, biblioteka i historia.
- Tabele: filtrowanie, sortowanie, paginacja, struktura, eksport CSV/JSON.
- Edycja komórek, bufor wielu zmian, przegląd różnic, atomowy zapis i ochrona szkiców.
- Menu komórki zamiast stałego paska; kopiowanie zakresu, inspekcja i duplikowanie
  wiersza jako nowego szkicu. PK resetowany, identity/generated uzupełniane przez bazę.
- Backup/restore z dołączonymi narzędziami PostgreSQL, bez instalowania ich przez użytkownika.

To funkcje wdrożone lokalnie. **Nie jest to jeszcze odbiór podpisanego wydania na
wszystkich platformach.** Dowody i ograniczenia: [P0](p0-verification.md),
[P1](p1-verification.md), [backup 14–18](bundled-postgres.md),
[edycja](inline-table-editing-verification.md),
[menu i duplikowanie](table-context-actions-verification.md).

## Decyzje przed rozpoczęciem stabilizacji

| ID | Do ustalenia | Propozycja do Twojej oceny |
| --- | --- | --- |
| D1 | Systemy, architektury i najstarsza wersja OS w pierwszej becie | Potwierdzone: macOS najpierw; Windows/Linux później. CI buduje ARM64 i Intel na macOS 15; minimum OS i odbiór obu architektur nadal wymagają potwierdzenia paczką. |
| D2 | Aktualizacje | W pierwszej becie może wystarczyć ręczna aktualizacja z zachowaniem konfiguracji; auto-update to osobna decyzja. |
| D3 | Odtwarzanie do nowej bazy | Potwierdzone: przed betą. Wdrożone i sprawdzone integracyjnie 14–18; pozostaje odbiór finalnej paczki. |
| D4 | Komendy poza transakcją | Potwierdzone: jawny autocommit przed betą. Wdrożony per karta, z potwierdzeniem i resetem przy reconnect/restart; testy VACUUM/CREATE DATABASE 14–18. |
| D5 | Pierwsza grupa testerów | Deweloperzy backendu pracujący z PostgreSQL, początkowo na danych testowych/local/staging. Zapisać ich 3 najczęstsze zadania. |
| D6 | SSH i pozostałe integracje | SSH przed betą tylko jeśli potrzebuje go wybrana grupa. Kafka, logi Dockera i diagramy proponuję zostawić na kolejną iterację. |
| D7 | Repo, nazwa i kanał kontaktu | Repo wybrane: `Kasperekx/opaline`, podłączone przez SSH. Pozostaje ustalić nazwę wydania, kanał błędów i prywatnych zgłoszeń bezpieczeństwa. |

**Twoje uwagi do decyzji:**

> Do uzupełnienia.

## Kolejność prac

| Kolejność | Zadanie | Priorytet | Co ma powstać |
| --- | --- | --- | --- |
| 1 | B01 — audyt UX codziennej pracy | P0 | Zamknięta lista błędów layoutu i interakcji |
| 2 | B02 — poprawność zmian danych | P0 | Testy zapisów i konfliktów na prawdziwej bazie |
| 3 | B03 — awarie i zachowanie pracy | P0 | Natywny odbiór restartu, utraty sieci i zamykania |
| 4 | B04 — dokończenie odbioru backup/restore | P1 + bezpieczeństwo P0 | Sprawdzony przepływ bez ręcznej konfiguracji narzędzi |
| 5 | B05 — bezpieczeństwo i prywatność | P0 | Aktualny audyt i rozstrzygnięte znane ryzyka |
| 6 | B06 — wydajność i dostępność | P0 | Pomiary oraz testy małych okien i dużych danych |
| 7 | B07 — repo, CI i macierz wersji | P0 | Rzeczywiście zielone joby dla kandydata wydania |
| 8 | B08 — instalacja, aktualizacje i dokumentacja | P0 | Gotowy pakiet dla testera |
| 9 | B09 — zamknięty pilotaż i decyzja o publicznej becie | P0 | Zgłoszenia, poprawki i zatwierdzony release |

B05 i przygotowanie B07 można prowadzić wcześniej, równolegle z poprawkami.
Nie dokładamy nowych integracji w środku stabilizacji bez wspólnej decyzji.

## B01 — spójny UX codziennej pracy

Najpierw domykamy to, z czym użytkownik styka się codziennie.

- [ ] Przejść cały przepływ: workspace → profil → sesja → SQL → tabela → zmiana
  → zapis → zamknięcie. Każda akcja ma jednoznaczny cel i przewidywalny efekt.
- [ ] Przejrzeć wszystkie toolbary i menu: usunąć zbędne instrukcje i dublowanie
  akcji, ujednolicić nazwy, odstępy, disabled/hover/focus i podpowiedzi skrótów.
- [ ] Poprawić zachowanie wielu kart i długich nazw. Na ostatnim zrzucie
  „Reopen closed query” zawija się przy końcu paska — dodać ten przypadek do odbioru.
- [ ] Sprawdzić tabele szerokie i bardzo długie wartości: brak nakładania nagłówków,
  brak skoków wiersza, dostęp do menu i edytora przy krawędzi okna.
- [ ] Ujednolicić empty/loading/error/success. Zwykłe formatowanie i kopiowanie
  nie zajmują osobnego dużego obszaru. Błąd zapisu nie może wyglądać jak sukces.
- [ ] Czytelny stan połączenia, środowisko i read-only; jasny powód odmowy edycji.
- [ ] Natywny odbiór fokusów i skrótów: Cmd/Ctrl+C/S, F2, Enter/Escape, Tab,
  Shift+F10, zakres komórek, zmiana karty i otwarte dialogi.

Odbiór: tester potrafi zmienić/duplikować rekord, przejrzeć zmiany, zapisać lub
odrzucić je bez instrukcji autora i bez przypadkowego zapisu do innej sesji.

**Twoje uwagi B01:**

> Do uzupełnienia: ekrany, komunikaty i zachowania, które Cię irytują.

## B02 — poprawność danych

Mechanizmy są zaimplementowane, ale macierz przypadków musi być szersza niż kilka
testowych tabel. Błąd grożący uszkodzeniem danych blokuje betę.

- [ ] Testy typów: bigint/numeric bez utraty precyzji, UUID, Unicode, NULL/pusty
  tekst/DEFAULT, JSON, enum, daty i strefy czasowe, tablice i typy niestandardowe.
- [ ] Duplikowanie: PK ręczny/złożony/UUID-default/serial/identity, generated,
  inne UNIQUE, skopiowane lokalne poprawki, limity bufora i read-only.
- [ ] UPDATE/DELETE/INSERT w jednej transakcji: RLS, brak uprawnień, FK, UNIQUE,
  deferred constraints, triggery oraz zmiana schematu podczas edycji.
- [ ] Jednoczesna zmiana/usunięcie/zmiana PK przez innego klienta: zachowanie
  szkicu, rzetelne porównanie i brak automatycznego nadpisania.
- [ ] Niepewny COMMIT, zgubiona odpowiedź, błąd odświeżenia po sukcesie:
  brak powtórnego INSERT i brak mylącego „nie zapisano”.
- [ ] Kopiowanie i eksport zachowują formaty oraz NULL; jasno określić, kiedy
  kopiowane są szkice, a kiedy dane odczytane z bazy.

Odbiór: testy integracyjne dla zadeklarowanych wersji PostgreSQL i regresja do
każdego ujawnionego błędu. Podgląd w przeglądarce nie zastępuje tych testów.

**Twoje uwagi B02:**

> Do uzupełnienia.

## B03 — utrata sieci, restart i ochrona pracy

- [ ] Natywnie sprawdzić wyjście z aplikacji, zamknięcie karty, rozłączenie oraz
  odświeżenie z lokalnymi zmianami: Save / Discard / Keep working.
  Lokalny build QA: poprawiono omijanie ochrony przez Cmd+Q; ponowny odbiór
  Cmd+Q/menu Quit/zamknięcia okna oraz nieudanego zapisu przeszedł. Dock Quit,
  pozostałe akcje i finalna paczka nadal wymagają pełnego odbioru.
- [ ] Uśpienie/wybudzenie, utrata sieci, restart PostgreSQL, timeout i anulowanie
  podczas zapisu, odczytu i eksportu. Nie pozostają wiszące blokady/zadania.
- [ ] Reconnect nie uruchamia SQL samoczynnie, nie zmienia celu karty i nie gubi
  szkicu; poprzednie wyniki są oznaczone jako potencjalnie nieaktualne.
- [ ] Przetestować uszkodzony plik konfiguracji, brak miejsca, prawa dostępu,
  migrację starego formatu i próbę uruchomienia drugiej instancji.
- [ ] Zamknięty/niedostępny magazyn haseł: aplikacja wyjaśnia problem i nie
  nadpisuje istniejącego profilu ani hasła pustą wartością.
- [ ] Jasno pokazać i opisać, że szkice rekordów są tylko w RAM i nie przetrwają
  crasha. Nie obiecywać autosave/odzyskania, których nie ma.

**Twoje uwagi B03:**

> Do uzupełnienia.

## B04 — backup i restore gotowe dla użytkownika

- [ ] Na czystej maszynie bez PostgreSQL/Dockera/Node/Rusta: Backup → wybór pliku
  → gotowa kopia. Bez Detect tools, PATH i dodatkowej instalacji klienta.
- [ ] Powtórzyć dump → restore → porównanie danych, struktury, sekwencji i indeksów
  z finalnej paczki, na deklarowanych platformach i wersjach serwera.
- [ ] Sprawdzić duże kopie, niewystarczające miejsce, anulowanie, crash i utratę
  sieci; istniejący plik nie może zostać zastąpiony niekompletną kopią.
- [ ] Sprawdzić częściowy dump, zależności, rozszerzenia, role/uprawnienia,
  uszkodzony lub nieobsługiwany plik i formaty kompresji.
- [ ] Zweryfikować limity na realnym użyciu: aktualnie plain SQL restore ma limit
  64 MiB, custom 100 GiB. Pokazać limity wcześniej albo zmienić je po pomiarach;
  liczba w kodzie nie jest dowodem, że operacja na takim rozmiarze została przetestowana.
- [ ] Odtwarzanie nadal wymaga jasnego celu, zaufanego pliku i osobnych zgód na
  production/niepustą bazę/DROP. Nie obiecywać rollbacku dowolnego skryptu SQL.
- [x] Rozstrzygnąć D3 i wdrożyć kreator nowej bazy: osobna zgoda, wolna nazwa,
  brak automatycznego DROP przy błędzie; integracja custom/SQL na PostgreSQL 14–18.
  Nie zastępuje to powyższego odbioru na czystej maszynie.

**Twoje uwagi B04:**

> Do uzupełnienia.

## B05 — bezpieczeństwo i prywatność

- [ ] Ponowić audyt JS/Rust i binariów w dokładnej paczce wydania. Ostatni raport
  wskazywał `glib 0.18.5 / RUSTSEC-2024-0429` oraz nieutrzymywane zależności;
  potrzebna aktualna ocena i rozwiązanie/udokumentowane ograniczenie ryzyka.
  Ta checklista nie jest nowym skanem i nie potwierdza aktualności starego wyniku.
- [ ] Przejrzeć IPC, izolację sesji, CSP, zakres dostępu do plików, parametryzację
  SQL oraz read-only również po stronie Rust, nie tylko disabled w UI.
- [ ] Przetestować TLS/CA, nieprawidłowy hostname, zablokowany Keychain i zmianę
  celu profilu bez niejawnego użycia starego hasła.
- [ ] Skan sekretów w całej historii repo i gotowych artefaktach; bez danych
  użytkownika w fixtures, screenshotach, logach i zgłoszeniach.
- [ ] Opisać lokalne, nieszyfrowane szkice/historię SQL, możliwość ich wyłączenia
  i czyszczenia oraz zachowanie plików tymczasowych po awarii.
- [ ] Ustalić prywatny kanał zgłoszeń podatności i zaktualizować SECURITY.md.
- [ ] Sprawdzić licencje i dołączone notices całej dystrybucji, także klientów
  PostgreSQL, OpenSSL i ich zależności; ustalić proces aktualizacji tych składników.

**Twoje uwagi B05:**

> Do uzupełnienia.

## B06 — wydajność, małe okna i dostępność

- [ ] Zmierzyć start, RSS po dłuższej sesji, otwieranie dużego katalogu, wiele
  połączeń i kart, szerokie tabele i duże wyniki. Zapisać dataset i wyniki pomiarów.
- [ ] Sprawdzić globalny budżet pamięci, nie tylko limit pojedynczego zapytania;
  odłączanie sesji i zamykanie kart powinno zwalniać zasoby.
- [ ] Minimum okna 760 × 560, maksymalna czcionka, systemowe skalowanie/DPI,
  drugi monitor i resize paneli: żadnych niedostępnych akcji.
- [ ] Klawiatura bez myszy, screen reader, kontrast, focus-visible i reduced motion.
  Znaczenie stanu nie może zależeć wyłącznie od koloru lub hover.
- [ ] Duże komórki i katalogi nie zamrażają całej aplikacji; ograniczenia są
  wyraźnie komunikowane, a operacje możliwe do przerwania.

**Twoje uwagi B06:**

> Do uzupełnienia.

## B07 — repozytorium, CI i macierz wersji

- [x] Podłączyć zdalne repo: `origin` → `git@github.com:Kasperekx/opaline.git`.
  Kod i workflow wypchnięte 2026-09-05 (`5d1c42f` i kolejne poprawki).
- [x] Przed pierwszym push sprawdzić sekrety i zakres plików, przygotować commit
  oraz wysłać kod po zatwierdzeniu publikacji. Gitleaks: staging i historia bez wykryć.
- [ ] Uruchomić istniejący workflow na zdalnym CI i naprawić rzeczywiste błędy
  na wszystkich zadeklarowanych systemach. Plik YAML nie oznacza zielonego CI.
  `ce8bfc4` i `4d616f7`: po 12 zielonych jobów, w tym macOS ARM/Intel.
  Każdy późniejszy kandydat (w tym poprawka natywnego Quit) wymaga własnego CI.
- [x] Dołączyć do CI i lokalnej macierzy `database::table_changes` wymagające
  PostgreSQL. Opt-in testy są teraz faktycznie uruchamiane dla wersji 14–18.
- [ ] Przetestować edycję/duplikowanie na zadeklarowanych wersjach serwera.
  Dotychczasowa macierz backup/TLS/sesji 14–18 nie oznacza identycznego pokrycia edycji.
- [ ] Egzekwować typecheck/lint/format/tests/build oraz audyt sekretów/zależności;
  bez odhaczania blokujących testów przez nieudokumentowane wyjątki.
- [ ] Wersja, commit/tag, changelog i sumy kontrolne muszą wskazywać dokładnie
  ten artefakt, który przeszedł odbiór, nie lokalny zmieniający się katalog.

**Twoje uwagi B07:**

> Do uzupełnienia: właściciel repo i docelowe platformy.

## B08 — instalacja, aktualizacje i pierwsze uruchomienie

- [ ] Przygotować release na najstarszym zadeklarowanym OS. Obecny developerski
  pakiet klientów był budowany z minimum macOS 26; nie jest dowodem obsługi starszych Maców.
- [ ] Podpisywanie/notaryzacja i sprawdzenie gotowej dystrybucji. Dla dołączanych
  klientów podpis ma powstać przed manifestem integralności; testować finalną paczkę.
- [ ] Zainstalować, uruchomić, zaktualizować i odinstalować na czystych maszynach;
  sprawdzić brak narzędzi developerskich i poprawny dostęp do magazynu haseł.
- [ ] Aktualizacja zachowuje profile/bibliotekę/historię. Zaplanować kopię
  konfiguracji i odzyskanie po nieudanej aktualizacji, bez założenia, że dowolny
  downgrade potrafi czytać nowszy format konfiguracji.
- [ ] Jeśli auto-update jest w zakresie: podpisy pakietów, kanał beta, przerwane
  pobranie i błędna paczka. Jeśli nie — prosta, sprawdzona instrukcja ręczna.
- [ ] README dla testera, instalacja/pierwsze połączenie, skróty, limity i known issues.
  Pomoc w aplikacji ma odpowiadać faktycznym zachowaniom, nie staremu UI.
- [ ] Działające About / Report issue z wersją i dobrowolną, bezpieczną diagnostyką;
  szablon błędu bez zachęcania do wysyłania danych bazy/sekretów.

Konta wydawcy, certyfikaty, płatności i publikacja wymagają decyzji właściciela;
ten plan ich nie uruchamia.

**Twoje uwagi B08:**

> Do uzupełnienia.

## B09 — pilotaż i warunek wydania

- [ ] Wybrana mała grupa, np. 5–10 testerów, instaluje kandydata samodzielnie
  i wykonuje zadania z D5 na danych nieprodukcyjnych.
- [ ] Zbieramy zarówno błędy, jak i miejsca niezrozumiałe bez podpowiedzi autora.
  Najpierw poprawiamy blokery i utratę pracy, potem kosmetykę.
- [ ] Każda naprawa blokera ma regresję i ponowny odbiór właściwej paczki.
- [ ] Wszystkie P0 zamknięte; pozostałe P1 mają jawnie zaakceptowany status.
- [ ] Brak znanego błędu powodującego utratę danych, pomylenie sesji, wyciek sekretów
  lub niezamierzony zapis. Opisane ograniczenia i działający kanał zgłoszeń.
- [ ] Właściciel zatwierdza publikację, instrukcję i sposób dostarczania poprawek.

**Twoje uwagi B09:**

> Do uzupełnienia: kogo zapraszamy i jakie zadania dajemy.

## Po tej becie — kandydaci, nie ukryte warunki wydania

- Logi Dockera skojarzone z produktem/usługą i środowiskiem.
- Kafka: podgląd topiców, wiadomości i consumer lag jako integracja.
- Diagram relacji PostgreSQL i nawigacja po powiązaniach.
- Integracje observability i powiązania przez service/environment/trace ID.
- SSH, wizualny EXPLAIN, rozbudowane filtry, import CSV/JSON i kolejni providerzy.

## Twoje dodatkowe uwagi — dopisuj bez zmiany numerów B01–B09

| ID | Co przeszkadza / czego brakuje | Oczekiwane zachowanie | Priorytet do uzgodnienia |
| --- | --- | --- | --- |
| U01 |  |  |  |
| U02 |  |  |  |
| U03 |  |  |  |
| U04 |  |  |  |
| U05 |  |  |  |

D1 (systemy), D3 i D4 są potwierdzone. Nadal potrzebujemy minimum macOS, sposobu
podpisywania/dostarczenia paczki, prywatnego kanału bezpieczeństwa i testerów.
Kolejna praca: odbiór dokładnej paczki na czystych Macach oraz pozostałe B01–B09,
bez dokładania nowych integracji. Nie oznaczamy całej bety jako gotowej po samym CI.
