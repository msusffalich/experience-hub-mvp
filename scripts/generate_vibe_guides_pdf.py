"""Generate the Vibe user manual and production blueprint as ReportLab PDFs."""

from __future__ import annotations

import html
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "exports"
LOGO = ROOT / "icons" / "vibe-logo-pdf.png"

INK = colors.HexColor("#132033")
TEAL = colors.HexColor("#0D7C66")
PURPLE = colors.HexColor("#60419A")
LINE = colors.HexColor("#D8E2E0")
MUTED = colors.HexColor("#5C6B73")


def safe(text: str) -> str:
    replacements = {
        "→": "->", "├": "|", "└": "|", "─": "-", "•": "-", "’": "'", "“": '"', "”": '"',
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return html.escape(text)


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("VibeTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=24, leading=29, textColor=INK, alignment=TA_LEFT, spaceAfter=8),
        "subtitle": ParagraphStyle("VibeSubtitle", parent=base["Normal"], fontName="Helvetica", fontSize=10, leading=14, textColor=MUTED, spaceAfter=18),
        "h1": ParagraphStyle("VibeH1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=20, textColor=TEAL, spaceBefore=14, spaceAfter=8, keepWithNext=True),
        "h2": ParagraphStyle("VibeH2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=PURPLE, spaceBefore=11, spaceAfter=6, keepWithNext=True),
        "body": ParagraphStyle("VibeBody", parent=base["BodyText"], fontName="Helvetica", fontSize=9.5, leading=14, textColor=INK, spaceAfter=7),
        "bullet": ParagraphStyle("VibeBullet", parent=base["BodyText"], fontName="Helvetica", fontSize=9.4, leading=13.5, textColor=INK, leftIndent=14, firstLineIndent=-9, spaceAfter=4),
        "code": ParagraphStyle("VibeCode", parent=base["Code"], fontName="Courier", fontSize=8, leading=10, textColor=INK, backColor=colors.HexColor("#F1F5F4"), borderColor=LINE, borderWidth=0.5, borderPadding=6, spaceAfter=8),
    }


def split_table(lines: list[str], start: int):
    rows = []
    index = start
    while index < len(lines) and lines[index].strip().startswith("|"):
        cells = [cell.strip() for cell in lines[index].strip().strip("|").split("|")]
        if not all(re.fullmatch(r":?-{3,}:?", cell.replace(" ", "")) for cell in cells):
            rows.append(cells)
        index += 1
    return rows, index


def parse_markdown(path: Path):
    document = []
    content = path.read_text(encoding="utf-8")
    lines = content.splitlines()
    s = styles()
    title_seen = False
    index = 0
    while index < len(lines):
        raw = lines[index].rstrip()
        stripped = raw.strip()
        if not stripped or stripped == "---":
            index += 1
            continue
        if stripped.startswith("# "):
            if not title_seen:
                if LOGO.exists():
                    image = Image(str(LOGO), width=1.55 * inch, height=0.55 * inch, kind="proportional")
                    image.hAlign = "RIGHT"
                    document.append(image)
                    document.append(Spacer(1, 5))
                document.append(Paragraph(safe(stripped[2:]), s["title"]))
                title_seen = True
            else:
                document.append(PageBreak())
                document.append(Paragraph(safe(stripped[2:]), s["title"]))
            index += 1
            continue
        if stripped.startswith("## "):
            document.append(Paragraph(safe(stripped[3:]), s["h1"]))
            index += 1
            continue
        if stripped.startswith("### "):
            document.append(Paragraph(safe(stripped[4:]), s["h2"]))
            index += 1
            continue
        if stripped.startswith("```"):
            index += 1
            code = []
            while index < len(lines) and not lines[index].strip().startswith("```"):
                code.append(lines[index])
                index += 1
            document.append(Paragraph(safe("<br/>".join(code)), s["code"]))
            index += 1
            continue
        if stripped.startswith("|"):
            rows, index = split_table(lines, index)
            if rows:
                table_data = [[Paragraph(safe(cell), s["body"]) for cell in row] for row in rows]
                width = 6.45 * inch
                col_count = max(len(row) for row in rows)
                table = Table(table_data, colWidths=[width / col_count] * col_count, repeatRows=1, hAlign="LEFT")
                table.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#E6F2F0")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), INK),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("GRID", (0, 0), (-1, -1), 0.4, LINE),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("LEFTPADDING", (0, 0), (-1, -1), 6),
                    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 5),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ]))
                document.append(table)
                document.append(Spacer(1, 8))
            continue
        if stripped.startswith("- ") or stripped.startswith("1. "):
            text = re.sub(r"^(?:- |\d+\. )", "", stripped)
            document.append(Paragraph("- " + safe(text), s["bullet"]))
            index += 1
            continue
        if stripped.startswith("> "):
            quote = ParagraphStyle("Quote", parent=s["body"], leftIndent=12, borderColor=TEAL, borderWidth=2, borderPadding=8, backColor=colors.HexColor("#F2FAF8"))
            document.append(Paragraph(safe(stripped[2:]), quote))
            index += 1
            continue
        paragraph = [stripped]
        index += 1
        while index < len(lines):
            next_line = lines[index].strip()
            if not next_line or next_line.startswith(("#", "|", "- ", "1. ", "```", "> ")):
                break
            paragraph.append(next_line)
            index += 1
        document.append(Paragraph(safe(" ".join(paragraph)), s["body"]))
    return document


def page_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.line(0.75 * inch, 0.58 * inch, 7.75 * inch, 0.58 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.75 * inch, 0.38 * inch, "Vibe - Human Experience Intelligence Platform")
    canvas.drawRightString(7.75 * inch, 0.38 * inch, f"Página {doc.page}")
    canvas.restoreState()


def build(source: str, target: str):
    OUTPUT.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(
        str(OUTPUT / target), pagesize=letter, rightMargin=0.75 * inch, leftMargin=0.75 * inch,
        topMargin=0.65 * inch, bottomMargin=0.78 * inch, title=target.replace("-", " ").replace(".pdf", ""),
    )
    doc.build(parse_markdown(DOCS / source), onFirstPage=page_footer, onLaterPages=page_footer)


if __name__ == "__main__":
    build("manual-usuario-vibe-20260723.md", "manual-usuario-vibe-20260723.pdf")
    build("blueprint-produccion-ecosistema-vibe-20260723.md", "blueprint-produccion-ecosistema-vibe-20260723.pdf")
