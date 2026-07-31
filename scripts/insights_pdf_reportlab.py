import io
import json
import math
import re
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import BaseDocTemplate, Frame, Flowable, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle

from pdf_context_sections import build_context_digest
from pdf_i18n import natural_date, set_locale, t


PAGE_WIDTH, PAGE_HEIGHT = letter
MARGIN = 0.55 * inch
BRAND = colors.HexColor("#10263f")
ACCENT = colors.HexColor("#0d7c66")
GOLD = colors.HexColor("#f2b84b")
BLUE = colors.HexColor("#3a6ea5")
PURPLE = colors.HexColor("#7a5cc8")
MUTED = colors.HexColor("#526273")
SOFT = colors.HexColor("#f4f8fb")
LINE = colors.HexColor("#d8e0e8")
LOGO_PATH = Path(__file__).resolve().parents[1] / "icons" / "vibe-logo-pdf.png"
AXIS_COLORS = [ACCENT, GOLD, BLUE, PURPLE, colors.HexColor("#22c55e"), colors.HexColor("#f472b6"), colors.HexColor("#06b6d4"), colors.HexColor("#fb923c")]


def register_pdf_fonts():
    regular_candidates = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"), Path("C:/Windows/Fonts/arial.ttf")]
    bold_candidates = [Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"), Path("C:/Windows/Fonts/arialbd.ttf")]
    regular = next((path for path in regular_candidates if path.exists()), None)
    bold = next((path for path in bold_candidates if path.exists()), None)
    if regular and bold:
        pdfmetrics.registerFont(TTFont("VibeSans", str(regular)))
        pdfmetrics.registerFont(TTFont("VibeSansBold", str(bold)))
        return "VibeSans", "VibeSansBold"
    return "Helvetica", "Helvetica-Bold"


FONT_REGULAR, FONT_BOLD = register_pdf_fonts()


def text_of(value, limit=600):
    """Convierte cualquier valor en texto legible y ACOTADO.

    Antes se hacia str(value), asi que una lista de diccionarios se renderizaba
    como su repr de Python y generaba una celda de 475.825 puntos de alto:
    ReportLab lanzaba LayoutError y no se producia ningun PDF de hallazgos.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        text = value
    elif isinstance(value, bool):
        text = "si" if value else "no"
    elif isinstance(value, (int, float)):
        text = str(value)
    elif isinstance(value, dict):
        text = str(value.get("title") or value.get("name") or value.get("label")
                   or value.get("text") or value.get("summary") or "")
        if not text:
            text = ", ".join(f"{k}: {text_of(v, 60)}" for k, v in list(value.items())[:4])
    elif isinstance(value, (list, tuple, set)):
        items = list(value)
        parts = [text_of(item, 120) for item in items[:6]]
        text = " \u00b7 ".join(p for p in parts if p)
        if len(items) > 6:
            text += f" (+{len(items) - 6})"
    else:
        text = str(value)
    text = text.replace("\n", " ").replace("\r", " ")
    if len(text) > limit:
        text = text[:limit].rstrip() + "\u2026"
    return text


def clean(value):
    text = text_of(value)
    if any(marker in text for marker in (chr(0x00C3), chr(0x00C2), chr(0xFFFD))):
        try:
            text = text.encode("latin1").decode("utf-8")
        except Exception:
            pass
    text = re.sub(r"\blabels\.categoryLabels\.", "", text, flags=re.I)
    text = re.sub(r"\b(vibeapp-native|Storage privado|Supabase|URL firmada|sincronizado con Storage privado)\b", "", text, flags=re.I)
    text = re.sub(r"\bSe(?:ñ|\u00c3\u00b1)al\s+(?:location|ubicaci(?:o|ó|\u00c3\u00b3)n)\s+recibida\s+desde\s+", "", text, flags=re.I)
    text = re.sub(r"\bUbicaci(?:o|ó|\u00c3\u00b3)n\s+desde\s+", "", text, flags=re.I)
    text = re.sub(r"\bCaptura\s+m(?:o|ó|\u00c3\u00b3)vil\b", "", text, flags=re.I)
    text = re.sub(r"\bprimary-user[-\w]*\b", "", text, flags=re.I)
    text = re.sub(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", "", text, flags=re.I)
    text = re.sub(r"\b[\w.-]+\.(?:jpg|jpeg|png|gif|webp|heic|mp4|mov|webm|mp3|wav|m4a|pdf|docx?|txt|csv|json|zip)\b", "", text, flags=re.I)
    text = text.replace("Extracción local automática para", "Lectura de")
    text = text.replace("Extracci\u00c3\u00b3n local autom\u00c3\u00a1tica para", "Lectura de")
    text = text.replace("Uso: evidencia consultable para reportes, memoria y publicaciones. Revisar antes de publicar.", "")
    return " ".join(text.split())


def polish(value):
    return (
        clean(value)
        .replace("Diagnostico", "Diagnóstico")
        .replace("Energia", "Energía")
        .replace("energia", "energía")
        .replace("tematica", "temática")
        .replace("Tematica", "Temática")
        .replace("proporcion", "proporción")
        .replace("Proporcion", "Proporción")
        .replace("accion", "acción")
        .replace("Accion", "Acción")
        .replace("auditoria", "auditoría")
        .replace("tecnica", "técnica")
        .replace("analisis", "análisis")
        .replace("Analisis", "Análisis")
        .replace("proxima", "próxima")
    )


def short(value, limit=260):
    text = polish(value)
    return text if len(text) <= limit else text[: max(0, limit - 1)].rstrip() + "..."


def human_action(value, limit=150):
    text = short(value, limit).strip()
    if not text:
        return "Prueba un ajuste pequeno, observa que cambia y vuelve a registrarlo."
    text = text[:-1] if text.endswith(".") else text
    return f"{text}. Tomalo como una prueba breve: observa que cambia y vuelve a registrarlo."


def num(value, default=0):
    try:
        return float(value)
    except Exception:
        return default


def styles():
    base = getSampleStyleSheet()
    base.add(ParagraphStyle("CoverTitle", parent=base["Title"], fontName=FONT_BOLD, fontSize=32, leading=36, textColor=colors.white, alignment=TA_LEFT))
    base.add(ParagraphStyle("CoverSub", parent=base["Normal"], fontName=FONT_REGULAR, fontSize=12, leading=16, textColor=colors.HexColor("#eaf3f4")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName=FONT_BOLD, fontSize=19, leading=23, textColor=BRAND, spaceBefore=12, spaceAfter=8))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName=FONT_BOLD, fontSize=12.5, leading=15, textColor=BRAND, spaceAfter=5))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=9, leading=12.6, textColor=colors.HexColor("#2d3742"), wordWrap="CJK"))
    base.add(ParagraphStyle("Small", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=7.1, leading=9.2, textColor=MUTED, wordWrap="CJK"))
    base.add(ParagraphStyle("Metric", parent=base["BodyText"], fontName=FONT_BOLD, fontSize=18, leading=22, alignment=TA_CENTER, textColor=BRAND))
    base.add(ParagraphStyle("MetricLabel", parent=base["BodyText"], fontName=FONT_REGULAR, fontSize=7.2, leading=9, alignment=TA_CENTER, textColor=MUTED))
    return base


STYLES = styles()


def para(text, style="Bodyx"):
    return Paragraph(escape(polish(text_of(text, 3000))), STYLES[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.545, preserveAspectRatio=True, mask="auto")


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#f8fafb"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#edf7f0"))
    canvas.rect(0, PAGE_HEIGHT - 0.18 * inch, PAGE_WIDTH, 0.18 * inch, fill=1, stroke=0)
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PAGE_HEIGHT - 0.035 * inch, PAGE_WIDTH, 0.035 * inch, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont(FONT_BOLD, 8)
    canvas.drawString(MARGIN, 0.32 * inch, t("insights_footer"))
    canvas.setFillColor(ACCENT)
    canvas.roundRect(MARGIN, 0.22 * inch, 0.38 * inch, 0.035 * inch, 1, fill=1, stroke=0)
    canvas.setFillColor(MUTED)
    canvas.setFont(FONT_REGULAR, 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, t("page", number=doc.page))
    canvas.restoreState()


class CoverBlock(Flowable):
    def __init__(self, payload):
        super().__init__()
        self.payload = payload

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 6.65 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(BRAND)
        c.roundRect(0, 0, self.width, self.height, 18, fill=1, stroke=0)
        draw_logo(c, self.width - 1.9 * inch, self.height - 1.05 * inch, 1.35 * inch)
        output_scope = self.payload.get("outputScope") or {}
        inventory = self.payload.get("evidenceInventory") or {}
        is_inventory = output_scope.get("presentationMode") == "signal_inventory"
        c.setFillColor(colors.white)
        c.setFont(FONT_BOLD, 30)
        c.drawString(0.38 * inch, self.height - 1.42 * inch, t("signals_title") if is_inventory else t("insights_title"))
        c.setFont(FONT_REGULAR, 12)
        c.drawString(0.4 * inch, self.height - 1.76 * inch, t("signals_subtitle") if is_inventory else t("insights_subtitle"))
        metrics = (
            [
                (t("evidence"), inventory.get("evidence", 0)),
                (t("contexts"), inventory.get("context", 0)),
                (t("readable_text"), inventory.get("readable", 0)),
                (t("measurements"), (inventory.get("measurements") or {}).get("records", 0)),
            ]
            if is_inventory
            else [
                (t("experiences"), self.payload.get("experiences", 0)),
                (t("evidence"), output_scope.get("evidence", 0)),
                (t("findings"), len(self.payload.get("insights") or [])),
                (t("contexts"), output_scope.get("context", 0)),
            ]
        )
        y = self.height - 2.55 * inch
        for index, (label, value) in enumerate(metrics):
            x = 0.4 * inch + index * 1.28 * inch
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.13))
            c.roundRect(x, y, 1.08 * inch, 0.76 * inch, 9, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont(FONT_BOLD, 13)
            c.drawCentredString(x + 0.54 * inch, y + 0.39 * inch, str(value)[:14])
            c.setFont(FONT_REGULAR, 6.8)
            c.drawCentredString(x + 0.54 * inch, y + 0.16 * inch, label.upper())
        c.setFillColor(colors.HexColor("#eaf3f4"))
        c.setFont(FONT_REGULAR, 9)
        c.drawString(0.4 * inch, 0.55 * inch, t("generated", date=natural_date(self.payload.get("generatedAt") or datetime.now(timezone.utc))))
        c.restoreState()


class AxisRadar(Flowable):
    def __init__(self, axes):
        super().__init__()
        self.axes = axes[:8]

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 2.35 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        w, h = self.width, self.height
        c.saveState()
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(0, 0, w, h, 12, fill=1, stroke=1)
        cx, cy, r = 1.18 * inch, h / 2 - 0.08 * inch, 0.82 * inch
        count = max(3, len(self.axes))
        for scale in [0.33, 0.66, 1.0]:
            points = []
            for index in range(count):
                angle = -math.pi / 2 + 2 * math.pi * index / count
                points.append((cx + math.cos(angle) * r * scale, cy + math.sin(angle) * r * scale))
            c.setStrokeColor(colors.HexColor("#dfe7ee"))
            for a, b in zip(points, points[1:] + points[:1]):
                c.line(a[0], a[1], b[0], b[1])
        values = [min(100, max(0, num(axis.get("avgEnergy")) * 10 + min(20, len(axis.get("items") or [])))) for axis in self.axes]
        if not values:
            values = [0, 0, 0]
        while len(values) < count:
            values.append(0)
        path = c.beginPath()
        for index, value in enumerate(values):
            angle = -math.pi / 2 + 2 * math.pi * index / count
            x = cx + math.cos(angle) * r * value / 100
            y = cy + math.sin(angle) * r * value / 100
            if index == 0:
                path.moveTo(x, y)
            else:
                path.lineTo(x, y)
        path.close()
        c.setFillColor(colors.Color(0.05, 0.49, 0.4, alpha=0.22))
        c.setStrokeColor(ACCENT)
        c.drawPath(path, fill=1, stroke=1)
        c.setFillColor(MUTED)
        c.setFont(FONT_REGULAR, 6.4)
        axis_labels = [short(axis.get("title"), 14) for axis in self.axes]
        while len(axis_labels) < count:
            axis_labels.append("-")
        for index, label in enumerate(axis_labels[:count]):
            angle = -math.pi / 2 + 2 * math.pi * index / count
            lx = cx + math.cos(angle) * (r + 0.18 * inch)
            ly = cy + math.sin(angle) * (r + 0.15 * inch)
            if lx < cx - 4:
                c.drawRightString(lx, ly, label)
            elif lx > cx + 4:
                c.drawString(lx, ly, label)
            else:
                c.drawCentredString(lx, ly, label)
        x0 = 2.35 * inch
        c.setFont(FONT_BOLD, 10)
        c.setFillColor(BRAND)
        c.drawString(x0, h - 0.34 * inch, "Radar de ejes humanos")
        c.setFont(FONT_BOLD, 7.4)
        c.setFillColor(MUTED)
        c.drawString(x0, h - 0.50 * inch, "Leyenda: nombre del eje + experiencias vinculadas")
        c.setFont(FONT_REGULAR, 7.8)
        c.setFillColor(MUTED)
        for index, axis in enumerate(self.axes[:6]):
            y = h - 0.78 * inch - index * 0.23 * inch
            c.setFillColor([ACCENT, GOLD, BLUE, PURPLE][index % 4])
            c.circle(x0 + 4, y + 3, 3, fill=1, stroke=0)
            c.setFillColor(MUTED)
            c.drawString(x0 + 14, y, f"{short(axis.get('title'), 32)} - {len(axis.get('items') or [])} exp.")
        c.restoreState()


def axis_legend_panel(axes):
    rows = [[
        para("Eje de analisis", "Small"),
        para("Lectura", "Small"),
        para("Evidencia", "Small"),
        para("Accion sugerida", "Small"),
    ]]
    for axis in axes[:8]:
        rows.append([
            para(axis.get("title", ""), "Small"),
            para(f"{axis.get('status', '-')}. Energia {axis.get('avgEnergy', 0)}/10.", "Small"),
            para(f"{len(axis.get('items') or [])} experiencias · {axis.get('assets', 0)} activos", "Small"),
            para(human_action(axis.get("action", ""), 95), "Small"),
        ])
    table = Table(rows, colWidths=[1.35 * inch, 1.35 * inch, 1.2 * inch, 1.77 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("BACKGROUND", (0, 1), (-1, -1), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def axis_cards(axes):
    rows = []
    width = PAGE_WIDTH - 2 * MARGIN
    for index, axis in enumerate(axes[:8]):
        color = AXIS_COLORS[index % len(AXIS_COLORS)]
        experiences = len(axis.get("items") or [])
        assets = int(num(axis.get("assets")))
        parts = []
        if axis.get("status") not in (None, "", "-"):
            parts.append(t("current_reading", value=axis.get("status")))
        if axis.get("avgEnergy") not in (None, ""):
            parts.append(t("axis_average_energy", value=axis.get("avgEnergy")))
        parts.append(t("axis_considered", experiences=experiences, assets=assets))
        parts.append(f"{t('next_action')}: {human_action(axis.get('action', ''), 180)}")
        body = " ".join(parts)
        rows.append([text_axis_card(axis.get("title") or t("axis"), body, color, width)])
    if not rows:
        return para(t("no_scope_findings"), "Bodyx")
    table = Table(rows, colWidths=[width])
    table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return table


def text_axis_card(title, body, accent, width):
    table = Table([[para(title, "H2x")], [para(short(body, 520), "Bodyx")]], colWidths=[width])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2faf4")),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 4, accent),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


class Waffle(Flowable):
    def __init__(self, title, value, note):
        super().__init__()
        self.title = title
        self.value = max(0, min(100, num(value)))
        self.note = note

    def wrap(self, avail_width, avail_height):
        self.width = avail_width
        self.height = 1.45 * inch
        return avail_width, self.height

    def draw(self):
        c = self.canv
        c.saveState()
        c.setFillColor(colors.white)
        c.setStrokeColor(LINE)
        c.roundRect(0, 0, self.width, self.height, 10, fill=1, stroke=1)
        c.setFillColor(BRAND)
        c.setFont(FONT_BOLD, 8.5)
        c.drawString(10, self.height - 17, clean(self.title)[:40])
        active = int(round(self.value / 4))
        size, gap = 6.5, 2.8
        left, top = 12, self.height - 34
        for index in range(25):
            row, col = index // 5, index % 5
            c.setFillColor(ACCENT if index < active else colors.HexColor("#e6edf4"))
            c.roundRect(left + col * (size + gap), top - row * (size + gap), size, size, 1.2, fill=1, stroke=0)
        c.setFillColor(BRAND)
        c.setFont(FONT_BOLD, 16)
        c.drawRightString(self.width - 12, self.height - 47, f"{int(round(self.value))}%")
        c.setFillColor(MUTED)
        c.setFont(FONT_REGULAR, 7)
        c.drawString(10, 9, clean(self.note)[:52])
        c.restoreState()


def metric_grid(items):
    columns = min(4, max(1, len(items)))
    cells = [[para(value, "Metric"), para(label, "MetricLabel")] for label, value in items]
    rows = []
    for index in range(0, len(cells), columns):
        row = cells[index : index + columns]
        while len(row) < columns:
            row.append("")
        rows.append(row)
    table = Table(rows or [[""]], colWidths=[(PAGE_WIDTH - 2 * MARGIN) / columns - 6] * columns)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("INNERGRID", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def card(title, body, meta=""):
    rows = [[para(title, "H2x")], [para(short(body, 260), "Bodyx")]]
    if meta:
        rows.append([para(meta, "Small")])
    table = Table(rows, colWidths=[(PAGE_WIDTH - 2 * MARGIN - 8) / 2])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return table


def two_columns(cards):
    rows = []
    for index in range(0, len(cards), 2):
        row = cards[index : index + 2]
        while len(row) < 2:
            row.append("")
        rows.append(row)
    table = Table(rows, colWidths=[(PAGE_WIDTH - 2 * MARGIN - 8) / 2] * 2)
    table.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 4), ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4)]))
    return table


def axis_table(axes):
    rows = [[para(t("axis"), "Small"), para(t("experiences"), "Small"), para(t("energy"), "Small"), para(t("next_action"), "Small")]]
    for axis in axes[:8]:
        rows.append([
            para(axis.get("title", ""), "Small"),
            para(str(len(axis.get("items") or [])), "Small"),
            # El default 0 de .get() no se aplicaba: la clave existe con valor
            # None, asi que la tabla imprimia literalmente "None/10".
            para(
                f"{axis['avgEnergy']}/10"
                if axis.get("avgEnergy") not in (None, "")
                else t("no_data"),
                "Small",
            ),
            para(human_action(axis.get("action", ""), 95), "Small"),
        ])
    table = Table(rows, colWidths=[1.35 * inch, 0.75 * inch, 0.62 * inch, 2.95 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def evidence_register(items):
    rows = [[para(t("date"), "Small"), para(t("item"), "Small"), para(t("type"), "Small"), para(t("status"), "Small")]]
    for item in items[:24]:
        readable = clean(item.get("analyticalText") or item.get("translatedText") or item.get("manualNote") or "")
        rows.append([
            para(natural_date(item.get("capturedAt") or item.get("timestamp")), "Small"),
            para(short(item.get("name") or item.get("experienceTitle") or t("unnamed_item"), 58), "Small"),
            para(item.get("kind") or t("evidence"), "Small"),
            para(t("with_reading") if readable else t("available"), "Small"),
        ])
    table = Table(rows, colWidths=[1.15 * inch, 2.95 * inch, 0.95 * inch, 0.8 * inch])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return table


def contextual_snapshot(payload, include_biometrics=True):
    digest = build_context_digest(payload)
    if not digest["has_context"]:
        return []
    flow = [para(t("context_findings"), "H1x")]
    if include_biometrics and digest["biometrics"]:
        flow.append(metric_grid(digest["biometrics"][:4]))
        flow.append(Spacer(1, 8))
    if digest["cards"]:
        flow.append(two_columns([
            card(title, body, meta)
            for title, body, meta in digest["cards"]
        ]))
    flow.append(Spacer(1, 4))
    flow.append(para(
        t("context_findings_note"),
        "Small",
    ))
    return flow


def build_signal_inventory_story(payload):
    inventory = payload.get("evidenceInventory") or {}
    measurements = inventory.get("measurements") or {}
    metrics = measurements.get("metrics") or {}
    items = list(payload.get("evidence") or []) + list(payload.get("contextEvidence") or [])
    has_measurements = bool(measurements.get("hasMeasurements"))
    records = int(num(measurements.get("records")))
    story = [CoverBlock(payload), PageBreak()]
    story.append(para(t("factual_summary"), "H1x"))
    story.append(metric_grid([
        (t("evidence"), inventory.get("evidence", 0)),
        (t("contexts"), inventory.get("context", 0)),
        (t("readable_text"), inventory.get("readable", 0)),
        (t("biometric_records"), records if has_measurements else "-"),
    ]))
    story.append(Spacer(1, 10))
    story.append(two_columns([
        card(t("how_read_output"), t("signal_explanation")),
        card(t("recommended_use"), t("recommended_use_body")),
    ]))
    story.append(para(t("available_measurements"), "H1x"))
    story.append(metric_grid([
        (t("heart_rate"), f"{round(num(metrics.get('heartAvg')))} bpm" if num(metrics.get("heartAvg")) else "-"),
        (t("steps"), f"{int(round(num(metrics.get('steps')))):,}" if num(metrics.get("steps")) else "-"),
        (t("sleep"), f"{num(metrics.get('sleepMinutes')) / 60:.1f} h" if num(metrics.get("sleepMinutes")) else "-"),
        (t("active_energy"), f"{round(num(metrics.get('activeEnergy')))} kcal" if num(metrics.get("activeEnergy")) else "-"),
    ]))
    story.append(Spacer(1, 8))
    story.append(para(t("signals_rule"), "Small"))
    story.extend(contextual_snapshot(payload, include_biometrics=False))
    story.append(para(t("evidence_register"), "H1x"))
    story.append(evidence_register(items) if items else para(t("no_evidence_period"), "Bodyx"))
    story.append(Spacer(1, 8))
    story.append(para(t("signals_closing"), "Small"))
    return story


def build_story(payload):
    axes = payload.get("axes") or []
    insights = payload.get("insights") or []
    action_plan = payload.get("actionPlan") or []
    experiences = payload.get("experiences", 0)
    output_scope = payload.get("outputScope") or {}
    if output_scope.get("presentationMode") == "signal_inventory":
        return build_signal_inventory_story(payload)
    story = [CoverBlock(payload), PageBreak()]
    story.append(para(t("executive_summary"), "H1x"))
    story.append(metric_grid([
        (t("experiences"), experiences),
        (t("evidence"), output_scope.get("evidence", 0)),
        (t("contexts"), output_scope.get("context", 0)),
        (t("human_axes"), len(axes)),
        (t("findings"), len(insights)),
        (t("actions"), len(action_plan)),
    ]))
    story.append(Spacer(1, 10))
    story.extend(contextual_snapshot(payload))
    story.append(para(t("human_axis_map"), "H1x"))
    story.append(axis_cards(axes))
    story.append(Spacer(1, 8))
    # Media solo sobre ejes CON dato: rellenar las ausencias con 0 hundia el
    # resultado (energia 8/10 en un eje de ocho => 1.0 => waffle al 10%).
    axis_energies = [
        num(axis.get("avgEnergy")) for axis in axes if axis.get("avgEnergy") not in (None, "")
    ]
    avg_axis_energy = (sum(axis_energies) / len(axis_energies)) if axis_energies else None
    # Cobertura tematica = ejes CON evidencia / ejes totales (que es lo que dice
    # la etiqueta). La formula anterior dividia por len(axes) * experiencias, y
    # como cada experiencia cae en un solo eje, no podia superar el 12,5%.
    covered_axes = sum(1 for axis in axes if (axis.get("items") or []))
    coverage = (covered_axes / max(1, len(axes))) * 100
    waffles = [Waffle(t("thematic_coverage"), coverage, t("axes_with_evidence"))]
    if avg_axis_energy is not None:
        waffles.append(Waffle(t("axis_average_energy"), avg_axis_energy * 10, t("aggregated_energy")))
    story.append(two_columns(waffles))
    story.append(para(t("action_plan"), "H1x"))
    plan_cards = []
    for index, action in enumerate(action_plan[:6]):
        meta = f"{clean(action.get('priority') or t('medium_priority'))} - {clean(action.get('horizon') or t('next_7_days'))}"
        body = (
            f"{clean(action.get('why') or '')} "
            f"{t('observed_basis')}: {clean(action.get('evidence') or '')}. "
            f"{t('next_action')}: {human_action(action.get('next') or '', 150)}"
        )
        plan_cards.append(card(f"{index + 1}. {clean(action.get('title') or t('action'))}", body, meta))
    story.append(two_columns(plan_cards) if plan_cards else para(t("no_actions"), "Bodyx"))
    story.append(para(t("prioritized_findings"), "H1x"))
    cards = []
    for index, insight in enumerate(insights[:8]):
        meta = f"{clean(insight.get('type') or t('finding'))} - {t('confidence').lower()} {insight.get('confidence', 0)}%"
        body = f"{clean(insight.get('description', ''))} {t('next_action')}: {human_action(insight.get('action', ''), 140)}"
        cards.append(card(f"{index + 1}. {insight.get('title', t('finding'))}", body, meta))
    story.append(two_columns(cards) if cards else para(t("no_scope_findings"), "Bodyx"))
    story.append(para(t("exploration_axes"), "H1x"))
    story.append(axis_table(axes))
    story.append(Spacer(1, 8))
    story.append(para(t("insights_closing"), "Small"))
    return story


def main():
    payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    set_locale(payload.get("language") or payload.get("locale"))
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=draw_page)])
    doc.build(build_story(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
