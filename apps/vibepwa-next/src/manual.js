let locale = normalizeLocale(localStorage.getItem("vibe-next-language") || navigator.language);
const copies = {
  es: {
    guide: "Guía de uso", back: "Volver a Vibe", language: "Idioma", print: "Descargar o imprimir PDF",
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
      ["Grupos y personas", "La cuenta es siempre tuya. Los grupos o personas permiten separar historias de familia, viajes, proyectos u otros contextos. Al dar uno de baja, sus historias se conservan y deja de aparecer en nuevas capturas."],
      ["Experiencias y eventos", "Una historia representa una experiencia completa. Los eventos son submomentos opcionales con significado propio. Puedes narrar la experiencia, uno o varios eventos, o ambos; la evidencia elegida se vincula al guardar todo en una sola operación."],
      ["Oura y salud", "Vibeapp es la vía normal para HealthKit y Health Connect. Oura puede conectarse desde Cuenta. Sueño, pulso, pasos y recuperación son contexto; no se convierten en historias por sí solos."],
      ["Reportes, hallazgos y publicaciones", "Reportes y hallazgos se filtran por fecha, persona y área de vida y usan hechos, mediciones y contexto. Las publicaciones también pueden usar historias narradas y preparar un PDF cronológico; los videos se incluyen en el paquete descargable."],
      ["Mapa y Obsidian", "Obsidian recibe una proyección revisable del conocimiento. Vibe y Supabase siguen siendo la fuente principal. El export preserva la curaduría humana y regenera solo su bloque automático."],
      ["Privacidad y operación", "Cada usuario solo consulta su espacio. La administración y el diagnóstico están en Cuenta y permanecen plegados. Nunca se muestra un dato ausente como cero ni una sincronización incompleta como exitosa."],
    ],
  },
  en: {
    guide: "User guide", back: "Back to Vibe", language: "Language", print: "Download or print PDF",
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
      ["Groups and people", "The account is always yours. Groups or people separate family, trip, project, or other stories. Deactivation keeps existing data and removes the group from new captures."],
      ["Experiences and events", "A story represents a complete experience. Events are optional sub-moments with their own meaning. You may narrate the experience, its events, or both; selected evidence is linked in one save operation."],
      ["Oura and health", "Vibeapp is the normal path for HealthKit and Health Connect. Oura connects from Account. Sleep, heart rate, steps, and recovery are context and never become stories on their own."],
      ["Reports, findings, and publications", "Reports and findings filter by date, person, and life area and use facts, measurements, and context. Publications may also include narrated stories and create a chronological PDF; videos are delivered in the download package."],
      ["Map and Obsidian", "Obsidian receives a reviewable knowledge projection. Vibe and Supabase remain the source of truth. Export preserves human curation and regenerates only its automatic block."],
      ["Privacy and operations", "Each user sees only their space. Administration and diagnostics live under Account and stay collapsed. Missing data is never shown as zero, and incomplete sync is never reported as successful."],
    ],
  },
  fr: {
    guide: "Guide d'utilisation", back: "Retour à Vibe", language: "Langue", print: "Télécharger ou imprimer le PDF",
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
      ["Groupes et personnes", "Le compte reste toujours le vôtre. Les groupes ou personnes séparent les histoires de famille, voyage ou projet. La désactivation conserve les données et retire le groupe des nouvelles captures."],
      ["Expériences et événements", "Une histoire représente une expérience complète. Les événements sont des sous-moments facultatifs. Vous pouvez raconter l'expérience, ses événements ou les deux; les preuves choisies sont liées en une seule sauvegarde."],
      ["Oura et santé", "Vibeapp est la voie normale pour HealthKit et Health Connect. Oura se connecte depuis Compte. Sommeil, fréquence cardiaque, pas et récupération sont du contexte, jamais des histoires isolées."],
      ["Rapports, constats et publications", "Rapports et constats filtrent par date, personne et domaine de vie. Les publications peuvent aussi utiliser les histoires racontées et créer un PDF chronologique; les vidéos accompagnent le paquet téléchargé."],
      ["Carte et Obsidian", "Obsidian reçoit une projection révisable des connaissances. Vibe et Supabase restent la source principale. L'export préserve la curation humaine et régénère uniquement son bloc automatique."],
      ["Confidentialité et opérations", "Chaque utilisateur ne voit que son espace. Administration et diagnostic restent repliés dans Compte. Une donnée absente ne devient jamais zéro et une synchronisation incomplète n'est jamais annoncée comme réussie."],
    ],
  },
  pt: {
    guide: "Guia de uso", back: "Voltar ao Vibe", language: "Idioma", print: "Baixar ou imprimir PDF",
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
      ["Grupos e pessoas", "A conta é sempre sua. Grupos ou pessoas separam histórias de família, viagens, projetos e outros contextos. A desativação conserva os dados e retira o grupo de novas capturas."],
      ["Experiências e eventos", "Uma história representa uma experiência completa. Eventos são submomentos opcionais. Você pode narrar a experiência, seus eventos ou ambos; as evidências escolhidas são vinculadas em uma única gravação."],
      ["Oura e saúde", "O Vibeapp é a via normal para HealthKit e Health Connect. Oura é conectado em Conta. Sono, frequência cardíaca, passos e recuperação são contexto e nunca viram histórias por si só."],
      ["Relatórios, descobertas e publicações", "Relatórios e descobertas filtram por data, pessoa e área da vida e usam fatos, medições e contexto. Publicações também podem usar histórias narradas e gerar PDF cronológico; vídeos acompanham o pacote baixado."],
      ["Mapa e Obsidian", "Obsidian recebe uma projeção revisável do conhecimento. Vibe e Supabase continuam como fonte principal. A exportação preserva a curadoria humana e regenera apenas o bloco automático."],
      ["Privacidade e operação", "Cada usuário consulta apenas seu espaço. Administração e diagnóstico ficam recolhidos em Conta. Dado ausente nunca aparece como zero e sincronização incompleta nunca aparece como concluída."],
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
      <button id="printManual" class="button secondary" type="button">${escapeHtml(copy.print)}</button>
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
  document.getElementById("printManual")?.addEventListener("click", () => window.print());
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
