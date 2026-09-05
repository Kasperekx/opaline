# Opaline — plan od alfy do publicznej bety

Data: 2026-09-05. Status: P0 nadal otwarte; główny zakres P1 wdrożony lokalnie, odbiór częściowy; bez publikacji.

**Aktualna lista pozostałych prac i miejsce na uwagi właściciela:**
[Beta — co jeszcze robimy](beta-readiness.md). Poniższy dokument zachowuje historię
i numerację pierwotnych etapów; bieżące decyzje o zakresie i końcowy odbiór opisuje nowa checklista.

Wyniki i dokładne ograniczenia: [raport P0](p0-verification.md) i [raport P1](p1-verification.md). Poniższe odhaczenia
nie zastępują pełnego odbioru natywnego i macierzy platformowej.

To pierwotna checklista etapów P0/P1. Zastępowała wcześniejsze propozycje kolejności,
nie zmieniając historii ukończonych etapów. Numery poniżej są stałe: kolejne zadania
możemy wskazywać jako „etap 2” albo „8C”. Checkbox zaznaczamy dopiero po weryfikacji.

## Zakres i zasady

- Pierwsza beta: desktopowy klient PostgreSQL, Rust + Tauri 2; darmowy, open-source,
  local-first, bez wymaganego konta i bez domyślnej telemetrii.
- Workspace grupuje profile produktu. Profil określa cel połączenia. Sesja posiada
  własne karty i stan pracy. Zmiana widocznej sesji nie zmienia celu istniejącego SQL.
- Production: zapis dostępny po świadomym potwierdzeniu ostrzeżenia. Read-only jest
  niezależnym wyborem profilu, a nie narzuconym domyślnym trybem produkcji.
- P0: warunek wydania. P1: zaplanowane rozszerzenia na drodze do bety, w tym dump
  i odtwarzanie bazy; odłożenie któregoś wymaga jawnej decyzji o zakresie.
- P2: po pierwszej becie. Nie dodajemy go automatycznie do bieżącego zakresu.
- Wspierane platformy i architektury deklarujemy dopiero po ich przetestowaniu.
  Możliwa jest beta tylko na macOS, ale wtedy Windows/Linux nie są ogłaszane jako gotowe.
- SOLID, KISS i DRY: małe komponenty i moduły według odpowiedzialności, wspólne
  mechanizmy tam, gdzie rzeczywiście są używane. Bez abstrakcji na hipotetycznych
  providerów. UI nie wykonuje SQL ani poleceń systemowych bezpośrednio.
- Testy, bezpieczeństwo i dostępność to część każdego etapu, nie ostatnia faza projektu.

## Punkt wyjścia — nie implementujemy ponownie

Istnieją już: profile i workspaces, wiele sesji, systemowy magazyn haseł,
read-only, ostrzeżenie production, TLS i własne CA, edytor SQL, historia i szkice SQL,
przeglądanie i edycja tabel, operacje zbiorcze, eksport CSV/JSON, inspektor struktury
oraz nowy ekran startowy. Wymagają dalszych regresji i testów platformowych.

Weryfikacja UI przy tworzeniu tego planu obejmowała 21 testów frontendu i debugowy build macOS.
Wcześniejsze wyniki testów Rust są opisane oddzielnie w
[raporcie weryfikacji](connections-verification.md). Nie oznacza to zakończonego
audytu bezpieczeństwa ani potwierdzonego działania Windows i Linux.

## Kolejność prac

| Etap | Zakres | Priorytet | Zależności |
| --- | --- | --- | --- |
| 1 | Fundament testowy i ochrona pracy | P0 | Obecna alfa |
| 2 | Przełączanie połączeń i kontekst workspace | P0 | 1 |
| 3 | Cykl życia sesji i bezpieczeństwo transakcji | P0 | 1–2 |
| 4 | Bezpieczeństwo, poprawność danych i plików | P0 | 3 |
| 5 | Wydajność i podstawowy UX desktopowy | P0 | 2–4 |
| 6 | Codzienna praca z SQL | P1 | 1–5 |
| 7 | Praca z danymi i organizacja profili | P1 | 1–5 |
| 8 | Dump i odtwarzanie PostgreSQL | P1 | 3–5; sprawdzane też w 9 |
| 9 | Pełna macierz testów i stabilizacja | P0 | Cały wybrany zakres funkcji |
| 10 | Instalatory, aktualizacje i dokumentacja | P0 | 9; przygotowania możliwe wcześniej |
| 11 | Pilotaż i publikacja bety | P0 | 9–10 |

