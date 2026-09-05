# Plan UX: edycja danych bezpośrednio w tabeli

Data: 2026-09-05  
Status: **wdrożono wariant A po akceptacji „implementuj”**. Wyniki kontroli i ograniczenia: [raport wdrożenia](inline-table-editing-verification.md).

## Cel

Usunąć stałą kolumnę z ołówkiem i koszem. Edytować pojedynczą komórkę w miejscu,
zachowując czytelny podział między zmianą roboczą a danymi zapisanymi w PostgreSQL.
Zachować obecną stylistykę, czytelną typografię i gęstość tabeli; bez dużych
powiadomień sukcesu i bez formularza całego wiersza po dwukliku.

## 1. Przyjęta decyzja: co oznacza Enter?

**Przyjęty wariant A: zmiany oczekujące na zapis.**

- Dwuklik otwiera edytor komórki.
- Enter zatwierdza wartość lokalnie, zamyka edytor i oznacza komórkę jako zmienioną.
- „Zapisz zmiany” / Cmd+S na macOS / Ctrl+S na Windows i Linux zapisuje oczekujące
  zmiany **aktywnej tabeli**, nie wszystkich kart ani połączeń.

To świadoma propozycja doprecyzowania prośby o zapis Enterem: w tym wariancie
**Enter nie wysyła jeszcze UPDATE do bazy**. Można poprawić kilka pól, zobaczyć
różnice i zapisać je razem. Oznaczenie „niezapisane” utrzymuje się do udanego zapisu.

**Alternatywa B: Enter zapisuje komórkę bezpośrednio do PostgreSQL.**
Wtedy stan niezapisany występuje tylko podczas edycji, wysyłania lub po błędzie;
nie ma bufora kilku zmian. Cofnięcie zakończonego zapisu wymaga kolejnego UPDATE
i może wywołać triggery ponownie. Jeżeli użytkownik wybierze B, należy dostosować
poniższy plan; nie budujemy na start dwóch przełączanych trybów.

Dalsza część dokumentu opisuje wdrożony wariant A. Wariant B pozostaje wyłącznie historyczną alternatywą.

## 2. Zachowanie komórki

- Pojedynczy klik: zaznaczenie. Strzałki i zaznaczanie zakresu działają jak dotąd.
- Dwuklik lub F2: edycja wyłącznie wskazanego pola; bez zmiany wysokości wiersza.
- Enter: walidacja i zatwierdzenie lokalnego szkicu; fokus zostaje na komórce.
- Tab / Shift+Tab: zatwierdzenie lokalne i przejście do następnego/poprzedniego
  edytowalnego pola. Na końcu siatki fokus może ją opuścić.
- Escape: anulowanie bieżącej edycji do wartości sprzed jej otwarcia, bez
  odrzucania wcześniejszych zmian w innych komórkach.
- Klik poza polem: poprawna wartość trafia do bufora, nigdy automatycznie do bazy.
  Niepoprawna pozostaje jako szkic z błędem; nie ginie przy przeniesieniu fokusu.
- Powrót do wartości oryginalnej usuwa oznaczenie zmiany i aktualizuje licznik.
- JSON i długi tekst: mały rozwijany edytor przy komórce, z opcją większego
  podglądu. W edytorze wielowierszowym Enter dodaje linię, a przycisk „Zastosuj”
  lub Cmd/Ctrl+Enter zatwierdza wartość lokalnie.
- Boolean i enum: odpowiednia kontrolka. NULL jest osobnym stanem, nie pustym
  tekstem ani napisem „NULL”. Liczby o dużej precyzji nie przechodzą przez JS Number.

Dotychczasowy podgląd pełnej wartości pozostaje w menu kontekstowym i przycisku
„Inspect value”. W wynikach dowolnego SQL oraz polach read-only dwuklik nadal
otwiera podgląd, nie edycję. Nie rozszerzamy edycji na wyniki JOIN-ów.

## 3. Jak widać niezapisane zmiany

