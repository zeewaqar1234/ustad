"""Voice tutor (docs/modules.md §5.4). STT and TTS run in the browser (Web Speech API); the server
gets text transcripts only. Stammer-safe rules: the server never ends a turn, never times one, and
strips disfluencies before anything is graded."""
