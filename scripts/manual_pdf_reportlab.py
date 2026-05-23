import io
import json
import sys
from html import escape
from html.parser import HTMLParser
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.58 * inch
BRAND = colors.HexColor("#10263f")
ACCENT = colors.HexColor("#0d7c66")
SOFT = colors.HexColor("#f4f8fb")
LINE = colors.HexColor("#d8e0e8")
MUTED = colors.HexColor("#526273")
LOGO_PATH = Path(__file__).resolve().parents[1] / "icons" / "vibe-logo-pdf.png"


def clean(value):
    return " ".join(str(value or "").replace("\n", " ").replace("\r", " ").split())


def polish(value):
    return (
        clean(value)
        .replace("Guia", "Guía")
        .replace("administracion", "administración")
        .replace("Indice", "Índice")
        .replace("Seccion", "Sección")
        .replace("rapido", "rápido")
        .replace("Version", "Versión")
    )


def short(value, limit=360):
    text = polish(value)
    return text if len(text) <= limit else text[: max(0, limit - 1)].rstrip() + "..."


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=30, leading=35, textColor=colors.white, alignment=TA_LEFT))
    base.add(ParagraphStyle("CoverSub", parent=base["BodyText"], fontSize=11.5, leading=16, textColor=colors.HexColor("#eef7f5")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=BRAND, spaceBefore=12, spaceAfter=8))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13.5, leading=17, textColor=BRAND, spaceBefore=8, spaceAfter=5))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontSize=9.4, leading=13.2, textColor=colors.HexColor("#26313d"), spaceAfter=4))
    base.add(ParagraphStyle("Bulletx", parent=base["BodyText"], fontSize=9.0, leading=12.6, textColor=colors.HexColor("#26313d"), leftIndent=10, firstLineIndent=-6, spaceAfter=3))
    base.add(ParagraphStyle("Small", parent=base["BodyText"], fontSize=7.8, leading=10.2, textColor=MUTED))
    return base


ST = styles()


def para(text, style="Bodyx"):
    return Paragraph(escape(polish(text)), ST[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.545, preserveAspectRatio=True, mask="auto")


def logo_flowable(width=1.35 * inch):
    if not LOGO_PATH.exists():
        return para("Vibe", "CoverSub")
    image = Image(str(LOGO_PATH))
    image.drawWidth = width
    image.drawHeight = width * 0.545
    return image


class ManualParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.items = []
        self.current_tag = None
        self.current_text = []

    def handle_starttag(self, tag, attrs):
        if tag in {"h1", "h2", "h3", "p", "li"}:
            self.flush()
            self.current_tag = tag
            self.current_text = []

    def handle_endtag(self, tag):
        if tag == self.current_tag:
            self.flush()

    def handle_data(self, data):
        if self.current_tag:
            self.current_text.append(data)

    def flush(self):
        if not self.current_tag:
            return
        text = clean(" ".join(self.current_text))
        if text:
            self.items.append((self.current_tag, text))
        self.current_tag = None
        self.current_text = []


def parse_manual(html):
    parser = ManualParser()
    parser.feed(html or "")
    parser.flush()
    title = "Manual Vibe"
    sections = []
    current = None
    for tag, text in parser.items:
        if tag == "h1" and title == "Manual Vibe":
            title = text
            continue
        if tag in {"h2", "h3"}:
            current = {"title": text, "body": [], "items": []}
            sections.append(current)
            continue
        if current is None:
            current = {"title": "Inicio rápido", "body": [], "items": []}
            sections.append(current)
        if tag == "li":
            current["items"].append(text)
        else:
            current["body"].append(text)
    return title, sections


def page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#fbfcfd"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, 0.32 * inch, "Vibe - Manual operativo")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, f"Pagina {doc.page}")
    canvas.restoreState()


def cover(title, version, section_count):
    block = Table(
        [
            [logo_flowable()],
            [para(title, "CoverTitle")],
            [para("Guía práctica para operar la app: captura, activos, reportes, hallazgos, publicaciones, privacidad y administración.", "CoverSub")],
            [para(f"Versión: {version or '-'}  |  Secciones: {section_count}", "CoverSub")],
        ],
        colWidths=[PAGE_WIDTH - 2 * MARGIN - 0.6 * inch],
    )
    block.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND),
        ("LEFTPADDING", (0, 0), (-1, -1), 22),
        ("RIGHTPADDING", (0, 0), (-1, -1), 22),
        ("TOPPADDING", (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 16),
    ]))
    return block


def toc(sections):
    rows = [[para("Sección", "Small"), para("Contenido", "Small")]]
    for index, section in enumerate(sections[:24], 1):
        preview = short(" ".join(section.get("body", [])[:1] + section.get("items", [])[:2]), 110)
        rows.append([para(f"{index}. {section.get('title', '')}", "Small"), para(preview, "Small")])
    table = Table(rows, colWidths=[2.2 * inch, 3.65 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def section_card(index, section):
    flow = [para(f"{index}. {section.get('title', '')}", "H2x")]
    for paragraph in section.get("body", [])[:5]:
        flow.append(para(paragraph, "Bodyx"))
    for item in section.get("items", [])[:10]:
        flow.append(para(f"- {item}", "Bulletx"))
    return flow


def build(payload):
    title, sections = parse_manual(payload.get("html") or "")
    version = payload.get("version") or payload.get("appVersion") or ""
    story = [
        cover(title, version, len(sections)),
        Spacer(1, 16),
        para("Índice operativo", "H1x"),
        toc(sections),
        PageBreak(),
    ]
    for index, section in enumerate(sections, 1):
        story.extend(section_card(index, section))
        story.append(Spacer(1, 8))
    if not sections:
        story.append(para("No se encontro contenido del manual en el HTML recibido.", "Bodyx"))
    return story


def main():
    payload = json.load(sys.stdin)
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page)])
    doc.build(build(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
