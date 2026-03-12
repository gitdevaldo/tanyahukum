"""Split contract text into individual clauses."""
import re


def split_into_clauses(text: str) -> list[dict]:
    """Split contract text into clauses.

    Recognizes common Indonesian contract patterns:
    - Pasal X / PASAL X
    - BAB X
    - Numbered sections (1., 2., etc. at start of paragraph)
    - Lettered subsections (a., b., etc.)

    Returns list of dicts: {index, title, text}
    """
    clauses = []

    # Primary pattern: Pasal-based splitting (most common in Indonesian contracts)
    pasal_pattern = re.compile(
        r'(?:^|\n)\s*((?:PASAL|Pasal|pasal)\s+\d+[A-Za-z]?(?:\s*[-:.]?\s*[^\n]*)?)',
        re.MULTILINE
    )

    matches = list(pasal_pattern.finditer(text))

    if len(matches) >= 3:
        # Document has pasal structure
        for i, match in enumerate(matches):
            title = match.group(1).strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            body = text[start:end].strip()

            if body:
                clauses.append({
                    "index": i + 1,
                    "title": title,
                    "text": f"{title}\n{body}",
                })
        return clauses

    # Fallback: BAB-based splitting
    bab_pattern = re.compile(
        r'(?:^|\n)\s*(BAB\s+[IVXLCDM]+\s*[-:.]?\s*[^\n]*)',
        re.MULTILINE
    )
    matches = list(bab_pattern.finditer(text))

    if len(matches) >= 2:
        for i, match in enumerate(matches):
            title = match.group(1).strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            body = text[start:end].strip()

            if body:
                clauses.append({
                    "index": i + 1,
                    "title": title,
                    "text": f"{title}\n{body}",
                })
        return clauses

    # Fallback: numbered section splitting (1. ..., 2. ..., etc.)
    section_pattern = re.compile(
        r'(?:^|\n)(\d{1,3})\.\s+([A-Z][^\n]{10,})',
        re.MULTILINE
    )
    matches = list(section_pattern.finditer(text))

    if len(matches) >= 3:
        for i, match in enumerate(matches):
            num = match.group(1)
            title = match.group(2).strip()
            start = match.end()
            end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
            body = text[start:end].strip()

            clauses.append({
                "index": int(num),
                "title": f"Bagian {num}: {title[:80]}",
                "text": f"{num}. {title}\n{body}",
            })
        return clauses

    # Last resort: split by paragraphs (double newline)
    paragraphs = re.split(r'\n\s*\n', text)
    meaningful = [p.strip() for p in paragraphs if len(p.strip()) > 50]

    for i, para in enumerate(meaningful):
        first_line = para.split('\n')[0][:80]
        clauses.append({
            "index": i + 1,
            "title": f"Bagian {i + 1}: {first_line}",
            "text": para,
        })

    return clauses
