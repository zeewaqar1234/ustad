"""Does a German text use a structure? Regex checks per error tag, used by the Author check and the
Diktat picker (V4). A tag without a check returns None: callers skip the check and log it.
These checks count where a structure appears, not whether Zee gets it right; LanguageTool and the
grader judge correctness."""

import re

_SUB = r"weil|dass|daß|wenn|ob|obwohl|damit|als|während|bevor|nachdem|bis|falls|sobald|seit|seitdem"
_ART = (r"dem|der|den|einem|einer|meinem|meiner|deinem|deiner|seinem|seiner|ihrem|ihrer|unserem|"
        r"diesem|dieser|keinem|keiner|die|das|einen|meinen|deinen|seinen|ihren|diesen|keinen|ein|eine")  # fmt: skip
_AUX = r"habe|hast|hat|haben|habt|bin|bist|ist|sind|seid|hatte|hatten|war|waren"
_V2_OPENERS = (r"heute|morgen|gestern|dann|danach|jetzt|später|zuerst|deshalb|deswegen|trotzdem|manchmal|"
               r"oft|leider|vielleicht|am|im|in|um|nach|vor|seit|bei|zum|zur")  # fmt: skip

_PATTERNS: dict[str, re.Pattern] = {
    "VERB_FINAL": re.compile(rf"\b(?:{_SUB})\b", re.IGNORECASE),
    "AUX_HABEN_SEIN": re.compile(rf"\b(?:{_AUX})\b[^.!?;]*?\bge\w+(?:t|en)\b", re.IGNORECASE),
    "PARTIZIP": re.compile(rf"\b(?:{_AUX})\b[^.!?;]*?\b(?:ge\w+(?:t|en)|\w+iert)\b", re.IGNORECASE),
    "CASE_DAT": re.compile(
        rf"\b(?:mit|bei|nach|von|zu|aus|seit|gegenüber)\s+(?:{_ART})\b", re.IGNORECASE
    ),
    "CASE_AKK": re.compile(
        r"\b(?:für|durch|ohne|gegen|um|bis)\s+(?:" + _ART + r")\b", re.IGNORECASE
    ),
    "PREP_CASE": re.compile(
        rf"\b(?:mit|bei|nach|von|zu|aus|seit|für|durch|ohne|gegen|an|auf|in|über|unter|vor|hinter|neben|zwischen)\s+(?:{_ART})\b",
        re.IGNORECASE,
    ),
    "ADJ_ENDING": re.compile(
        r"\b(?:ein|eine|einen|einem|einer|der|die|das|den|dem|mein\w*|dein\w*|kein\w*)\s+[a-zäöüß]+(?:e|en|em|er|es)\s+[A-ZÄÖÜ]\w+"
    ),
}
_V2 = re.compile(rf"(?:^|[.!?]\s+)(?:{_V2_OPENERS})\b", re.IGNORECASE)


def _count_v2(text: str) -> int:
    return len(_V2.findall(text))


def checkable(tag: str) -> bool:
    return tag in _PATTERNS or tag == "V2_POSITION"


def count_uses(tag: str, text: str) -> int | None:
    """How many times `text` uses the structure of `tag`, or None when there is no check for the tag."""
    if tag == "V2_POSITION":
        return _count_v2(text)
    pat = _PATTERNS.get(tag)
    return None if pat is None else len(pat.findall(text))
