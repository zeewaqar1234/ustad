# Seed source schema (hand/LLM-authored input for backend/scripts/build_seed.py)

One file per deck: connector.json, work.json, life.json. Top level:

{ "deck": "connector" | "work" | "life",
  "units": [ { "title": "short English title", "scenario": "one line, where Zee uses this",
               "items": [ ITEM, ... ] } ] }

ITEM:
{ "kind": "chunk" | "word",
  "de": "German, canonical form. Chunks: 2-9 words, a natural phrase or full sentence.
         Nouns (kind=word): bare noun WITHOUT article, capitalised, e.g. "Rechnung".",
  "en": "English meaning; this is the prompt for the EN->DE typed card, so it must point to ONE German answer.
         Add a hint in brackets when needed: '(formal)', '(to a colleague, du)', '(Perfekt)'.",
  "alt": ["other fully correct German answers a typed answer may match"],   // optional, may be []
  "gender": "m" | "f" | "n" | null,     // nouns only
  "plural": "Rechnungen" | null,        // nouns only; "-" if no plural
  "pos": "noun" | "verb" | "adj" | "adv" | "conj" | "prep" | "phrase",
  "tags": ["..."],                      // topic tags, lowercase, e.g. "email", "meeting", "bahn"
  "cefr": "A2" | "B1" | "B2",
  "example_de": "one full German example sentence using the item (ends with . or ?)",
  "example_en": "its English translation" }

Connector deck extra: tags MUST include exactly one of
  "verb:none" (Group 0: no change to word order: und, aber, oder, denn, sondern),
  "verb:v2"   (Group V2: adverb takes position 1, verb comes next: deshalb, trotzdem),
  "verb:end"  (Group VE: subordinating, verb goes to the end: weil, dass, obwohl),
  "verb:inf"  (infinitive clause with zu at the end: um ... zu, ohne ... zu)
and "connector". For connector items "de" is the connector itself (e.g. "obwohl", "entweder ... oder"),
and example_de must show the verb position clearly.

Rules for all text: correct standard German (Germany), no em dashes, no confidential work data
(no real client names, no internal system names, no trade data; generic bank/desk only).
