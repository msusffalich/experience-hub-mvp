let locale = normalizeLocale(localStorage.getItem("vibe-next-language") || navigator.language);
const copies = {
  es: {
    guide: "Guía de uso", back: "Volver a Vibe", language: "Idioma",
    sections: [
      ["Una idea sencilla", "Vibeapp captura lo que ocurre. VibePWA organiza esa evidencia, arma historias y genera inteligencia y publicaciones."],
      ["Inicio", "Resume historias, activos, evidencia por organizar y calidad narrativa. Desde aquí puedes abrir una historia o crear una nueva."],
      ["Historias", "Escribe un título, cuenta qué ocurrió, elige el área de vida, confirma fecha, lugar y personas, selecciona visualmente la evidencia y guarda."],
      ["Evidencia", "La galería reúne fotos, videos, audios y documentos. «Por organizar» significa que el archivo está seguro, pero todavía no pertenece a una historia."],
      ["Inteligencia", "Los mismos filtros de fecha y área definen reportes y hallazgos. Los datos ausentes se muestran como insuficientes; nunca se convierten en cero."],
      ["Publicar", "Elige historias para generar un PDF cronológico. Si incluyen videos, Vibe descarga un ZIP con el PDF y los videos."],
      ["Cuenta", "Configura español, inglés, francés o portugués, además del tema claro u oscuro. El diagnóstico técnico permanece plegado."],
      ["Sin conexión", "El móvil conserva cada archivo y reintenta con la misma identidad. Solo lo elimina de la cola cuando el servidor confirma que quedó guardado."],
      ["Narrativa y contexto", "Narrativa es tu lenguaje contando lo vivido. Biometría, ubicación, clima, OCR y visión IA enriquecen el momento, pero no reemplazan tu relato."],
    ],
  },
  en: {
    guide: "User guide", back: "Back to Vibe", language: "Language",
    sections: [
      ["One simple idea", "Vibeapp captures what happens. VibePWA organizes that evidence, builds stories, and produces intelligence and publications."],
      ["Home", "See stories, assets, evidence to organize, and narrative quality. Open a recent story or start a new one."],
      ["Stories", "Add a title, describe what happened, choose the life area, confirm date, place, and people, select evidence visually, and save."],
      ["Evidence", "The gallery brings together photos, videos, audio, and documents. “To organize” means the file is safe but does not belong to a story yet."],
      ["Intelligence", "The same date and area filters define reports and findings. Missing data is shown as insufficient and is never converted to zero."],
      ["Publish", "Choose stories to generate a chronological PDF. When they contain videos, Vibe downloads a ZIP with the PDF and those videos."],
      ["Account", "Choose Spanish, English, French, or Portuguese and a light or dark theme. Technical diagnostics remain collapsed."],
      ["Offline", "The mobile device keeps each file and retries with the same identity. It leaves the queue only after the server confirms durable storage."],
      ["Narrative and context", "Narrative is your language describing what you lived. Biometrics, location, weather, OCR, and AI vision enrich the moment but do not replace your story."],
    ],
  },
  fr: {
    guide: "Guide d'utilisation", back: "Retour à Vibe", language: "Langue",
    sections: [
      ["Une idée simple", "Vibeapp capture ce qui se passe. VibePWA organise les preuves, construit les histoires et produit des analyses et publications."],
      ["Accueil", "Consultez les histoires, les actifs, les preuves à organiser et la qualité narrative. Ouvrez une histoire ou commencez-en une nouvelle."],
      ["Histoires", "Ajoutez un titre, racontez ce qui s'est passé, choisissez le domaine de vie, confirmez la date, le lieu et les personnes, sélectionnez les preuves et enregistrez."],
      ["Preuves", "La galerie réunit photos, vidéos, audios et documents. « À organiser » signifie que le fichier est sûr mais n'appartient pas encore à une histoire."],
      ["Intelligence", "Les mêmes filtres de date et de domaine définissent rapports et constats. Une donnée absente est indiquée comme insuffisante, jamais comme zéro."],
      ["Publier", "Choisissez des histoires pour créer un PDF chronologique. Si elles contiennent des vidéos, Vibe télécharge un ZIP avec le PDF et les vidéos."],
      ["Compte", "Choisissez l'espagnol, l'anglais, le français ou le portugais, ainsi qu'un thème clair ou sombre. Le diagnostic technique reste replié."],
      ["Hors connexion", "Le mobile conserve chaque fichier et réessaie avec la même identité. Il ne quitte la file qu'après confirmation durable du serveur."],
      ["Récit et contexte", "Le récit est votre langage pour raconter ce que vous avez vécu. Biométrie, lieu, météo, OCR et vision IA enrichissent le moment sans remplacer votre récit."],
    ],
  },
  pt: {
    guide: "Guia de uso", back: "Voltar ao Vibe", language: "Idioma",
    sections: [
      ["Uma ideia simples", "O Vibeapp captura o que acontece. O VibePWA organiza as evidências, monta histórias e produz inteligência e publicações."],
      ["Início", "Veja histórias, ativos, evidências para organizar e qualidade narrativa. Abra uma história recente ou crie uma nova."],
      ["Histórias", "Adicione um título, conte o que aconteceu, escolha a área da vida, confirme data, lugar e pessoas, selecione visualmente as evidências e salve."],
      ["Evidências", "A galeria reúne fotos, vídeos, áudios e documentos. «Para organizar» significa que o arquivo está seguro, mas ainda não pertence a uma história."],
      ["Inteligência", "Os mesmos filtros de data e área definem relatórios e descobertas. Dados ausentes aparecem como insuficientes e nunca viram zero."],
      ["Publicar", "Escolha histórias para gerar um PDF cronológico. Quando houver vídeos, o Vibe baixa um ZIP com o PDF e os vídeos."],
      ["Conta", "Escolha espanhol, inglês, francês ou português e o tema claro ou escuro. O diagnóstico técnico permanece recolhido."],
      ["Sem conexão", "O celular conserva cada arquivo e tenta novamente com a mesma identidade. Ele só sai da fila após a confirmação durável do servidor."],
      ["Narrativa e contexto", "Narrativa é a sua linguagem contando o que viveu. Biometria, localização, clima, OCR e visão de IA enriquecem o momento, mas não substituem o seu relato."],
    ],
  },
};

renderManual();

function renderManual() {
  const copy = copies[locale] || copies.es;
  document.documentElement.lang = locale;
  document.getElementById("manual").innerHTML = `
  <header>
    <div><p class="eyebrow">${escapeHtml(copy.guide)}</p><h1>VibePWA 2</h1></div>
    <div>
      <label for="manualLanguage">${escapeHtml(copy.language)}</label>
      <select id="manualLanguage">
        <option value="es">Español</option><option value="en">English</option>
        <option value="fr">Français</option><option value="pt">Português</option>
      </select>
      <a class="button secondary" href="./index.html">${escapeHtml(copy.back)}</a>
    </div>
  </header>
  ${copy.sections.map(([title, body]) => `<section><h2>${escapeHtml(title)}</h2><p>${escapeHtml(body)}</p></section>`).join("")}`;

  const selector = document.getElementById("manualLanguage");
  selector.value = locale;
  selector.addEventListener("change", () => {
    locale = normalizeLocale(selector.value);
    localStorage.setItem("vibe-next-language", locale);
    renderManual();
  });
}

function normalizeLocale(value) {
  const code = String(value || "es").slice(0, 2).toLowerCase();
  return ["es", "en", "fr", "pt"].includes(code) ? code : "es";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character]));
}
