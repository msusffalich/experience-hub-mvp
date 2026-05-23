import io
import json
import re
import sys
from html import unescape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, Image, PageTemplate, Paragraph, Spacer, Table, TableStyle


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.58 * inch
BRAND = colors.HexColor("#10263f")
ACCENT = colors.HexColor("#6d5dfc")
BLUE = colors.HexColor("#1f78d1")
SOFT = colors.HexColor("#f5f7fb")
LINE = colors.HexColor("#d8e0e8")
MUTED = colors.HexColor("#526273")
LOGO_PATH = Path(__file__).resolve().parents[1] / "icons" / "vibe-logo-pdf.png"


def clean_html(value):
    text = re.sub(r"<style[\s\S]*?</style>", " ", str(value or ""), flags=re.I)
    text = re.sub(r"<script[\s\S]*?</script>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = unescape(text)
    noise = [
        "Uso: evidencia consultable para reportes, memoria y publicaciones. Revisar antes de publicar.",
        "Si necesitas conservar diseno visual completo, usa tambien la exportacion HTML.",
        "Si necesitas conservar diseño visual completo, usa también la exportación HTML.",
    ]
    for item in noise:
        text = text.replace(item, " ")
    text = re.sub(r"\b(PDF/HTML|HTML|Markdown|JSON|CSV)\b", " ", text)
    return " ".join(text.split())


def polish(value):
    return (
        clean_html(value)
        .replace("Publicacion", "Publicación")
        .replace("publicacion", "publicación")
        .replace("Aprobacion", "Aprobación")
        .replace("energia", "energía")
        .replace("revision", "revisión")
        .replace("tecnica", "técnica")
        .replace("auditoria", "auditoría")
        .replace("version", "versión")
    )


def short(value, limit=420):
    text = polish(value)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def sentence_summary(text, max_sentences=2, limit=360):
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean_html(text)) if part.strip()]
    selected = " ".join(parts[:max_sentences]) or clean_html(text)
    return short(selected, limit)


def editorial_body(text, limit=760):
    cleaned = clean_html(text)
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    body = " ".join(parts[2:8]) if len(parts) > 2 else cleaned
    return short(body, limit)


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("Titlex", parent=base["Title"], fontName="Helvetica-Bold", fontSize=30, leading=35, textColor=colors.white, alignment=TA_LEFT))
    base.add(ParagraphStyle("Subx", parent=base["BodyText"], fontSize=12, leading=17, textColor=colors.HexColor("#eef4ff")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=20, leading=24, textColor=BRAND))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=14, leading=17, textColor=BRAND))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontSize=10, leading=14, textColor=colors.HexColor("#26313d")))
    base.add(ParagraphStyle("Muted", parent=base["BodyText"], fontSize=8.5, leading=12, textColor=MUTED))
    base.add(ParagraphStyle("Center", parent=base["BodyText"], fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER))
    return base


ST = styles()


def para(text, style="Bodyx"):
    safe = polish(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, ST[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.5, preserveAspectRatio=True, mask="auto")


def logo_flowable(width=1.35 * inch):
    if not LOGO_PATH.exists():
        return para("Vibe", "Subx")
    image = Image(str(LOGO_PATH))
    image.drawWidth = width
    image.drawHeight = width * 0.5
    return image


def page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#fbfcfe"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont("Helvetica-Bold", 8)
    draw_logo(canvas, MARGIN, 0.16 * inch, 0.42 * inch)
    canvas.drawString(MARGIN + 0.5 * inch, 0.32 * inch, "Vibe - Documento editado ReportLab")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, f"Pagina {doc.page}")
    canvas.restoreState()


def hero(title, subtitle):
    table = Table([[logo_flowable()], [para(title, "Titlex")], [para(subtitle, "Subx")]], colWidths=[PAGE_WIDTH - 2 * MARGIN - 0.6 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND),
        ("LEFTPADDING", (0, 0), (-1, -1), 22),
        ("RIGHTPADDING", (0, 0), (-1, -1), 22),
        ("TOPPADDING", (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 18),
        ("BOX", (0, 0), (-1, -1), 0, BRAND),
    ]))
    return table


def card(title, body, width=None):
    width = width or (PAGE_WIDTH - 2 * MARGIN)
    t = Table([[para(title, "H2x")], [para(body, "Bodyx")]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 12),
        ("RIGHTPADDING", (0, 0), (-1, -1), 12),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    return t


def build(payload):
    html = payload.get("html") or ""
    title = payload.get("title") or "Publicación inteligente"
    text = clean_html(html)
    summary = sentence_summary(text, max_sentences=2, limit=360) or "Contenido preparado para revision humana."
    body = editorial_body(text, limit=820)
    checklist_width = (PAGE_WIDTH - 2 * MARGIN - 10) / 2
    checklist = Table(
        [[
            card("Antes de compartir", "Confirma privacidad, nombres, lugares y datos sensibles. Usa el canal elegido solo cuando el contenido esté aprobado.", checklist_width),
            card("Salida recomendada", "PDF para versión final revisada. Markdown sirve para editar texto. JSON/CSV quedan para auditoría técnica.", checklist_width),
        ]],
        colWidths=[checklist_width, checklist_width],
    )
    checklist.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [
        hero(title, "Pieza final con contenido curado para revisar, aprobar y compartir."),
        Spacer(1, 18),
        para("Resumen editorial", "H1x"),
        card("Lectura rapida", summary),
        Spacer(1, 12),
        para("Contenido principal", "H1x"),
        card("Borrador editado", body),
        Spacer(1, 12),
        para("Cierre editorial", "H1x"),
        checklist,
    ]


def main():
    payload = json.load(sys.stdin)
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=page)])
    doc.build(build(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