| Stan | Sposób prezentacji |
| --- | --- |
| Aktywna edycja | Czytelny obrys pola i kursor |
| Zmieniona komórka | Subtelne bursztynowe tło, mały znacznik i opis „Niezapisana zmiana” |
| Zmieniona tabela | Znacznik przy nazwie karty; opis dostępny również z klawiatury |
| Oczekujące zmiany | Kompaktowy pasek nad paginacją, poza przewijanym obszarem danych |
| Błąd | Wskazane pole lub wiersz, krótki komunikat; szkic zostaje |
| Zapis w toku | „Zapisywanie…” w tym samym pasku i blokada ponownego wysłania |
| Zapis udany | Usunięcie oznaczeń i krótki status w pasku; bez toastu do zamknięcia |

Przykładowa treść paska: „3 zmienione pola w 2 wierszach · Jeszcze nie zapisano
w bazie” oraz akcje „Przejrzyj”, „Odrzuć”, „Zapisz zmiany”. Pasek nie występuje,
gdy nie ma zmian. Na małej szerokości akcje zawijają się, ale pozostają dostępne.

„Przejrzyj” pokazuje stare i nowe wartości oraz identyfikator wiersza.
Menu komórki pozwala cofnąć jedną zmianę, ustawić NULL i otworzyć pełną wartość.
Stan nie może być rozpoznawalny wyłącznie po kolorze; potrzebne są opisy i
komunikaty dostępności. Informacje o zmianach są lokalne, bez telemetrii wartości.

## 4. Dodawanie i usuwanie

- Usuwamy kolumnę akcji także z nagłówka. Zostawiamy wąski obszar zaznaczania
  wierszy; kontrolki zapisu i odrzucenia nie pojawiają się zamiast ołówka.
- „Add row” dodaje roboczy wiersz z etykietą „Nowy — niezapisany”, obsługą
  DEFAULT/NULL i polami generowanymi przez bazę jako nieedytowalnymi.
- Usunięcie przez menu kontekstowe lub akcję dla zaznaczonych wierszy jedynie
  oznacza je jako „Do usunięcia”; pozostają widoczne i można cofnąć oznaczenie.
- Delete/Backspace w edytorze usuwa tekst, nigdy cały rekord.
- Podsumowanie rozróżnia aktualizacje, nowe wiersze i usunięcia. Usunięcia są
  potwierdzane przed wysłaniem, z liczbą rekordów i jednoznacznym celem.
- Usunięcie nowego, jeszcze niezapisanego wiersza tylko usuwa lokalny szkic.
  Oznaczenie istniejącego zmodyfikowanego wiersza do usunięcia nie wysyła UPDATE;
  cofnięcie oznaczenia przywraca jego wcześniejszy szkic.

## 5. Zapis i ochrona pracy

- Bufor jest przypisany do sesji, karty i tabeli. Zmiana aktywnej karty lub
  połączenia zachowuje go w pamięci, bez zapisu i bez zbędnego potwierdzenia.
- W pierwszym zakresie odświeżenie, filtr, sortowanie, zmiana strony lub rozmiaru
  strony przy zmianach wymagają wyboru „Zapisz / Odrzuć / Anuluj”. Nie gubimy
  szkiców ani nie sugerujemy, że sortowanie serwerowe uwzględnia niezapisane dane.
- Zamknięcie karty, rozłączenie i zwykłe zamknięcie aplikacji korzystają z ochrony
  niezapisanej pracy. Przy błędzie zapisu nie kontynuujemy opuszczania widoku.
- Szkice wartości rekordów pozostają w RAM: bez zapisu danych bazowych do
  localStorage. Ta iteracja nie obiecuje odzyskania szkiców po awarii procesu.
- Cmd/Ctrl+S jest kontekstowe: aktywna tabela zapisuje dane, edytor SQL zapisuje
  plik. Niedokończone pole przechodzi walidację przed wysłaniem; ukryte karty nie
  reagują na skrót. Niepoprawna wartość blokuje zapis całego zestawu.
- Każdy zmieniony wiersz identyfikujemy oryginalnym PK i wersją; nie numerem
  wiersza ani zmienioną wartością klucza. Kilka pól jednego wiersza tworzy jeden UPDATE.
- Zestaw zmian aktywnej tabeli trafia do jednej krótkiej transakcji w Rust.
  Błąd walidacji, konflikt wersji lub błąd SQL wycofuje cały zestaw; nie wykonujemy
  niezależnych zapisów komórek w pętli z częściowymi commitami.
- Nie trzymamy otwartej transakcji podczas pisania. Zachowujemy parametryzację
  wartości, walidację metadanych, kontrolę wersji oraz backendowe read-only.