## Etap 1 — fundament testowy i ochrona pracy

Cel: użytkownik nie traci pracy bez ostrzeżenia, a kolejne zmiany mają powtarzalne testy.

- [ ] Ustalić bazowy zakres systemów, architektur i wersji PostgreSQL do sprawdzenia.
- [ ] Dodać CI: testy frontendu, TypeScript, formatowanie/lint, Rust fmt/Clippy/testy;
  wykonywać testy bazy na jednorazowym PostgreSQL, bez dostępu do baz użytkownika.
- [ ] Wprowadzić wspólny mechanizm wykrywania niezapisanej pracy. Rozróżnić szkic SQL,
  niezapisany plik, edycję wiersza oraz operację będącą w toku.
- [ ] Chronić szkice wierszy przed odrzuceniem przez zmianę strony, sortowanie,
  filtrowanie, odświeżenie, zamknięcie karty, rozłączenie i wyjście z aplikacji.
- [x] Zachowywać szkice SQL oraz umożliwić ich odzyskanie po zamknięciu karty;
  jasno pokazywać błędy lokalnego zapisu i brak miejsca.
- [ ] Przetestować restart, awaryjne zamknięcie, uszkodzoną konfigurację i migrację
  jej wersji. Nie uruchamiać odtworzonego SQL automatycznie.
- [x] Zabezpieczyć konfigurację przed równoczesnym zapisem przez wiele instancji.

Odbiór: szkic przetrwa przełączenie i restart; działania grożące utratą edycji
wymagają decyzji. Symulowany błąd zapisu jest widoczny. Testy regresyjne działają w CI.

## Etap 2 — przełączanie połączeń i kontekst workspace

Cel: przełączanie baz bez ciągłego powrotu do ekranu startowego.

- [x] Zastąpić nieaktywny nagłówek eksploratora dostępnym przyciskiem przełącznika.
- [x] Pokazać wszystkie zapisane profile bieżącego workspace, nie tylko aktywne.
  Dodać wyszukiwanie, zaznaczenie bieżącego profilu, środowisko, dostęp i status.
- [ ] Aktywny profil otwiera swoją istniejącą sesję. Rozłączony przechodzi przez
  łączenie i istniejące potwierdzenie production; anulowanie/błąd nie zmienia widoku.
- [x] Dodać akcje: nowe połączenie w tym workspace, zarządzanie nim, zmiana workspace.
- [x] Zachować globalny pasek otwartych sesji. Jednoznacznie odróżnić go od kart SQL
  i tabel należących do pojedynczego połączenia.
- [ ] Obsłużyć klawiaturę i powrót fokusu. Globalne skróty reagują tylko w aktywnej
  sesji i nie przechwytują zdarzeń formularzy ani ukrytych widoków.

Odbiór: Local → Staging → Local zachowuje karty, wyniki i szkice; żadne zapytanie
nie zmienia docelowej bazy. Scenariusz przechodzi także z dwoma workspace’ami.

## Etap 3 — cykl życia sesji i bezpieczeństwo transakcji

Cel: UI przedstawia rzeczywisty stan połączenia i zapisu, także po awarii.

- [ ] Spójne stany: łączenie, aktywna, zajęta, utracona, wymagająca reconnect,
  rozłączanie i rozłączona. Błędy połączenia docierają z Rust do UI.
- [ ] Reconnect zachowuje szkice i nie uruchamia SQL; stare wyniki są oznaczone
  jako nieodświeżone. Obsłużyć uśpienie, brak sieci i restart serwera.
- [ ] Rozróżnić błąd uwierzytelnienia, DNS, uprawnień, TLS i niedostępność magazynu haseł.
- [x] Ustalić bezpieczną politykę transakcji: auto-commit, otwarta transakcja,
  błąd transakcji oraz jej własność. Zapobiec nieświadomemu współdzieleniu transakcji
  przez ręczny SQL i edycję tabel. Nie ogłaszać trwałego zapisu przed COMMIT.
