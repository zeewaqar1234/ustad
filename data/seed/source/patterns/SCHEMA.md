# Grammar pattern source schema (input for backend/scripts/build_patterns.py)

40 patterns (docs/modules.md §5.2), authored in 8 batch files of 5: batch_01.json ... batch_08.json.
The build script validates each file with Pydantic, runs every correct German string through the
self-hosted LanguageTool, and writes data/seed/patterns.json. A pattern with any LanguageTool flag is
marked needs_review and stays out of drills until approved.

Rules for all German: natural, correct standard German (Germany), B1 level or below, no em/en dashes,
sentences end with . or ?. Contexts come from Zee's life: working student on a bank trading desk
(generic only, no client or system names), on-call weeks, MSc at Goethe University, commute by train
from Rüsselsheim to Frankfurt, Kantine, Bürgeramt, Arzt, Wohnung; interests: markets, crypto, European
history, Pakistan.

File:
{ "batch": 1, "patterns": [ PATTERN x 5 ] }

PATTERN:
{
  "code": "VE_WEIL",                 // UPPER_SNAKE, unique
  "order": 10,                       // 1..40, fixed teaching order
  "group": "connectors",             // word_order | connectors | tenses | modals | cases | verbs | clauses | konjunktiv | passive | future
  "title": "weil: verb to the end",  // short English
  "rule_en": "One line. After weil the conjugated verb goes to the end of the clause.",
  "slot_diagram": {                  // rendered as a table; every row has len(labels) cells ("" allowed)
    "labels": ["Main clause", ",", "weil", "Middle", "Verb (end)"],
    "rows": [["Ich bleibe zu Hause", ",", "weil", "ich krank", "bin"]]
  },
  "examples": [                      // exactly 3: one work, one life, one finance_history
    {"context": "work", "de": "...", "en": "..."},
    {"context": "life", "de": "...", "en": "..."},
    {"context": "finance_history", "de": "...", "en": "..."}
  ],
  "common_error": {"wrong": "...", "right": "...", "tag": "VERB_FINAL", "note_en": "one line"},
  "tags": ["VERB_FINAL"],            // ErrorTag values this pattern trains (1-3)
  "drills": {
    "surgery":   [ {"de": "6-10 word sentence to rebuild from shuffled words", "en": "..."} ],      // exactly 2
    "transform": [ {"instruction": "Join with weil.", "given": ["Ich bin müde.", "Ich gehe nach Hause."],
                    "answer": "Ich gehe nach Hause, weil ich müde bin.", "alt": ["Weil ich müde bin, gehe ich nach Hause."]} ],  // exactly 2
    "tense_shift": [ {"instruction": "Put it in Perfekt.", "given": "Ich arbeite bis acht.",
                      "answer": "Ich habe bis acht gearbeitet.", "alt": []} ],   // 0-2; REQUIRED (2) for group tenses/passive/future and for modals
    "error_spot": [ {"wrong": "...", "right": "...", "tag": "VERB_FINAL", "note_en": "one line"} ],  // exactly 2, ONE error each
    "fill": [ {"text": "Ich helfe d___ Kollegin.", "answers": ["er"], "full": "Ich helfe der Kollegin."} ],  // 0-3; REQUIRED (3) for group cases; "___" once per answer, in order
    "free": {"prompt_en": "Write one sentence about your on-call week using obwohl.", "must_include": ["obwohl"]}
  },
  "homework": "Write 4 sentences about yesterday using weil at least twice."   // 3-6 sentences, tied to Zee's real day
}

ErrorTag values (docs/architecture.md §10): V2_POSITION, VERB_FINAL, SEP_PREFIX, AUX_HABEN_SEIN,
PARTIZIP, TENSE_CHOICE, CASE_AKK, CASE_DAT, PREP_CASE, GENDER, ADJ_ENDING, PLURAL, CONNECTOR_CHOICE,
MIDDLE_FIELD_ORDER, WORD_CHOICE, FALSE_FRIEND, REGISTER_DU_SIE, SPELLING, UMLAUT, CAPITALISATION,
PRONUNCIATION, OTHER.

Answers ("answer", "alt", "right", "full", surgery "de") must be the only natural solutions you can
think of, or list the others in "alt": a typed answer is auto-graded against them.
"transform"/"tense_shift" "given" may be one string or a list of strings.
