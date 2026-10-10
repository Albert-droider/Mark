# MARK — van reader naar lees- en denkwerkplek

**Status:** stappen 0.1–0.4 geïmplementeerd; onafhankelijke review van dat fundament: OK met kanttekeningen. De nieuwe reader/editor-shell heeft automatische/browser-verificatie en parent self-review, geen nieuwe onafhankelijke review. Native handmatige acceptatie volgt. Stap 0.5 en de volledige workspace wachten op de keuzes uit §8.
**Checkpoints:** [reader-fundament](specs/verifications/reader-foundation.md) en [reader/editor-shell](specs/verifications/reader-editor-shell.md).
**Nieuwe shell:** Attach hersteld, gegroepeerde topbar, afzonderlijk Markdown-schrijfvlak, vrije documentconcepten, bronkopie bewerken en expliciet Markdown/CSV/agentcontext delen. Dit brengt delen van 1.2/1.3 naar voren; een volledig notebook, bibliotheek, zoekindex of board is nog niet gebouwd.
**Auditbasis:** MARK 0.4.0, `main` op commit `c8fb838`.
**Doel van dit document:** de afgesproken richting bewaren en de bouw in kleine, toetsbare stappen voortzetten.

> MARK is een rustige lees- en denkwerkplek: van bron naar eigen inzicht, en van inzicht naar toepassing.

De reader blijft het hart. Notebooks en whiteboards vormen de werktafel ernaast. De winst moet uit een betere werkwijze komen, niet uit tien keer meer functies. Een meetbare 10×-verbetering is nog geen bewezen resultaat.

## 1. Productrichting en grenzen

Voor de eigenaar van MARK: boeken lezen, studeren, ideeën uitwerken en codekennis bewaren.

**Hoofdketen:** lezen → passage vastleggen → eigen uitleg schrijven → verbinden → toepassen → terugvinden.

**Binnen scope:** betrouwbare annotaties; duurzame lokale opslag; bibliotheek; reader naast notebook; bronlinks; gezamenlijk zoeken; boards met gedeelde notities; codevoorbeelden en een kleine leerloop.

**Buiten de eerste versie:** cloudaccounts, realtime samenwerking, pluginplatform, volledige IDE, terminal, taakmanagement en verplichte AI. PDF/EPUB, peninvoer en synchronisatie vereisen eerst een aparte keuze.

Behoud de rustige typografie, document- en boekweergave, inhoudsopgave, code, wiskunde, diagrammen, audio en meelezende tekst. Geen framework-rewrite als voorwaarde voor workspace-features.

## 2. Audit: wat vaststaat

| Bevinding | Bewijs en gevolg |
| --- | --- |
| Highlights kunnen verkeerd landen | Selecteer `target` in `Beta target gamma.` ná `Alpha target omega.`: de eerste alinea wordt gemarkeerd. `src/highlights.ts:76–81` gebruikt een quote-fallback per tekstnode; `src/highlights.ts:160–164` stopt voordat latere contextmatches worden onderzocht. |
| Onopgeslagen concept gaat verloren | Selecteer tekst, open Note, typ, scroll en open opnieuw: het concept is leeg. Scroll sluit de popup in `src/viewer.ts:79–84`; opnieuw openen reset de invoer in `src/viewer.ts:351–355`. |
| Opslagfout blijft onzichtbaar | Bij een gesimuleerde `QuotaExceededError` rapporteert toevoegen een highlight, terwijl niets is opgeslagen. `src/highlights.ts:51–56` negeert de fout. Dit bewijst foutafhandeling, niet dat de huidige opslag vol is. |
| Identiteit is kwetsbaar | `src/viewer.ts:95` gebruikt bestandspad of browserbestandsnaam. Verplaatsen/hernamen verbreekt de lookup; browserbestanden met dezelfde naam kunnen botsen. |
| Leesplek hangt aan recente bestanden | `src/store.ts:141` begrenst recent op 25; `src/store.ts:238–244` snoeit andere leesplekken. Dit verwijdert geen highlights. |
| Geen complete workspace | Notities zijn eigenschappen van selectie-groepen. Bibliotheek, zelfstandig notebook, board-editor en zoeken over bronnen/notities ontbreken. Alleen Markdown/TXT worden werkelijk gelezen. |
| Kleine vensters hebben een layoutgap | Browsercontrole op 460×340: header circa 513 px breed en Close buiten beeld. De ingestelde native minimummaat is 460×340; native vensterknoppen apart testen. |
| Dependencies vragen onderhoud | Audit: vier getroffen dependencyvermeldingen, 1 high, 1 moderate, 2 low. High: `linkify-it` (GHSA-v245-v573-v5vm); moderate: `markdown-it` (GHSA-253c-mchw-3w2r), beide parser-DoS. KaTeX/Mermaid-meldingen overlappen. Geen exploitproef uitgevoerd. |