- [x] Określić zachowanie przy błędzie zapytania wieloinstrukcyjnego i przy wyjściu
  z otwartą transakcją. Nieobsługiwane przypadki blokować z wyjaśnieniem.
- [ ] Timeout i anulowanie objąć SQL, tabele, metadane i eksport. Rozróżnić
  żądanie anulowania od potwierdzonego zakończenia; sprawdzić opóźnione anulowanie.
- [ ] Nie ponawiać automatycznie zapisów po utracie odpowiedzi. Pokazać, gdy wynik
  operacji jest nieznany i wymaga sprawdzenia.
- [ ] Zamykać połączenia i zadania bez wycieków zasobów oraz wiszących blokad.

Odbiór: awarie nie pozostawiają fałszywego „Connected” lub „Saved”; anulowanie jednej
sesji nie dotyka drugiej. Testy obejmują błędy transakcji i nieznany wynik zapisu.

## Etap 4 — bezpieczeństwo, poprawność danych i plików

- [ ] Przejrzeć izolację session ID, walidację IPC, uprawnienia Tauri, CSP, dostęp
  do plików i parametryzację SQL. Dodać regresje dla ujawnionych problemów.
- [ ] Ponownie sprawdzić read-only i wszystkie ścieżki dostępu do production,
  TLS, własne CA oraz brak niejawnego przesyłania hasła do zmienionego celu.
- [ ] Audyt zależności Rust/JS, skan sekretów w źródłach, historii i artefaktach;
  usunąć blokujące podatności lub ograniczyć narażony zakres przed wydaniem.
- [ ] Diagnostyka bez automatycznego zbierania haseł, SQL i danych. Dodać możliwość
  wyłączenia historii; opisać lokalne przechowywanie szkiców i ich czyszczenie.
- [ ] Testy wartości: bigint, numeric, daty/strefy czasowe, NULL, JSON, tablice,
  Unicode, typy niestandardowe. Zachować precyzję; nieobsługiwane edycje ograniczyć.
- [ ] Sprawdzić klucze złożone, konflikty optymistycznego zapisu, RLS/uprawnienia,
  ograniczenia, triggery i zmiany schematu podczas pracy.
- [ ] Sprawdzić eksport: uprawnienia plików, zgodę na nadpisanie, brak miejsca,
  anulowanie, sprzątanie plików tymczasowych i poprawność odczytu CSV/JSON.

Odbiór: brak znanych błędów powodujących zapis do niewłaściwej bazy, utratę
precyzji lub ujawnienie sekretów. Ograniczenia są jawne i udokumentowane.

## Etap 5 — wydajność i podstawowy UX desktopowy

- [ ] Dodać budżety pamięci wyników w bajtach oraz limity dla wielu result-setów,
  kart i sesji. Ograniczenie danych nie może oznaczać ich cichego uszkodzenia.
- [ ] Zapewnić płynny widok dużych wyników przez wirtualizację lub ograniczony
  sposób prezentacji. Zmierzyć czas startu, pamięć, przełączanie i przewijanie.
- [ ] Sprawdzić duże schematy, wiele kart, szerokie tabele i bardzo duże komórki.
- [ ] Ujednolicić stany pustego widoku, ładowania, błędu, zajętości i powodzenia.
  Usunąć mylące kontrolki; podstawowe funkcje nie mogą być dostępne tylko po hover.
- [ ] Sprawdzić pełną nawigację klawiaturą, fokus, etykiety dostępności,
  kontrast oraz preferencję ograniczonego ruchu.
- [ ] Sprawdzić minimalne okno, duże fonty, skalowanie systemowe i monitory o różnym
  DPI. Zachować resize paneli, natywne sterowanie oknem i skróty Cmd/Ctrl.

Odbiór: reprezentatywne duże dane nie zamrażają aplikacji; podstawowe zadania można
wykonać bez myszy i bez zmniejszania czcionki. Wyniki pomiarów trafiają do raportu.

## Etap 6 — codzienna praca z SQL

- [x] Autocomplete schematów, tabel i kolumn z aktywnej bazy; cache metadanych
  nie miesza połączeń i można go odświeżyć.
