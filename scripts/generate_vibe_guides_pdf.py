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
from reportlab.platypus import Flowable, Image, PageBreak, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUTPUT = DOCS / "exports"
LOGO = ROOT / "icons" / "vibe-logo-pdf.png"

INK = colors.HexColor("#132033")
TEAL = colors.HexColor("#0D7C66")
PURPLE = colors.HexColor("#60419A")
LINE = colors.HexColor("#D8E2E0")
MUTED = colors.HexColor("#5C6B73")
PALE_TEAL = colors.HexColor("#E6F2F0")
PALE_PURPLE = colors.HexColor("#F0EAF8")
PALE_ORANGE = colors.HexColor("#FFF2E6")


class EcosystemDiagram(Flowable):
    """Small vector diagrams used as reading aids in the production guides."""

    def __init__(self, kind: str):
        super().__init__()
        self.kind = kind
        self.width = 6.45 * inch
        self.height = 2.15 * inch

    def _box(self, x, y, width, height, title, caption, fill):
        canvas = self.canv
        canvas.setStrokeColor(LINE)
        canvas.setFillColor(fill)
        canvas.roundRect(x, y, width, height, 7, stroke=1, fill=1)
        canvas.setFillColor(INK)
        canvas.setFont("Helvetica-Bold", 8.4)
        canvas.drawCentredString(x + width / 2, y + height - 15, title)
        canvas.setFillColor(MUTED)
        canvas.setFont("Helvetica", 6.8)
        for index, line in enumerate(caption.split("\n")):
            canvas.drawCentredString(x + width / 2, y + height - 29 - (index * 9), line)

    def _arrow(self, x1, y1, x2, y2, color=TEAL):
        canvas = self.canv
        canvas.setStrokeColor(color)
        canvas.setLineWidth(1.3)
        canvas.line(x1, y1, x2, y2)
        canvas.setFillColor(color)
        canvas.circle(x2, y2, 2.5, stroke=0, fill=1)

    def _title(self, text):
        self.canv.setFillColor(INK)
        self.canv.setFont("Helvetica-Bold", 10.5)
        self.canv.drawString(0, self.height - 12, text)

    def draw(self):
        if self.kind == "architecture":
            self._title("Mapa del ecosistema: una cuenta, varias superficies")
            self._box(0, 62, 112, 55, "Vibeapp", "captura móvil\ntexto, voz, cámara", PALE_TEAL)
            self._box(138, 62, 118, 55, "API Vibe", "validación, sincronía\ne integraciones", PALE_PURPLE)
            self._box(282, 62, 112, 55, "Supabase", "identidad, datos\ny medios privados", PALE_TEAL)
            self._box(420, 105, 104, 44, "VibePWA", "historias, análisis\ny PDFs", PALE_ORANGE)
            self._box(420, 26, 104, 44, "Obsidian", "memoria curada\ny aprendizaje", PALE_PURPLE)
            self._arrow(112, 89, 138, 89)
            self._arrow(256, 89, 282, 89)
            self._arrow(394, 98, 420, 126)
            self._arrow(394, 78, 420, 48, PURPLE)
            self.canv.setFillColor(MUTED)
            self.canv.setFont("Helvetica", 7)
            self.canv.drawString(0, 10, "VibePub recibe el PDF editorial para composición y distribución posterior.")
        elif self.kind == "lifecycle":
            self._title("Recorrido E2E: de un hecho a una memoria útil")
            stages = [
                ("1. Capturar", "Vibeapp", PALE_TEAL),
                ("2. Sincronizar", "API + Supabase", PALE_PURPLE),
                ("3. Adoptar", "Bandeja VibePWA", PALE_ORANGE),
                ("4. Narrar", "experiencia + eventos", PALE_TEAL),
                ("5. Comprender", "reportes, mapa, PDF", PALE_PURPLE),
            ]
            x = 0
            for index, (title, caption, fill) in enumerate(stages):
                self._box(x, 71, 100, 48, title, caption, fill)
                if index < len(stages) - 1:
                    self._arrow(x + 100, 95, x + 110, 95)
                x += 110
            self.canv.setFillColor(MUTED)
            self.canv.setFont("Helvetica", 7.2)
            self.canv.drawString(0, 34, "La evidencia puede esperar sin padre. El relato humano decide cuándo se convierte en historia.")
            self.canv.drawString(0, 20, "Biometría, GPS, clima, agenda y noticias acompañan la historia como contexto; no la inventan.")
        elif self.kind == "decision":
            self._title("Árbol de decisión: clasificar un registro")
            self._box(207, 132, 170, 38, "¿Hay relato humano de algo vivido?", "texto propio, voz transcrita o video narrado", PALE_TEAL)
            self._box(48, 54, 155, 46, "Sí: experiencia o evento", "actividad + relato\nnarrativa: ok", PALE_PURPLE)
            self._box(382, 54, 155, 46, "No: evidencia, contexto o artefacto", "foto, sensor, GPS, OCR, documento\nnarrativa: pending", PALE_ORANGE)
            self._arrow(250, 132, 125, 100, PURPLE)
            self._arrow(334, 132, 459, 100, TEAL)
            self.canv.setFillColor(MUTED)
            self.canv.setFont("Helvetica", 7)
            self.canv.drawString(48, 36, "Bienestar es estado y Hogar es lugar: acompañan una experiencia, no crean una por sí solos.")
        else:
            self._title("Sincronización y confianza")
            self._box(0, 70, 122, 50, "Dispositivo", "captura y cola local\ncuando no hay red", PALE_TEAL)
            self._box(145, 70, 122, 50, "Servidor", "guarda primero\nvalida y evita duplicados", PALE_PURPLE)
            self._box(290, 70, 122, 50, "Contexto", "se enriquece después\ncon estado visible", PALE_ORANGE)
            self._box(435, 70, 122, 50, "Otros dispositivos", "leen el mismo\nregistro común", PALE_TEAL)
            self._arrow(122, 95, 145, 95)
            self._arrow(267, 95, 290, 95)
            self._arrow(412, 95, 435, 95)
            self.canv.setFillColor(MUTED)
            self.canv.setFont("Helvetica", 7.2)
            self.canv.drawString(0, 32, "Guardado, Sincronizando, Reintento o Acción requerida deben comunicar el estado real en lenguaje simple.")