**Gecontroleerde baseline:** 91 frontendtests geslaagd, één fixture-afhankelijke alignmenttest overgeslagen; zes Rust-tests geslaagd; TypeScript/Vite-build geslaagd. Browsercontrole: Markdown, boeknavigatie, diagrammen, wiskunde en bovenstaande foutscenario's. Native installer en echte audioplayback nog niet end-to-end gecontroleerd.

De hoofd-JS-bundle is circa 1,778 MB ongecomprimeerd / 576 KB gzip. Opstartvertraging is niet gemeten. Mermaid wordt al dynamisch geladen; optimalisatie daarvan niet opnieuw als ontbrekende feature voorstellen.

## 3. Ontwerpcontracten

1. **Eigen werk gaat niet stil verloren.** Concepten overleven popup sluiten, scrollen, bron wisselen en opnieuw starten. Een opslagfout geeft een zichtbare, herstelbare toestand.
2. **Bronnen blijven standaard ongewijzigd.** MARK schrijft eigen notities en metadata, niet automatisch in het gelezen boek of projectbestand.
3. **Geen gok als bronverwijzing.** Bewaar quote/context en, in het nieuwe ankermodel, bronpositie met bronversie. Een positie is alleen geldig als versie en geselecteerde tekst overeenkomen. Beoordeel contextmatches over het hele document vóór quote-fallbacks; onopgeloste meervoudige matches worden ambigu, niet willekeurig toegewezen. Bied herstel aan.
4. **Een notitie bestaat zelfstandig.** Een verdwenen passage verwijdert of verbergt de eigen tekst niet. Vrije notities zonder passage zijn mogelijk.
5. **Een notitie heeft één identiteit.** Notebook en board verwijzen naar dezelfde notitie. Bewerken werkt overal door; verwijderen van een plaatsing verwijdert niet de notitie.
6. **Lezen blijft rustig.** Werkpanelen kunnen dicht; Document/Book blijven leesweergaven, geen aparte workspace-producten. Smalle vensters behouden toegang tot alle acties.
7. **Data blijft van de gebruiker.** Versies, backup, export, import en expliciete bron-herkoppeling horen bij het fundament.
8. **Code wordt niet vanzelf uitgevoerd.** Snippets zijn kennisobjecten. Markdown blijft gesanitiseerd; nieuwe schrijfacties mogen niet buiten de gekozen workspace schrijven via ongecontroleerde paden.

## 4. Gedeeld model en opslag

| Bouwsteen | Verantwoordelijkheid en reden |
| --- | --- |
| Source | Stabiel ID, titel, type, huidige locatie en versie-informatie. Het pad is een locatie, geen identiteit; gewijzigde bronnen blijven herkenbaar. |
| Excerpt | Citaat/snapshot met Source-ID en anker(s), plus gevonden/ambigu/ontbrekend-status. Houdt bronbewijs apart van eigen interpretatie. |
| Note | Stabiel ID, eigen Markdown, optionele Excerpt-verwijzingen en eenvoudige metadata. Dezelfde uitleg kan op meerdere plekken gebruikt worden. |
| Notebook | Geordende tekst en verwijzingen naar notities/passages. Ondersteunt doorlopend schrijven, niet alleen losse kaarten. |
| Board | Plaatsingen, groepen en verbindingen met verwijzingen naar bestaande objecten. Slaat ruimtelijke ordening op, niet kopieën van notities. |