- [x] Formatowanie SQL bez zmiany znaczenia, z możliwością cofnięcia.
- [x] Biblioteka zapisanych zapytań per workspace, z jawnym wyborem połączenia
  wykonania. Otwarcie zapisanego zapytania nie uruchamia go.
- [x] Otwieranie i zapis plików .sql, obsługa błędów zapisu i konfliktów pliku.
- [x] Przywracanie zamkniętych kart i podstawowa paleta poleceń/lista skrótów.
- [x] Jasne rozróżnienie szkicu, zapisanego pliku i zmian od ostatniego wykonania.

Odbiór: użytkownik tworzy, formatuje, zapisuje i odzyskuje SQL, a podpowiedzi
pochodzą wyłącznie z wybranego połączenia. Restart nie uruchamia zapytań.

## Etap 7 — praca z danymi i organizacja profili

- [x] Ujednolicić podstawowe interakcje wyników SQL i widoku tabel, zachowując
  rozróżnienie read-only wyniku od edytowalnej tabeli.
- [x] Zaznaczanie i kopiowanie komórek/zakresów, regulacja szerokości kolumn
  oraz podgląd pełnej wartości tekstowej i JSON.
- [x] Przywracanie kart tabel, filtrów, sortowania i ostatniego kontekstu workspace;
  ładowanie danych dopiero po świadomym otwarciu sesji.
- [x] Przenoszenie profili między workspace’ami bez zmiany celu połączenia.
- [x] Bezpieczne usuwanie workspace z jasną decyzją o profilach, szkicach,
  historii i aktywnych sesjach; żadnego kaskadowego usuwania bez zgody.
- [x] Import/eksport profili bez haseł i referencji do cudzych wpisów Keychain.
  Walidacja pliku i świadome rozstrzyganie konfliktów nazw/tożsamości.

Odbiór: kopiowanie nie zmienia wartości ani NULL; przeniesienie profilu nie gubi
jego pracy; import/eksport nie ujawnia sekretów i nie nadpisuje profili bez decyzji.

## Etap 8 — dump i odtwarzanie PostgreSQL

P1, osobna funkcja od istniejącego eksportu CSV/JSON.
Status odhaczeń: implementacja i testy lokalne opisane w raporcie P1, nie pełny
odbiór wszystkich platform/awarii. Pozostała macierz jest wymagana w etapie 9. Miejsce w UI:
menu połączenia → Backup / Restore. Obsługa zadania po stronie Rust, UI prezentuje
wybór, status i diagnostykę. Nie budujemy własnego zamiennika narzędzi PostgreSQL.

### 8A. Narzędzia i kontrakt operacji

- [x] Dołączane binaria PostgreSQL 14–18, automatyczny dobór major, integralność
  i zależności w paczce. Bez instalacji lub konfiguracji klienta przez użytkownika.
  Opcjonalny własny silnik tylko w Advanced. [Weryfikacja](bundled-postgres.md).
- [x] Weryfikować wersję narzędzi, serwera i format dumpa; brak narzędzia lub
  niezgodność ma dawać zrozumiały komunikat przed operacją.
- [x] Oddzielić uruchamianie procesu, jego stan i UI. Bez sklejenia polecenia
  shellowego z danymi użytkownika; bez haseł w argumentach, logach i profilu.
- [x] Zachować ustawienia TLS/CA, wymagane potwierdzenia i uprawnienia. Restore
  jest operacją zapisu — nie wolno nim omijać read-only.

### 8B. Eksport dumpa

- [x] Cała baza albo wybrane schematy/tabele; struktura i dane, sama struktura
  albo same dane. Pokazać ograniczenia zależności przy eksporcie częściowym.
- [x] Pierwsze formaty: archiwum custom i zwykły SQL, z rozpoznaniem formatu
  niezależnym od samego rozszerzenia pliku.
- [x] Natywny wybór celu, zgoda na nadpisanie, bezpieczny plik tymczasowy i finalizacja.
- [x] Stan, czas, logi i anulowanie. Procent tylko jeśli można go wiarygodnie
  wyliczyć; w przeciwnym razie etap i aktywność, bez fikcyjnego postępu.

### 8C. Odtwarzanie dumpa

