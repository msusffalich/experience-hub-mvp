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
BLUE = colors.HexColor("#1f78d1")
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
    ]
    for item in noise:
        text = text.replace(item, " ")
    return " ".join(text.split())


def polish(value):
    text = clean_html(value)
    replacements = {
        "Publicacion": "Publicacion",
        "publicacion": "publicacion",
        "Aprobacion": "Aprobacion",
        "energia": "energia",
        "revision": "revision",
        "tecnica": "tecnica",
        "auditoria": "auditoria",
        "version": "version",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def short(value, limit=420):
    text = polish(value)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)].rstrip() + "..."


def sentence_summary(text, max_sentences=2, limit=360):
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", clean_html(text)) if part.strip()]
    selected = " ".join(parts[:max_sentences]) or clean_html(text)
    return short(selected, limit)


def editorial_body(text, limit=900):
    cleaned = clean_html(text)
    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    body = " ".join(parts[2:9]) if len(parts) > 2 else cleaned
    return short(body, limit)


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("Titlex", parent=base["Title"], fontName="Helvetica-Bold", fontSize=29, leading=34, textColor=colors.white, alignment=TA_LEFT))
    base.add(ParagraphStyle("Subx", parent=base["BodyText"], fontSize=12, leading=17, textColor=colors.HexColor("#eef4ff")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=BRAND))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=BRAND))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontSize=9.5, leading=13.5, textColor=colors.HexColor("#26313d")))
    base.add(ParagraphStyle("Muted", parent=base["BodyText"], fontSize=8.2, leading=11, textColor=MUTED))
    base.add(ParagraphStyle("Center", parent=base["BodyText"], fontSize=9, leading=12, textColor=MUTED, alignment=TA_CENTER))
    return base


ST = styles()


def para(text, style="Bodyx"):
    safe = polish(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return Paragraph(safe, ST[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.545, preserveAspectRatio=True, mask="auto")


def logo_flowable(width=1.5 * inch):
    if not LOGO_PATH.exists():
        return para("Vibe", "Subx")
    image = Image(str(LOGO_PATH))
    image.drawWidth = width
    image.drawHeight = width * 0.545
    return image


def page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#fbfcfe"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, 0.32 * inch, "Vibe - Documento editado ReportLab")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, f"Pagina {doc.page}")
    canvas.restoreState()


def hero(title, subtitle):
    left_width = PAGE_WIDTH - 2 * MARGIN - 2.15 * inch
    table = Table(
        [
            [para(title, "Titlex"), logo_flowable(1.55 * inch)],
            [para(subtitle, "Subx"), ""],
        ],
        colWidths=[left_width, 1.55 * inch],
    )
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), BRAND),
        ("SPAN", (1, 0), (1, 1)),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
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


def list_lines(items, empty="Sin elementos seleccionados."):
    lines = []
    for item in items or []:
        if isinstance(item, dict):
            title = item.get("title") or item.get("name") or item.get("experienceTitle") or "Elemento"
            note = item.get("note") or item.get("manualNote") or item.get("analyticalText") or item.get("translatedText") or ""
            lines.append(f"- {title}: {short(note, 120) if note else 'registrado'}")
        else:
            lines.append(f"- {short(item, 140)}")
    return "\n".join(lines[:6]) or empty


def build(payload):
    html = payload.get("html") or ""
    draft = payload.get("draft") or {}
    title = draft.get("title") or payload.get("title") or "Publicacion inteligente"
    text = clean_html(html)
    summary = draft.get("summary") or sentence_summary(text, max_sentences=2, limit=360) or "Contenido preparado para revision humana."
    body = draft.get("body") or editorial_body(text, limit=940)
    stats = draft.get("stats") or {}
    highlights = draft.get("highlights") or []
    media = draft.get("media") or []
    ficha_width = (PAGE_WIDTH - 2 * MARGIN - 12) / 3
    meta_cards = Table(
        [[
            card("Formato", f"{draft.get('type') or 'Publicacion'}\nCanal: {draft.get('channel') or '-'}", ficha_width),
            card("Alcance", f"{stats.get('experiences', '-')} experiencias\nCategoria: {stats.get('category', '-')}", ficha_width),
            card("Estado", f"{draft.get('approvalStatus') or 'revision'}\nEnergia media: {stats.get('averageEnergy', '-')}/10", ficha_width),
        ]],
        colWidths=[ficha_width, ficha_width, ficha_width],
    )
    meta_cards.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    checklist_width = (PAGE_WIDTH - 2 * MARGIN - 10) / 2
    checklist = Table(
        [[
            card("Multimedia seleccionada", list_lines(media, "No se selecciono multimedia para esta publicacion."), checklist_width),
            card("Momentos destacados", list_lines(highlights, "No hay momentos destacados en el borrador."), checklist_width),
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
        para("Ficha editorial", "H1x"),
        meta_cards,
        Spacer(1, 12),
        para("Resumen editorial", "H1x"),
        card("Lectura rapida", summary),
        Spacer(1, 12),
        para("Contenido principal", "H1x"),
        card("Borrador editado", body),
        Spacer(1, 12),
        para("Evidencia y seleccion", "H1x"),
        checklist,
        Spacer(1, 12),
        card("Cierre", "Este PDF es la version editada para revision humana. Si el contenido se aprueba, puede compartirse por copia manual, enlace o por una API de canal cuando este configurada."),
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