**Voorstel, nog te besluiten:** een lokale workspace met één opslagbron achter een kleine repository-interface. Tauri beheert duurzame schrijfacties; UI-code bepaalt niet zelf wanneer een wijziging werkelijk opgeslagen is. Kies filesystem/Markdown/JSON of SQLite vóór stap 0.5, op basis van herstelbaarheid, transacties, zoekbehoefte en handmatige bewerkbaarheid. Bouw niet tegelijk twee concurrerende opslagbronnen.

Browseropslag is geen stilzwijgend equivalent van een desktopworkspace. Behoud de huidige browserreader; beslis apart hoe ver workspace-functionaliteit daar moet gaan. Geen nieuwe runtimepackages kiezen zonder brononderzoek en concrete noodzaak.

**Migratie is onderdeel van de feature:**
- Vóór iedere wijziging aan bestaande opslag: bewaar een ruwe backup. De gebruikersgerichte export volgt in 0.3; werk tot die tijd met geïsoleerde testdata.
- Maak eerst een export van bestaande `mark.highlights.v1`, instellingen, recente bestanden en leesplekken. Bewaar de oorspronkelijke data totdat de migratie gecontroleerd is.
- Migreer selectie-groepen met meerdere tekstnode-ankers naar één Excerpt en maximaal één bijbehorende bestaande Note, niet één notitie per tekstnode.
- Leg een stabiele mapping van oude paden/groepen naar nieuwe IDs vast. Herhaald uitvoeren veroorzaakt geen duplicaten.
- Valideer invoer en schema-versies. Corrupte of onbekende data niet als lege bibliotheek overschrijven.
- Onderbreking of schrijf-fout laat de vorige geldige versie herstelbaar. Toon pas 'opgeslagen' na bevestiging door de opslaglaag.
- Export/import behoudt IDs, tekst, relaties en boardposities. Meld ontbrekende bronbestanden en bied herkoppeling; beloof geen volledige backup als externe boeken niet zijn meegenomen.

## 5. Bouwvolgorde

Stappen **0.1–0.4 zijn geïmplementeerd**: 130 frontendtests, 9 Rust-tests en 23 browserchecks geslaagd; één bestaande fixturetest overgeslagen. De afvinkvakjes blijven open tot de native handmatige acceptatie uit §7. Alle stappen vanaf 0.5 zijn nog open en hun keuzes niet bevestigd. Per stap: regressietest eerst, klein implementeren, verifiëren en pas daarna afvinken. Toekomstige testbestanden bestaan nog niet allemaal.

### Fase 0 — vertrouwen en fundament

- [ ] **0.1 Correcte ankers (P0).** Los contextmatching over verschillende tekstnodes op. Test dubbele quotes, verdwenen context, wijzigingen en gewijzigde inline-opmaak. Een onzekere match krijgt geen willekeurige markering.
  - Acceptatie: de tweede `target` blijft de tweede; bestaande eenvoudige en multi-node-highlights werken; onoplosbare verwijzingen blijven zichtbaar in een hersteloverzicht.
  - verify: `npm test -- src/__tests__/highlights.test.ts src/__tests__/viewer-highlight.test.ts`
- [ ] **0.2 Duurzame concepten (P0).** Scheid editorconcept en anker van de tijdelijke selectie-popup; bewaar per bron/notitie. Concepten alleen verwijderen na geslaagd opslaan of expliciet weggooien.
  - Acceptatie: tekst blijft behouden na scroll, popup sluiten, bron wisselen en herstart; late saves schrijven niet in een ander document. Opslagfalen houdt het concept beschikbaar en meldt het probleem.
  - verify: `npm test -- src/__tests__/viewer-highlight.test.ts src/__tests__/drafts.test.ts`
- [ ] **0.3 Opslagstatus en legacy-export (P0).** Geef schrijffouten door; bied opnieuw proberen en een export voordat het schema verandert. Ook corrupte opslag moet herstelbaar blijven.
  - Acceptatie: quota-fout levert geen valse 'opgeslagen'-status; export bevat alle bestaande groepen/notities; corrupte data wordt niet stil vervangen.
  - verify: `npm test -- src/__tests__/highlights.test.ts src/__tests__/store.test.ts src/__tests__/legacy-export.test.ts`