- [x] Wybór pliku oraz jawny podgląd workspace, hosta, bazy i środowiska docelowego.
  Domyślnie odtwarzanie do istniejącej pustej bazy; jawna zgoda na niepusty cel.
- [ ] Kreator nowej bazy z osobnym wyborem i odpowiednimi uprawnieniami — obecnie
  automatyczne CREATE DATABASE nie jest wdrożone.
- [x] Usuwanie istniejących obiektów wyłączone domyślnie i wymagające oddzielnej
  zgody. Potwierdzenie production nie zastępuje zgody na niszczenie danych.
- [x] Pokazać wymagania dotyczące rozszerzeń, ról, właścicieli i uprawnień.
  Nie obiecywać, że kopia jednej bazy jest kopią całego klastra.
- [x] Ostrzec, że dump może wykonywać kod; import tylko jako świadoma operacja
  na zaufanym pliku, z możliwością przejrzenia treści/zakresu.
- [x] Zatrzymanie po błędzie, jasna polityka transakcyjności i anulowania.
  Nie obiecywać pełnego rollbacku dla każdego trybu; raportować częściowe odtworzenie.
- [x] Ograniczyć konkurencyjne operacje w docelowej bazie, odświeżyć metadane
  i oznaczyć poprzednie wyniki po zakończeniu. Nie przełączać samoczynnie celu zadania.

Odbiór: dump → odtworzenie do jednorazowej bazy → porównanie danych i struktury,
również dla kluczy, sekwencji i indeksów. Testować brak miejsca, brak uprawnień,
zły format, niezgodną wersję, anulowanie i utratę sieci. Nigdy na bazie użytkownika.

