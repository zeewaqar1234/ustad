"""Run the Author job by hand: graded texts for today and tomorrow (needs Ollama).
Usage: uv run python -m scripts.author
"""

import sys

from app.jobs import nightly_author

if __name__ == "__main__":
    print(f"texts made: {nightly_author()}")
    sys.exit(0)