- [ ] **0.4 Dependency-onderhoud (P0).** Beoordeel advisories en werk gericht bij. Geen automatische major upgrades/downgrades via `audit fix --force`.
  - Acceptatie: geen onopgeloste critical/high advisory in de documentparser; resterende meldingen onderbouwd vastleggen; Markdown, math, Mermaid en audio blijven werken.
  - verify: `npm audit --omit=dev` (rapport beoordelen), `npm test`, `npm run build`
- [ ] **0.5 Repository, IDs en migratie (P0; opslagkeuze vereist).** Implementeer het gekozen opslagcontract en Source/Excerpt/Note-model. Laat de reader via een adapter blijven werken tijdens de overgang.
  - Acceptatie: idempotente migratie; één Excerpt per oude selectie-groep en hoogstens één bestaande Note; gelijke passages op verschillende posities in een ongewijzigde bron blijven onderscheidbaar; mislukte migratie behoudt originele data; verplaatste bron is expliciet herkoppelbaar; leesplekken worden niet meer door recent-25 verwijderd.
  - verify: `npm test -- src/__tests__/workspace-store.test.ts src/__tests__/workspace-migration.test.ts src/__tests__/store.test.ts`; native schrijffouten en herstel testen via `cargo test --manifest-path src-tauri/Cargo.toml --locked`

**Gate:** geen workspace-UI uitbreiden voordat annotaties, concepten, export en herstel aantoonbaar veilig zijn.

### Fase 1 — eerste complete leeswerkplek

- [ ] **1.1 Kleine bibliotheek (P1).** Voeg bronnen toe aan collecties; toon leesstatus en 'verder lezen'. Houd Recent als snelle lijst, niet als hele bibliotheek.
  - Acceptatie: meerdere boeken blijven beschikbaar; hetzelfde bronbestand wordt niet dubbel geïmporteerd; niet-ondersteunde formaten krijgen uitleg; ontbrekende bron kan worden herkoppeld.
  - verify: `npm test -- src/__tests__/library.test.ts src/__tests__/paths.test.ts src/__tests__/store.test.ts`
- [ ] **1.2 Reader naast notebook (P1).** Voeg zelfstandig Markdown-schrijven en brongebonden notities toe. Maak 'passage → eigen uitleg → terug naar bron' één directe flow.
  - Acceptatie: vrije tekst én passage-notities; autosave met status; meerdere bronnen in één notebook; bron blijft ongewijzigd. Toetsenbordbediening en een verborgen werkpaneel werken.
  - verify: `npm test -- src/__tests__/notebook.test.ts src/__tests__/viewer-highlight.test.ts`
- [ ] **1.3 Gezamenlijk zoeken en responsive shell (P1).** Zoek over bronnen, passages, notities en code met duidelijke resultaattypen; behoud zoeken binnen het document.
  - Acceptatie: resultaten openen het juiste object/de juiste passage; geen verborgen acties op 460×340; bron/notebook bruikbaar op normale en smalle vensters.
  - verify: `npm test -- src/__tests__/workspace-search.test.ts src/__tests__/workspace-shell.test.ts`; browser- en native venstercontrole volgens §7.

**Eerste bruikbare workspace:** drie bronnen, passages uit minstens twee bronnen in één notebook, eigen uitleg schrijven, herstarten, terugvinden en terugklikken naar de juiste bron. Dit is het eerste productcheckpoint; het hoeft niet op een board te wachten.

### Fase 2 — visueel denken

- [ ] **2.1 Boards met gedeelde inhoud (P1; boardbediening bevestigen).** Plaats bestaande notities/passages, verplaats ze, groepeer ze en leg verbindingen. Start zonder uitgebreid tekenpakket.
  - Acceptatie: dezelfde note in notebook en twee boards; één bewerking werkt overal door; plaatsing verwijderen behoudt de note; posities overleven herstart en export/import; bronklik blijft correct.
  - verify: `npm test -- src/__tests__/board.test.ts src/__tests__/workspace-export.test.ts`
