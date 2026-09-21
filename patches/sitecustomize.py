"""Fix rendercv 2.8's flattened nested highlights.

rendercv 2.8 half-ships nested sub-bullets: " - " inside a highlight string
becomes an indented Markdown list item (process_highlights), and the design
schema has entries.highlights.nested_bullet for it — but markdown_to_typst
converts each line through python-markdown independently, which strips the
leading indentation, so every sub-bullet renders as a flat top-level bullet.

This module wraps markdown_to_typst to put the indentation back. It is loaded
automatically (Python imports `sitecustomize` at startup) because
generate-pdf.mjs prepends this directory to PYTHONPATH when it spawns rendercv.
A manual `rendercv render` outside generate-pdf.mjs does NOT get the fix.

Remove this file once upstream preserves list indentation (test after any
rendercv upgrade: a highlight containing " - " should render an indented
sub-bullet, not a same-level one). The wrapper is harmless if upstream fixes
it first: it strips the indent before delegating and re-prepends it after.
"""

import re
import sys

try:
    from rendercv.renderer.templater import markdown_parser as _mp
except Exception as exc:  # pragma: no cover - future rendercv refactor
    print(
        "patches/sitecustomize.py: could not patch rendercv (%s); "
        "nested sub-bullets will render flat" % exc,
        file=sys.stderr,
    )
else:
    _orig = _mp.markdown_to_typst
    _NESTED_ITEM = re.compile(r"^(\s+)(- .*)$")

    def _markdown_to_typst_keep_indent(markdown_string):
        # Indented list items are converted one by one with their indent
        # re-attached; every other run of lines is delegated unchanged so the
        # original's multi-line handling (admonition blocks) still applies.
        out = []
        buffer = []

        def flush():
            if buffer:
                out.append(_orig("\n".join(buffer)))
                buffer.clear()

        for line in markdown_string.split("\n"):
            match = _NESTED_ITEM.match(line)
            if match:
                flush()
                out.append(match.group(1) + _orig(match.group(2)))
            else:
                buffer.append(line)
        flush()
        return "\n".join(out)

    _mp.markdown_to_typst = _markdown_to_typst_keep_indent