def diagrams_for(path: Path):
    if path.name.startswith("blueprint"):
        return [
            EcosystemDiagram("architecture"), Spacer(1, 10),
            EcosystemDiagram("lifecycle"), Spacer(1, 10),
            EcosystemDiagram("decision"), Spacer(1, 10),
            EcosystemDiagram("resilience"), Spacer(1, 16),
        ]
    return [
        EcosystemDiagram("lifecycle"), Spacer(1, 12),
        EcosystemDiagram("decision"), Spacer(1, 16),
    ]


def safe(text: str) -> str:
    replacements = {
        "→": "->", "├": "|", "└": "|", "─": "-", "•": "-", "’": "'", "“": '"', "”": '"',
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    return html.escape(text)


def inline(text: str) -> str:
    """Convert the small inline Markdown subset used by the Vibe guides."""
    escaped = safe(text)
    escaped = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", escaped)
    escaped = re.sub(r"`([^`]+)`", r'<font name="Courier">\1</font>', escaped)
    return escaped


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
                document.append(Paragraph(inline(stripped[2:]), s["title"]))
                document.extend(diagrams_for(path))
                title_seen = True
            else:
                document.append(PageBreak())
                document.append(Paragraph(inline(stripped[2:]), s["title"]))
            index += 1
            continue
        if stripped.startswith(("Estado:", "Fecha:", "Versión de referencia:", "Para:")):
            metadata = [stripped]
            index += 1
            while index < len(lines):
                candidate = lines[index].strip()
                if not candidate.startswith(("Estado:", "Fecha:", "Versión de referencia:", "Para:", "Alcance:")):
                    break
                metadata.append(candidate)
                index += 1
            document.append(Paragraph("<br/>".join(safe(value) for value in metadata), s["subtitle"]))
            continue
        if stripped.startswith("## "):
            document.append(Paragraph(inline(stripped[3:]), s["h1"]))
            index += 1
            continue
        if stripped.startswith("### "):
            document.append(Paragraph(inline(stripped[4:]), s["h2"]))
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
                table_data = [[Paragraph(inline(cell), s["body"]) for cell in row] for row in rows]
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
        if stripped.startswith("- ") or re.match(r"^\d+\.\s", stripped):
            text = re.sub(r"^(?:- |\d+\. )", "", stripped)
            document.append(Paragraph("- " + inline(text), s["bullet"]))
            index += 1
            continue
        if stripped.startswith("> "):
            quote = ParagraphStyle("Quote", parent=s["body"], leftIndent=12, borderColor=TEAL, borderWidth=2, borderPadding=8, backColor=colors.HexColor("#F2FAF8"))
            document.append(Paragraph(inline(stripped[2:]), quote))
            index += 1
            continue
        paragraph = [stripped]
        index += 1
        while index < len(lines):
            next_line = lines[index].strip()
            if (
                not next_line
                or next_line.startswith(("#", "|", "- ", "```", "> "))
                or re.match(r"^\d+\.\s", next_line)
            ):
                break
            paragraph.append(next_line)
            index += 1
        document.append(Paragraph(inline(" ".join(paragraph)), s["body"]))
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