- [ ] **2.2 Bediening en overdraagbaarheid (P1).** Voeg undo/redo, zoom/pan en toetsenbordacties toe. Beoordeel JSON Canvas als uitwisselingsformaat, niet als automatische keuze voor de hele interne opslag.
  - Acceptatie: verliesloos herstel van ondersteunde objecten; onondersteunde exportdetails expliciet melden; een ontbrekende bron of notitie maakt een board niet onbruikbaar.
  - verify: `npm test -- src/__tests__/board-history.test.ts src/__tests__/workspace-export.test.ts`

Pen, vrijehandtekenen en eventueel tabletgedrag krijgen alleen een afzonderlijke stap als dat de gewenste manier van werken blijkt.

### Fase 3 — leren en toepassen

- [ ] **3.1 Codekennis (P1).** Begin met een note-template: probleem, oplossing, waarom, beperkingen, taal/versie, snippet en bron/projectlink. Geen IDE bouwen.
  - Acceptatie: snippet terugvinden, kopiëren en bron raadplegen; taal/versie blijft zichtbaar; import of openen voert niets uit.
  - verify: `npm test -- src/__tests__/code-notes.test.ts src/__tests__/workspace-search.test.ts`
- [ ] **3.2 Kleine leerloop (P1).** Laat de gebruiker vragen maken bij eigen notities. Toon eerst de vraag, daarna eigen uitleg/bron, met een terugkommoment. Geen AI vereist.
  - Acceptatie: lezen → eigen uitleg → oefenvraag → later zelf antwoorden → uitleg/bron bekijken werkt ook na herstart.
  - verify: `npm test -- src/__tests__/review.test.ts src/__tests__/workspace-store.test.ts`

**Gate:** test met eigen boeken en projecten of de keten helpt; voeg pas daarna automatisering of extra functies toe.

## 6. Impact en regressierisico

| Bestaand onderdeel | Doel, callers en te behouden contract | Testbasis / gap |
| --- | --- | --- |
| `src/highlights.ts` | Annotaties en ankers voor `src/viewer.ts`; behoud selectie-groepen, kleuren en bestaande data tijdens migratie. | `src/__tests__/highlights.test.ts`; voeg cross-node-dubbelingen, ambiguïteit, corruptie en schrijffouten toe. |
| `src/viewer.ts` | Renderer/annotatiebediening voor `src/app.ts`; behoud sanitization, lokale beelden, hovergedrag en rustige scroll. | `src/__tests__/viewer-highlight.test.ts`, `src/__tests__/renderer.test.ts`; nieuwe concept- en paneeltests nodig. |
| `src/store.ts` / `src/session.ts` | Instellingen, recent en positie; callers o.a. `src/settings.ts`, `src/recent.ts`, `src/app.ts`, `src/renderer/markdown.ts`. Positie opslaan mag geen document-rebuild veroorzaken. | `src/__tests__/store.test.ts`; migratie, meer dan 25 bronnen en layoutwissels toevoegen. |
| `src/files.ts` / `src-tauri/src/lib.rs` | Bestanden/assets/audio voor reader, sessie en audioplayer; behoud UTF-8/UTF-16 en bestaand openen. Nieuwe writes hebben een expliciete workspacegrens. | `src/__tests__/paths.test.ts` en Rust-tests; native opslag, foutinjectie en herstel ontbreken nu. |
| `src/app.ts`, `src/find.ts`, `src/book.ts`, CSS | Shell, zoeken en paginering; scheid workspacenavigatie van leesweergave. Behoud Document/Book, outline en lokale links. | `src/__tests__/book-turn.test.ts`; nieuwe shell-, zoek- en browserflows nodig. |
| `src/audioplayer.ts` / `src/karaoke.ts` | Bestaande audio en tekstvolgen blijven reader-features; nieuwe panelen mogen uitlijning/volgen niet breken. | `src/__tests__/audioplayer.test.ts`, `src/__tests__/karaoke.test.ts`, `src/__tests__/align-real.test.ts`; echte audiofixture/native controle nodig. |