Podstawa techniczna: custom obsługuje pg_dump/pg_restore, a skrypt SQL odtwarza się
przez psql. Wersje narzędzi i serwera ograniczają kompatybilność; archiwum nie jest
bezpieczne tylko dlatego, że nie jest zwykłym SQL. Szczegóły:
[pg_dump](https://www.postgresql.org/docs/18/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/current/app-pgrestore.html).

## Etap 9 — pełna macierz testów i stabilizacja

- [ ] Zamrozić zakres funkcji kandydata bety i listę wspieranych konfiguracji.
- [ ] Pełne E2E: utworzenie profilu → połączenie → SQL → tabela → zapis → eksport
  → dump/restore, jeśli w wydaniu → restart i odzyskanie pracy.
- [ ] Natywne testy macOS, Windows i Linux dla każdej deklarowanej architektury;
  obejmują odpowiednio Keychain, Credential Manager i Secret Service.
- [ ] Testy wspieranych wersji PostgreSQL oraz różnych uprawnień i ustawień TLS.
- [ ] Awaryjne scenariusze z etapów 1–8, dłuższe sesje, wiele połączeń, duże dane,
  wybudzanie oraz kontrola wzrostu pamięci.
- [ ] Każdy blokujący błąd ma naprawę, test regresyjny i ponowną weryfikację.
  Zatwierdzone ograniczenia i wyniki testów zapisane w raporcie wydania.

Odbiór: komplet testów przechodzi dla dokładnego kandydata wydania; funkcja
działająca tylko w przeglądarkowym mocku nie jest uznana za przetestowaną natywnie.

## Etap 10 — instalatory, aktualizacje i dokumentacja

- [ ] Powtarzalne buildy release, spójny numer wersji, tag, changelog, sumy kontrolne,
  znane ograniczenia i powiązanie artefaktów z konkretnym commitem.
- [ ] Instalatory odpowiednie dla wspieranych systemów. Instalacja, start,
  aktualizacja, ponowna instalacja i odinstalowanie na czystych maszynach.
- [ ] Skonfigurować tożsamość wydawcy i podpisywanie; dla publicznej dystrybucji
  macOS także notarization. Sprawdzić realny przebieg instalacji na Windows.
- [ ] Bezpiecznie przechowywać sekrety publikacji poza repo. Dostęp do kont,
  certyfikatów i opłat uzgodnić z właścicielem; plan nie autoryzuje zakupów.
- [ ] Na pierwszą betę może wystarczyć aktualizacja ręczna. Jeśli wybierzemy
  auto-update: podpisy, osobny kanał beta, testy przerwania, zgodność konfiguracji
  i plan odzyskania po wadliwym wydaniu.
- [ ] Repo i kanał zgłoszeń, README dla testerów, instrukcja instalacji i pierwszego
  połączenia, szablon błędu, SECURITY.md, zasady prywatności i przegląd licencji zależności.
- [ ] Help / About / Report issue z wersją aplikacji; dobrowolny raport diagnostyczny
  możliwy do przejrzenia przed udostępnieniem.
- [ ] Opisać lokalizację i kopie profili/szkiców/historii, usuwanie danych lokalnych,
  wymagania backup/restore oraz ograniczenia read-only. Bez wymogu konta w aplikacji.

Odbiór: tester instaluje aplikację bez środowiska deweloperskiego, aktualizuje ją
bez utraty profili i potrafi zgłosić problem. Gotowy jest powtarzalny proces publikacji.

Wymagania implementacyjne podpisywania i aktualizacji sprawdzać według
[Tauri macOS signing](https://v2.tauri.app/distribute/sign/macos/),
[Tauri Windows signing](https://v2.tauri.app/distribute/sign/windows/) oraz
[Tauri updater](https://v2.tauri.app/plugin/updater/). Sam podpis Windows nie jest
obietnicą braku ostrzeżeń SmartScreen; wymagany jest rzeczywisty test instalacji.

## Etap 11 — pilotaż i publikacja bety

- [ ] Udostępnić kandydata małej grupie testerów z instrukcją i znanymi ograniczeniami;
  nie sugerować używania go od razu na krytycznej produkcji.
- [ ] Zebrać zgłoszenia, naprawić blokery i ponownie sprawdzić cały kandydat wydania.
- [ ] Potwierdzić kryteria wydania poniżej i uzyskać decyzję o publikacji.
- [ ] Opublikować wersję beta, instrukcje i changelog; ustalić kanał oraz sposób
  dostarczania poprawek. Bez domyślnego przesyłania danych użytkownika.

## Warunki wydania

1. Wszystkie P0 ukończone i zweryfikowane. Lista P1 dostarczonych lub jawnie odłożonych
   jest zapisana; dump/restore pozostaje P1, nie wraca automatycznie do P2.
2. Brak znanych błędów powodujących utratę pracy, niezamierzony zapis, pomylenie
   połączeń lub ujawnienie sekretów.
3. Podstawowy scenariusz przechodzi na każdym reklamowanym systemie i architekturze.
4. Instalacja oraz aktualizacja działają poza komputerem deweloperskim.
5. Testerzy przeszli pełny cykl pracy; blokery usunięto i ponownie sprawdzono.
6. Udokumentowane ograniczenia, odtwarzanie lokalnej konfiguracji i kanał zgłoszeń.

## Definicja ukończenia pojedynczego etapu

- [ ] Zachowanie i przypadki błędów opisane przed implementacją.
- [ ] Implementacja podzielona według odpowiedzialności; bez rozrastania App.tsx
  i kopiowania logiki bezpieczeństwa między widokami.
- [ ] Testy pozytywne, negatywne i regresyjne adekwatne do ryzyka.
- [ ] Kontrola UI, klawiatury i responsywności, jeśli etap zmienia interfejs.
- [ ] Build i uzgodnione kontrole CI przechodzą; ograniczenia są zapisane.
- [ ] Wynik pokazany użytkownikowi, checklista uaktualniona, dalszy zakres nie
  rozszerzony samoczynnie. Planowanie nie oznacza zgody na publikację lub kasowanie danych.

## Po pierwszej becie — P2

- Tunel SSH, chyba że okaże się wymaganiem pierwszej grupy testerów — wtedy osobna
  decyzja o zmianie zakresu przed betą.
- Rozbudowany panel transakcji; bezpieczna podstawowa polityka pozostaje P0 w etapie 3.
- Wizualny EXPLAIN, diagram relacji, porównanie schematów i kreatory migracji/DDL.
- Import danych CSV/JSON, harmonogramy backupów, backup całego klastra i PITR.
  To nie to samo co dump/restore pojedynczej bazy zaplanowany w etapie 8.
- Zaawansowane filtrowanie, personalizacja widoków, kolejne providery.
- Synchronizacja, współpraca, pluginy i aplikacje mobilne.
