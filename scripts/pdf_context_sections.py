"""Normalize contextual output data for the ReportLab documents."""

from collections.abc import Mapping

from pdf_i18n import t


def build_context_digest(payload):
    inventory = _mapping(payload.get("evidenceInventory"))
    measurements = _mapping(inventory.get("measurements"))
    biometric = _mapping(payload.get("biometricContext"))
    current = _mapping(payload.get("currentContext"))
    briefing = _mapping(current.get("briefing"))
    impact = _mapping(payload.get("contextImpact") or briefing.get("impact"))
    signals = list(payload.get("contextEvidence") or [])

    metrics = {}
    metrics.update(_mapping(measurements.get("metrics")))
    metrics.update(_mapping(biometric.get("metrics")))
    for signal in signals:
        if str(_mapping(signal).get("kind") or "").lower() in ("biometric", "sensor"):
            metrics.update(_mapping(_mapping(signal).get("metrics")))

    biometric_items = _biometric_items(metrics)
    records = _number(biometric.get("records"), measurements.get("records"))
    if records is not None:
        biometric_items.append((t("records_considered"), f"{int(records)}"))

    location = _format_location(
        current.get("latestLocation")
        or briefing.get("location")
        or impact.get("location")
        or _first_signal_value(signals, "location", "location")
    )
    weather = _mapping(
        current.get("latestWeather")
        or briefing.get("weather")
        or impact.get("weather")
        or _first_signal_payload(signals, "weather")
    )
    news = (
        current.get("latestNews")
        or briefing.get("news")
        or impact.get("geopoliticalNews")
        or _first_signal_payload(signals, "news")
    )
    entertainment = (
        current.get("latestEntertainment")
        or briefing.get("entertainment")
        or _first_signal_payload(signals, "entertainment")
    )
    agenda = briefing.get("agendaLinks") or _first_signal_payload(signals, "agenda")

    cards = []
    if location:
        cards.append((t("observed_place"), location, t("period_location")))
    weather_text = _format_weather(weather)
    if weather_text:
        cards.append((t("observed_weather"), weather_text, t("recorded_conditions")))
    news_items = _collect_items(news, ("title", "headline", "name"))
    if news_items:
        cards.append((
            t("related_news"),
            " · ".join(news_items[:4]),
            t("current_period_sources"),
        ))
    entertainment_items = _collect_items(entertainment, ("title", "name"))
    entertainment_items.extend(
        item for item in _collect_items(agenda, ("title", "label", "name"))
        if item not in entertainment_items
    )
    if entertainment_items:
        cards.append((
            t("entertainment"),
            " · ".join(entertainment_items[:4]),
            t("date_place_options"),
        ))
    impact_text = _format_impact(impact)
    if impact_text:
        cards.append((
            t("contextual_impact"),
            impact_text,
            t("environment_current_reading"),
        ))

    return {
        "biometrics": biometric_items,
        "cards": cards,
        "has_context": bool(biometric_items or cards),
    }


def _biometric_items(metrics):
    definitions = [
        (("heartAvg", "averageHeartRate", "heartRate", "heart_rate", "bpm"), t("heart_rate"), " bpm", 0),
        (("steps", "stepCount", "step_count"), t("steps"), "", 0),
        (("sleepMinutes", "totalSleepMinutes", "sleep_minutes"), t("sleep"), " min", 0),
        (("activeEnergy", "activeCalories", "active_energy", "active_calories"), t("active_energy"), " kcal", 0),
        (("spo2", "bloodOxygen", "oxygenSaturation"), t("blood_oxygen"), "%", 1),
        (("hrv", "heartRateVariability"), t("heart_variability"), " ms", 0),
    ]
    items = []
    for aliases, label, suffix, decimals in definitions:
        value = _metric(metrics, aliases)
        if value is None:
            continue
        if label == t("sleep"):
            items.append((label, f"{value / 60:.1f} h"))
        elif label == t("steps"):
            items.append((label, f"{int(round(value)):,}"))
        else:
            items.append((label, f"{value:.{decimals}f}{suffix}"))
    return items


def _format_location(value):
    if isinstance(value, str):
        return value.strip()
    location = _mapping(value)
    label = (
        location.get("label")
        or location.get("name")
        or location.get("city")
        or location.get("location")
    )
    country = location.get("country") or location.get("countryCode")
    parts = [str(item).strip() for item in (label, country) if str(item or "").strip()]
    latitude = _number(location.get("latitude"), location.get("lat"))
    longitude = _number(location.get("longitude"), location.get("lon"))
    if not parts and latitude is not None and longitude is not None:
        return f"{latitude:.4f}, {longitude:.4f}"
    return ", ".join(dict.fromkeys(parts))


def _format_weather(weather):
    if not weather:
        return ""
    parts = []
    description = weather.get("description") or weather.get("summary")
    if description:
        parts.append(str(description).strip().capitalize())
    temperature = _number(
        weather.get("temperatureC"),
        weather.get("temperature"),
        weather.get("currentTemperature"),
    )
    humidity = _number(weather.get("humidity"), weather.get("humidityPct"))
    wind = _number(weather.get("windKph"), weather.get("windSpeed"))
    rain = _number(weather.get("rainMm"), weather.get("precipitation"))
    if temperature is not None:
        parts.append(f"{temperature:.1f} °C")
    if humidity is not None:
        parts.append(t("humidity", value=f"{humidity:.0f}"))
    if wind is not None:
        parts.append(t("wind", value=f"{wind:.0f}"))
    if rain is not None:
        parts.append(t("rain", value=f"{rain:.1f}"))
    return ", ".join(parts)


def _format_impact(impact):
    if not impact:
        return ""
    summary = impact.get("summary") or impact.get("description")
    score = _number(impact.get("score"), impact.get("impactScore"))
    parts = []
    if summary:
        parts.append(str(summary).strip())
    if score is not None:
        parts.append(t("observed_level", value=f"{score:.0f}"))
    return " ".join(parts)


def _collect_items(value, title_keys, depth=0):
    if value is None or depth > 4:
        return []
    if isinstance(value, str):
        text = value.strip()
        return [text] if text else []
    if isinstance(value, (list, tuple)):
        output = []
        for item in value:
            output.extend(_collect_items(item, title_keys, depth + 1))
        return list(dict.fromkeys(output))
    if not isinstance(value, Mapping):
        return []

    title = next((value.get(key) for key in title_keys if value.get(key)), None)
    if title:
        source = value.get("source") or value.get("domain") or value.get("venue")
        text = str(title).strip()
        if source and str(source).strip().lower() not in text.lower():
            text = f"{text} ({str(source).strip()})"
        return [text]

    output = []
    for key in (
        "items",
        "articles",
        "headlines",
        "local",
        "global",
        "world",
        "sections",
        "events",
        "links",
    ):
        output.extend(_collect_items(value.get(key), title_keys, depth + 1))
    return list(dict.fromkeys(output))


def _first_signal_value(signals, kind, key):
    for signal in signals:
        item = _mapping(signal)
        if str(item.get("kind") or "").lower() == kind and item.get(key):
            return item.get(key)
    return None


def _first_signal_payload(signals, kind):
    for signal in signals:
        item = _mapping(signal)
        if str(item.get("kind") or "").lower() == kind:
            return item.get("payload") or item
    return None


def _metric(metrics, aliases):
    for alias in aliases:
        if alias in metrics:
            value = _number(metrics.get(alias))
            if value is not None:
                return value
    return None


def _number(*values):
    for value in values:
        if value in (None, "") or isinstance(value, bool):
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return None


def _mapping(value):
    return value if isinstance(value, Mapping) else {}