**Risico: hoog** voor migratie/opslag en bronidentiteit; middel voor nieuwe UI. Geen bestaande releaseplan-stories om aan te koppelen. Beperk wijzigingen per stap; trek niet alle verantwoordelijkheden naar `src/app.ts`. Meet cold/warm startup vóór een prestatiebudget wordt gekozen. Kijk zo nodig naar eager KaTeX/full highlight.js, niet naar een al opgeloste lazy-Mermaid-import.

## 7. Verificatie en klaar-definitie

Voer na iedere verticale slice de gerichte tests uit. Voor een fase-checkpoint:

```bash
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml --locked
npm audit --omit=dev
```

De audit is een rapportgate: exitcode alleen is geen beoordeling van ernst of toepasbaarheid. Er is momenteel geen aparte lint-script; geen niet-bestaand commando als geslaagde controle melden. Leg resultaten en uitzonderingen vast voordat een stap wordt afgevinkt.

**Handmatig in browser én Tauri controleren:**
- Dubbele passage in verschillende alinea's; selectie over vet/cursief/code; bron aanpassen en ankerstatus bekijken.
- Concept typen, scrollen, bron wisselen en herstarten; daarna quota-/schrijf-fout simuleren. Geen stille verloren tekst.
- Drie bronnen in één notebook; dezelfde note op twee boards; export/import in lege workspace; ontbrekende bron herkoppelen.
- Document/Book, outline, zoeken, lokale beelden/links, math, diagrammen en echte audio/karaoke.
- 460×340, 800×600 en 1200×820; toetsenbordselectie en focus; alle acties bereikbaar, werkpanelen afsluitbaar.

Een browsertest bewijst geen native schijfveiligheid of audioplayback. Voeg herhaalbare browserflows toe vóór Fase 1 wordt afgerond; kies de testtool dan expliciet. Bewaar geen private boek/audiofixtures in Git.

**Productcheck:** kun je een passage zonder contextverlies verwerken tot eigen uitleg, die later terugvinden en toepassen zonder het hele hoofdstuk opnieuw te lezen? Meet de benodigde stappen/tijd met dezelfde taak vóór en na de uitbreiding. Alleen dan een verbeterfactor noemen.

## 8. Open keuzes vóór de betreffende fase

| Keuze | Opties en grens |
| --- | --- |
| Boekinvoer | Al geconverteerd Markdown/TXT, of PDF/EPUB? Betrouwbare conversie en directe ondersteuning zijn aparte routes. Beslis vóór uitbreiding van import/renderers; huidige MD/TXT-flow kan direct verbeterd worden. |
| Whiteboard | Kaarten/verbindingen, vrij tekenen/pen, of beide? Bevestig vóór Fase 2; geen tekenpakket aannemen. |
| Opslag en bronbeheer | Filesystem versus SQLite; originele boeken verwijzen of kopiëren? Beslis vóór 0.5. Maak expliciet wat een backup meeneemt en hoe externe bronwijzigingen verwerkt worden. |
| Platform | Tauri-desktop is de huidige volledige reader. Volwaardige browserworkspace of alleen browserreader? Bevestig vóór het opslagcontract; geen impliciete feature-pariteit beloven. |

Deze keuzes blokkeren het vastleggen van dit plan en stappen 0.1–0.4 niet. Latere stappen blijven voorstellen totdat hun keuzes bevestigd zijn.

## 9. Prior art en hervatten

- [Heptabase: PDF Annotation](https://wiki.heptabase.com/pdf-annotation) — brongebonden kaarten hergebruiken op whiteboards en terug naar de bron.
- [Readwise Reader: Exporting](https://docs.readwise.io/reader/docs/faqs/exporting) — annotaties als Markdown kunnen meenemen.
- [Obsidian: JSON Canvas](https://obsidian.md/blog/json-canvas/) — open canvas-uitwisseling. Niet de volledige interne architectuur overnemen.

**Volgende actie:** controleer morgen de native reader en backup-flow met de checklist in `specs/verifications/reader-foundation.md`. Bevestig daarna opslag, bronbeheer en platform vóór stap 0.5. De funderingscode staat op `feat/reader-foundation`; herhaal 0.1–0.4 niet als nieuwe implementatie. Geen big-bang workspace-rewrite.
