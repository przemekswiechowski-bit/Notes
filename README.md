# Notes

Lekki notatnik webowy w stylu Google Keep. Aplikacja jest statyczna, bez backendu i bez frameworkow. Dane notatek sa zapisywane lokalnie w przegladarce przez IndexedDB.

## Live demo

GitHub Pages:

https://przemekswiechowski-bit.github.io/Notes/

## Current status

- static frontend bez backendu,
- local-first storage przez IndexedDB,
- dziala na GitHub Pages,
- dziala na desktopie i na mobile z dwukolumnowym ukladem kart,
- wspiera import i eksport JSON,
- nie ma jeszcze cloud sync.

## Data storage warning

- dane z `http://127.0.0.1:4173/` i dane z GitHub Pages to osobne bazy,
- kazde urzadzenie i kazdy origin przegladarki ma osobna lokalna baze IndexedDB,
- przed wdrozeniem syncu reczne przenoszenie danych miedzy srodowiskami odbywa sie przez eksport i import JSON.

## Next milestone

Kolejny wiekszy etap to Google Drive sync dla tej samej aplikacji frontendowej hostowanej na GitHub Pages.

## Google Drive sync setup - planned/auth scaffold

Auth scaffold jest przygotowany, ale sam sync danych nie jest jeszcze wdrozony.

Na tym etapie:

- aplikacja potrafi przygotowac flow logowania Google pod przyszly Drive sync,
- nadal nie zapisuje notatek do Google Drive,
- do uruchomienia logowania potrzebny jest OAuth Client ID typu Web application.

Client ID trzeba wpisac w:

- `src/config.js`

Authorized JavaScript origins, ktore trzeba bedzie dodac w Google Cloud Console:

- `https://przemekswiechowski-bit.github.io`
- `http://127.0.0.1:4173`
- `http://localhost:4173`

Wazne:

- frontend nie uzywa i nie powinien uzywac `client secret`,
- nie commitujemy tokenow ani danych logowania do repozytorium.

## Uruchomienie lokalne

W katalogu projektu uruchom prosty serwer statyczny:

```powershell
cd L:\Users\PC\Desktop\Notes
python -m http.server 4173 --bind 127.0.0.1
```

Potem otworz:

```text
http://127.0.0.1:4173/
```

Nie trzeba wrzucac aplikacji na GitHuba, zeby ja podejrzec lokalnie. GitHub Pages bedzie potrzebny dopiero do publicznego hostingu.

## Testy

Testy logiki:

```powershell
npm.cmd test
```

Test E2E:

```powershell
npm.cmd run test:e2e
```

Test E2E wymaga uruchomionego serwera lokalnego pod `http://127.0.0.1:4173/` i Chrome zainstalowanego w standardowej lokalizacji Windows. Test startuje osobny, tymczasowy profil Chrome `notes-e2e-profile`, czysci go po zakonczeniu i nie powinien dotykac danych z normalnej przegladarki uzytkownika.

Nie uruchamiaj bezposrednio `tests/e2e-cdp.mjs`. Ten plik ma blokade bezpieczenstwa i powinien byc startowany przez `tests/run-e2e.ps1` albo `npm.cmd run test:e2e`.

## Deployment on GitHub Pages

Projekt jest przygotowany jako statyczna aplikacja frontendowa i nie wymaga backendu.

Kroki publikacji:

1. wrzuc pliki projektu do repozytorium GitHub, np. `Notes`,
2. zostaw pliki w katalogu glownym repozytorium,
3. w GitHub: `Settings -> Pages`,
4. jako zrodlo wybierz:
   - `Deploy from a branch`
   - branch: `main` lub `master`
   - folder: `/ (root)`,
5. po publikacji aplikacja bedzie dostepna pod adresem zblizonym do:
   - `https://nazwa-uzytkownika.github.io/Notes/`

Uwagi:

- aplikacja uzywa wzglednych sciezek (`./styles.css`, `./src/app.js`, `./`), wiec powinna dzialac poprawnie z podfolderu GitHub Pages, np. `/Notes/`,
- dane notatek nie trafiaja do repozytorium ani na GitHub Pages,
- dane sa trzymane lokalnie w IndexedDB przegladarki dla konkretnego originu, wiec publikacja pod GitHub Pages bedzie miala osobna lokalna baze niz wersja uruchamiana lokalnie,
- jesli chcesz przeniesc notatki miedzy lokalna wersja i GitHub Pages, uzyj eksportu i importu JSON.

## Aktualny stan MVP

Dziala:

- tworzenie, edycja i autosave notatek,
- lokalny zapis w IndexedDB,
- dlugie notatki, w tym test 30 000 znakow,
- krotki podglad na karcie i pelna tresc w edytorze,
- kopiowanie pelnej tresci notatki,
- przypinanie,
- archiwum i przywracanie z archiwum,
- kosz, przywracanie i trwale usuwanie,
- wyszukiwanie po tytule i tresci,
- proste etykiety,
- kolory notatek,
- import i eksport JSON,
- gest/przeciagniecie w prawo do archiwizacji,
- tryb jasny i ciemny,
- responsywny uklad na desktop i telefon,
- zwijany lewy panel.

Znane ograniczenia:

- brak Google Drive sync w MVP,
- brak PWA, manifestu i service workera,
- dane sa lokalne dla konkretnej przegladarki/profilu/urzadzenia,
- etykiety sa proste, bez pelnego menedzera,
- test E2E zaklada lokalny Chrome i wolny port DevTools `9333`.

Przygotowane pod pozniejszy Google Drive sync:

- model danych zawiera pola `version`, `dirty` i `syncStatus`,
- jest wydzielona warstwa danych IndexedDB,
- operacje domenowe sa w repozytorium notatek,
- istnieje placeholder `syncService.js`,
- import/eksport i scalanie danych sa dobrym punktem startu pod przyszly merge lokalnych i zdalnych notatek.

## Bezpieczenstwo danych

Repozytorium i GitHub Pages maja zawierac tylko frontend. Nie zapisujemy w kodzie prywatnych notatek, sekretow, tokenow ani danych uzytkownika.