- Konflikt pozostawia szkice do porównania z aktualnymi danymi; nie nadpisujemy
  rekordu automatycznie. Brak PK, widoki i pola generowane zachowują ograniczenia
  oraz wyjaśnienie przy próbie edycji.
- Zapis na production pozostaje dostępny po ostrzeżeniu, zgodnie z wcześniejszą
  decyzją. Nie wymuszamy read-only. Środowisko i docelowe połączenie są widoczne
  przy zapisie, a polityka potwierdzeń jest wspólna z istniejącymi zabezpieczeniami.
- Utrata połączenia podczas COMMIT może oznaczać nieznany wynik. Pokazujemy ten
  stan osobno, zachowujemy szkic i blokujemy ślepe ponowienie, szczególnie INSERT.
- Udany zapis aktualizuje wartości i wersje zwrócone przez bazę. Błąd późniejszego
  odświeżenia nie może udawać nieudanego zapisu ani ponownie wysyłać tej operacji.

## 6. Plan techniczny i kolejność prac po akceptacji

Przed wdrożeniem `TableDataGrid` miał osobną kolumnę akcji, `useTableData` trzymał szkic
jednego wiersza, a `GridInteractions` przeznacza dwuklik i Enter na inspektor.
Backend miał już parametryzowane aktualizacje z PK i wersją `xmin`; istniejąca
aktualizacja zbiorcza ustawia jedną wartość kolumny wielu rekordom. Nie zastępuje
to atomowego zapisu różnych zmian wielu wierszy.

1. **Model zmian i zapis:** wydzielić czyste operacje bufora oraz hook szkiców
   tabeli; określić stany edycji, walidacji, zapisu i nieznanego wyniku. Dodać
   dedykowaną komendę atomowego zapisu zestawu zmian i testy Rust.
2. **Edycja istniejących pól:** podłączyć aktywną komórkę do istniejących
   kontrolek typów, dwuklik/F2 i klawiaturę. Dodać oznaczenia, pasek i podgląd
   różnic; usunąć kolumnę ołówka/kosza. Inspektor pozostaje dostępny osobno.
3. **Spójne operacje na wierszach:** przenieść dodawanie, usuwanie i dotychczasową
   masową aktualizację do tego samego bufora. Jedno źródło stanu, walidacji i zapisu.
4. **Ochrona i dopracowanie:** integracja z `WorkSafety`, skrótami aktywnej karty,
   błędami i konfliktem; testy dostępności oraz małych okien i długich wartości.

Granice odpowiedzialności: stan i transformacje szkiców, edytor komórki,
prezentacja zmian oraz API zapisu. Reużywamy kontrolek typów i zabezpieczeń;
nie rozbudowujemy `TableDataGrid` ani `useTableData` o cały kolejny monolit.
Nie projektujemy przy tej okazji uniwersalnego frameworka dla innych providerów.

## 7. Kryteria odbioru

- Dwuklik edytuje tylko właściwą komórkę; nie otwiera równocześnie inspektora.
- Enter w wariancie A nie wywołuje zapisu do bazy; zapis aktywnej tabeli wysyła
  jeden zestaw zmian. Wszystkie stany niezapisane są widoczne aż do potwierdzenia.
- Escape i cofnięcie pojedynczej zmiany nie niszczą pozostałych szkiców.
- Walidacja, NULL, DEFAULT, puste wartości, enum, JSON, czas i duże liczby
  zachowują dane bez ukrytych konwersji.
- Błąd jednego wiersza wycofuje transakcję; konflikt i nieznany wynik nie
  prowadzą do automatycznego ponowienia ani utraty szkiców.
- Powrót do karty zachowuje zmiany. Opuszczenie widoku wymagające ich utraty
  zawsze daje wybór; read-only jest egzekwowane również w Rust.
- Zaznaczanie, kopiowanie zakresu, inspekcja, szerokości kolumn, przewijanie
  i wyniki SQL nie mają regresji. Zmiana komórki nie powoduje skakania layoutu.

Poza zakresem: cofanie zatwierdzonych transakcji, edycja wyników dowolnego SQL,
automatyczne rozwiązywanie konfliktów, odzyskiwanie szkiców z dysku i masowe
wklejanie arkusza. Dalsze funkcje dopiero po sprawdzeniu podstawowego przepływu.
