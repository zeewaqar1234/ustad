# Content sources and licensing

_Split from SPEC.md sections §11. SPEC.md stays the source of truth; edit both if a rule changes._

## 11. Content sources and licensing

Checked 20 Oct 2026 against official pages. **Not legal advice.** Baseline assumption: the app is private, single-user, non-commercial and behind a login. German private-copy rules (§53 UrhG) cover private copies by a natural person; once anything becomes publicly reachable, that cover is gone. **Never make the app or its content public** (no public GitHub repo containing third-party content, no shared links).

**Storable core (safe to store in the DB and use for generation):**

| Source | Use in app | Licence / terms |
|---|---|---|
| Tatoeba German sentences (weekly dump `deu_sentences.tsv.bz2`) | example sentences for cards, cloze items | CC BY 2.0 FR (part CC0); credit authors. Audio licences vary per contributor, so don't import audio |
| Kaikki / Wiktextract German JSONL | lemmas, gender, plurals, **full verb conjugations** (best open conjugation source) | Wiktionary data CC BY-SA 4.0 + GFDL; credit |
| DWDS Lemmadatenbank (download) | lemma list | CC BY-SA 4.0. **Do not script calls to the DWDS API**: terms require permission for automated queries |
| spaCy `de_core_news_sm` | lemmatising, known-word density | MIT |
| LanguageTool **self-hosted** (Docker) | German checks on generated content and homework pre-check | LGPL 2.1+. **The public API forbids automated requests** (and is limited to 20 req/min), so self-host it as a container in docker-compose. Note: it is a Java service; give it ~1–2 GB RAM (verify on your host) |
| Piper TTS voices `thorsten` or `kerstin` | offline/free TTS fallback | voices CC0; Piper engine now GPL-3.0 (fine for private use). Avoid `pavoque` (non-commercial share-alike) |
| Bundesbank German RSS (Pressemitteilungen, Reden) | finance-domain reading texts, reader + auto vocab | storing/copying allowed, credit "Quelle: Deutsche Bundesbank", don't alter text (images excluded) |
| BaFin RSS (Presse etc.) | finance/regulation reading | storing/copying allowed with source credit |
| ECB/EZB | German versions arrive via Bundesbank feeds; ECB's own feed is English | reproduce accurately with credit |
| Tagesschau CC videos | listening | CC BY-SA 4.0, credit "tagesschau" |

**Private-use only (OK in a login-gated personal app, never republish):**

| Source | Use | Terms |
|---|---|---|
| Tagesschau API (`https://www.tagesschau.de/api2u/news/`) + RSS (incl. Wirtschaft/Finanzen) + "Tagesschau in 100 Sekunden" podcast | daily real news reading + short audio | private non-commercial use allowed, publication not; **max 60 requests/hour**: poll every 30–60 min max, cache |
| nachrichtenleicht.de RSS + weekly podcast (easy German) | easy reading/listening early on | no text licence found; personal reading only |
| DW "Top-Thema mit Vokabeln" (B1) and "Langsam gesprochene Nachrichten" (B2) RSS | MP3 for personal listening; **link out** to the article page for the transcript ("Manuskript" tab) | no published reuse licence found; feeds contain no transcript. Do not scrape article text |
| Goethe-Zertifikat A1/A2/B1 Wortlisten (PDF) | **local reference only**: run a coverage check on your laptop ("which B1 words are not yet in my decks?"), then let the Author generate cards for the missing words in its own sentences | the PDFs are copyrighted and state they may not be stored and put into a network. **Do not import the lists into the deployed database.** This is the conservative reading; uncertain |
| OpenSubtitles via OPUS (`de.freq.gz`) | word frequency ranks only | no licence stated; grey area; use for statistics, never store subtitle text |

**Link / embed only:**

| Source | How |
|---|---|
| YouTube (Easy German, Deutsch für Euch, DW Learn German) | official IFrame embed with `cc_load_policy=1&cc_lang_pref=de` (German captions shown in the player); the app adds its own questions and vocab list. **Do not scrape transcripts** (YouTube terms ban it; `captions.download` only works for videos you own). Data API quota (10,000 units/day) is plenty for metadata if needed |
| DW Nicos Weg | link to course pages (third-party rights, no feed) |
| verbformen.de, Deutsche Börse pages, Handelsblatt | link only; do not copy |

**Rule for Claude Code:** every stored text keeps `source_url` and `licence` fields (§10), and a credit line is shown in the reader.
