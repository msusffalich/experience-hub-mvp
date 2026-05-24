import io
import json
import math
import sys
from datetime import datetime, timezone
from html import escape
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import BaseDocTemplate, Frame, Flowable, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle


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


def clean(value):
    text = str(value or "").replace("\n", " ").replace("\r", " ")
    return " ".join(text.split())


def polish(value):
    return (
        clean(value)
        .replace("Diagnostico", "Diagnóstico")
        .replace("Energia", "Energía")
        .replace("energia", "energía")
        .replace("tematica", "temática")
        .replace("proporcion", "proporción")
        .replace("accion", "acción")
        .replace("auditoria", "auditoría")
        .replace("tecnica", "técnica")
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
    base.add(ParagraphStyle("CoverTitle", parent=base["Title"], fontName="Helvetica-Bold", fontSize=32, leading=36, textColor=colors.white, alignment=TA_LEFT))
    base.add(ParagraphStyle("CoverSub", parent=base["Normal"], fontSize=12, leading=16, textColor=colors.HexColor("#eaf3f4")))
    base.add(ParagraphStyle("H1x", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=BRAND, spaceBefore=12, spaceAfter=8))
    base.add(ParagraphStyle("H2x", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=15, textColor=BRAND, spaceAfter=5))
    base.add(ParagraphStyle("Bodyx", parent=base["BodyText"], fontSize=9.3, leading=13, textColor=colors.HexColor("#2d3742")))
    base.add(ParagraphStyle("Small", parent=base["BodyText"], fontSize=7.7, leading=10, textColor=MUTED))
    base.add(ParagraphStyle("Metric", parent=base["BodyText"], fontName="Helvetica-Bold", fontSize=18, leading=22, alignment=TA_CENTER, textColor=BRAND))
    base.add(ParagraphStyle("MetricLabel", parent=base["BodyText"], fontSize=7.2, leading=9, alignment=TA_CENTER, textColor=MUTED))
    return base


STYLES = styles()


def para(text, style="Bodyx"):
    return Paragraph(escape(polish(text)), STYLES[style])


def draw_logo(canvas, x, y, width=1.25 * inch):
    if LOGO_PATH.exists():
        canvas.drawImage(str(LOGO_PATH), x, y, width=width, height=width * 0.545, preserveAspectRatio=True, mask="auto")


def draw_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#f8fafb"))
    canvas.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, fill=1, stroke=0)
    canvas.setFillColor(BRAND)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(MARGIN, 0.32 * inch, "Vibe - Hallazgos de experiencias")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(PAGE_WIDTH - MARGIN, 0.32 * inch, f"Pagina {doc.page}")
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
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 30)
        c.drawString(0.38 * inch, self.height - 1.42 * inch, "Hallazgos de experiencias")
        c.setFont("Helvetica", 12)
        c.drawString(0.4 * inch, self.height - 1.76 * inch, "Diagnóstico visual, ejes humanos y recomendaciones accionables.")
        metrics = [
            ("Experiencias", self.payload.get("experiences", 0)),
            ("Ejes", len(self.payload.get("axes") or [])),
            ("Hallazgos", len(self.payload.get("insights") or [])),
            ("Alcance", short(self.payload.get("participant") or "General", 18)),
        ]
        y = self.height - 2.55 * inch
        for index, (label, value) in enumerate(metrics):
            x = 0.4 * inch + index * 1.28 * inch
            c.setFillColor(colors.Color(1, 1, 1, alpha=0.13))
            c.roundRect(x, y, 1.08 * inch, 0.76 * inch, 9, fill=1, stroke=0)
            c.setFillColor(colors.white)
            c.setFont("Helvetica-Bold", 13)
            c.drawCentredString(x + 0.54 * inch, y + 0.39 * inch, str(value)[:14])
            c.setFont("Helvetica", 6.8)
            c.drawCentredString(x + 0.54 * inch, y + 0.16 * inch, label.upper())
        c.setFillColor(colors.HexColor("#eaf3f4"))
        c.setFont("Helvetica", 9)
        c.drawString(0.4 * inch, 0.55 * inch, f"Generado: {clean(self.payload.get('generatedAt') or datetime.now(timezone.utc).isoformat())}")
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
        c.setFont("Helvetica", 6.4)
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
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(BRAND)
        c.drawString(x0, h - 0.34 * inch, "Radar de ejes humanos")
        c.setFont("Helvetica-Bold", 7.4)
        c.setFillColor(MUTED)
        c.drawString(x0, h - 0.50 * inch, "Leyenda: nombre del eje + experiencias vinculadas")
        c.setFont("Helvetica", 7.8)
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
            para(human_action(axis.get("action", ""), 120), "Small"),
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
        c.setFont("Helvetica-Bold", 8.5)
        c.drawString(10, self.height - 17, clean(self.title)[:40])
        active = int(round(self.value / 4))
        size, gap = 6.5, 2.8
        left, top = 12, self.height - 34
        for index in range(25):
            row, col = index // 5, index % 5
            c.setFillColor(ACCENT if index < active else colors.HexColor("#e6edf4"))
            c.roundRect(left + col * (size + gap), top - row * (size + gap), size, size, 1.2, fill=1, stroke=0)
        c.setFillColor(BRAND)
        c.setFont("Helvetica-Bold", 16)
        c.drawRightString(self.width - 12, self.height - 47, f"{int(round(self.value))}%")
        c.setFillColor(MUTED)
        c.setFont("Helvetica", 7)
        c.drawString(10, 9, clean(self.note)[:52])
        c.restoreState()


def metric_grid(items):
    cells = [[para(str(value), "Metric"), para(label, "MetricLabel")] for label, value in items]
    table = Table([cells], colWidths=[(PAGE_WIDTH - 2 * MARGIN) / 4 - 6] * 4)
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
    rows = [[para("Eje", "Small"), para("Experiencias", "Small"), para("Energia", "Small"), para("Siguiente accion", "Small")]]
    for axis in axes[:8]:
        rows.append([
            para(axis.get("title", ""), "Small"),
            para(str(len(axis.get("items") or [])), "Small"),
            para(f"{axis.get('avgEnergy', 0)}/10", "Small"),
            para(human_action(axis.get("action", ""), 115), "Small"),
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


def build_story(payload):
    axes = payload.get("axes") or []
    insights = payload.get("insights") or []
    experiences = payload.get("experiences", 0)
    story = [CoverBlock(payload), PageBreak()]
    story.append(para("Resumen de salida", "H1x"))
    story.append(metric_grid([
        ("Experiencias", experiences),
        ("Ejes humanos", len(axes)),
        ("Hallazgos", len(insights)),
        ("Participante", short(payload.get("participant") or "General", 16)),
    ]))
    story.append(Spacer(1, 10))
    story.append(para("Leyenda de ejes humanos", "H1x"))
    story.append(axis_legend_panel(axes))
    story.append(Spacer(1, 8))
    avg_axis_energy = sum(num(axis.get("avgEnergy")) for axis in axes) / max(1, len(axes))
    coverage = min(100, (sum(len(axis.get("items") or []) for axis in axes) / max(1, len(axes) * max(1, num(experiences)))) * 100)
    story.append(two_columns([
        Waffle("Cobertura tematica", coverage, "Waffle: proporcion de ejes con evidencia"),
        Waffle("Energia media de ejes", avg_axis_energy * 10, "Waffle: lectura agregada de energia"),
    ]))
    story.append(para("Hallazgos priorizados", "H1x"))
    cards = []
    for index, insight in enumerate(insights[:8]):
        meta = f"{clean(insight.get('type') or 'Hallazgo')} - confianza {insight.get('confidence', 0)}%"
        body = f"{insight.get('description', '')} Siguiente paso sugerido: {human_action(insight.get('action', ''), 140)}"
        cards.append(card(f"{index + 1}. {insight.get('title', 'Hallazgo')}", body, meta))
    story.append(two_columns(cards) if cards else para("No hay hallazgos suficientes para este alcance.", "Bodyx"))
    story.append(para("Ejes de exploracion", "H1x"))
    story.append(axis_table(axes))
    story.append(Spacer(1, 8))
    story.append(para("Este PDF resume decisiones, evidencia y recomendaciones. JSON/CSV quedan para auditoria tecnica; este documento es la salida ejecutiva para lectura humana.", "Small"))
    return story


def main():
    payload = json.load(sys.stdin)
    buffer = io.BytesIO()
    frame = Frame(MARGIN, MARGIN + 0.22 * inch, PAGE_WIDTH - 2 * MARGIN, PAGE_HEIGHT - 2 * MARGIN - 0.25 * inch, showBoundary=0)
    doc = BaseDocTemplate(buffer, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN)
    doc.addPageTemplates([PageTemplate(id="main", frames=[frame], onPage=draw_page)])
    doc.build(build_story(payload))
    sys.stdout.buffer.write(buffer.getvalue())


if __name__ == "__main__":
    main()
