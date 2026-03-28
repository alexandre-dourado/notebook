/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║                  NOTEBOOK PWA — APP.JS                         ║
 * ║  Arquitetura: módulos IIFE organizados por responsabilidade     ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

/* ═══════════════════════════════════════════════════════════════════
   ESTADO GLOBAL
   ═══════════════════════════════════════════════════════════════════ */
const App = {
  files:        [],   // lista completa vinda da GitHub API
  filtered:     [],   // lista após busca
  currentFile:  null, // arquivo aberto
  sortMode:     "manual", // "manual" | "alpha" | "date"
  readingMode:  false,
  theme:        "dark",
  isLoading:    false,
};

/* ═══════════════════════════════════════════════════════════════════
   STORAGE — persiste tudo no localStorage
   ═══════════════════════════════════════════════════════════════════ */
const Store = (() => {
  const KEYS = {
    FAVORITES:  "nb_favorites",
    ORDER:      "nb_order",
    GROUPS:     "nb_groups",
    LAST_FILE:  "nb_last_file",
    THEME:      "nb_theme",
    SORT:       "nb_sort",
    SIDEBAR:    "nb_sidebar",
  };

  const get = (key, fallback = null) => {
    try {
      const v = localStorage.getItem(key);
      return v !== null ? JSON.parse(v) : fallback;
    } catch { return fallback; }
  };

  const set = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn("Storage error:", e); }
  };

  return {
    getFavorites:  () => get(KEYS.FAVORITES, []),
    setFavorites:  (v) => set(KEYS.FAVORITES, v),

    getOrder:      () => get(KEYS.ORDER, []),
    setOrder:      (v) => set(KEYS.ORDER, v),

    getGroups:     () => get(KEYS.GROUPS, []),
    setGroups:     (v) => set(KEYS.GROUPS, v),

    getLastFile:   () => get(KEYS.LAST_FILE, null),
    setLastFile:   (v) => set(KEYS.LAST_FILE, v),

    getTheme:      () => get(KEYS.THEME, "dark"),
    setTheme:      (v) => set(KEYS.THEME, v),

    getSort:       () => get(KEYS.SORT, "manual"),
    setSort:       (v) => set(KEYS.SORT, v),

    getSidebarOpen: ()  => get(KEYS.SIDEBAR, true),
    setSidebarOpen: (v) => set(KEYS.SIDEBAR, v),
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   GITHUB API
   ═══════════════════════════════════════════════════════════════════ */
const GitHub = (() => {
  const BASE = "https://api.github.com";

  const headers = () => {
    const h = { Accept: "application/vnd.github.v3+json" };
    if (CONFIG.GITHUB_TOKEN) h["Authorization"] = `token ${CONFIG.GITHUB_TOKEN}`;
    return h;
  };

  /**
   * Lista os arquivos de uma pasta do repositório.
   * Suporta .md, .html e .txt apenas.
   */
  const listFiles = async () => {
    const { GITHUB_OWNER, GITHUB_REPO, GITHUB_PATH } = CONFIG;
    const url = `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_PATH}`;

    const res = await fetch(url, { headers: headers() });
    if (!res.ok) throw new Error(`GitHub API: ${res.status} ${res.statusText}`);

    const data = await res.json();

    return data
      .filter(f => f.type === "file" && /\.(md|html|txt)$/i.test(f.name))
      .map(f => ({
        name:         f.name,
        path:         f.path,
        downloadUrl:  f.download_url,
        sha:          f.sha,
        size:         f.size,
        ext:          f.name.split(".").pop().toLowerCase(),
        date:         null, // preenchido em batch assíncrono
        content:      null, // cache local
      }));
  };

  /**
   * Busca a data do último commit para um arquivo.
   * Feito em lote (mas sem sobrecarregar a API).
   */
  const fetchCommitDate = async (filePath) => {
    const { GITHUB_OWNER, GITHUB_REPO } = CONFIG;
    const url = `${BASE}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?path=${encodeURIComponent(filePath)}&per_page=1`;

    try {
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) return null;
      const data = await res.json();
      return data[0]?.commit?.committer?.date ?? null;
    } catch { return null; }
  };

  /**
   * Baixa o conteúdo de um arquivo.
   */
  const fetchContent = async (downloadUrl) => {
    const res = await fetch(downloadUrl, {
      headers: CONFIG.GITHUB_TOKEN ? { Authorization: `token ${CONFIG.GITHUB_TOKEN}` } : {}
    });
    if (!res.ok) throw new Error(`Não foi possível baixar: ${res.status}`);
    return res.text();
  };

  return { listFiles, fetchCommitDate, fetchContent };
})();

/* ═══════════════════════════════════════════════════════════════════
   MARKDOWN — conversão simples com marked.js
   ═══════════════════════════════════════════════════════════════════ */
const MD = (() => {
  const render = (text) => {
    if (typeof marked !== "undefined") {
      marked.setOptions({
        breaks: true,
        gfm: true,
        headerIds: true,
        mangle: false,
      });
      return marked.parse(text);
    }
    // fallback simples se marked não carregar
    return `<pre>${text.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>`;
  };
  return { render };
})();

/* ═══════════════════════════════════════════════════════════════════
   UI — manipulação do DOM
   ═══════════════════════════════════════════════════════════════════ */
const UI = (() => {
  /* ── Referências ──────────────────────────────────────────────── */
  const $  = (id) => document.getElementById(id);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

  const els = {
    sidebar:         $("sidebar"),
    sidebarList:     $("sidebar-list"),
    searchInput:     $("search-input"),
    searchClear:     $("search-clear"),
    welcome:         $("welcome"),
    rendered:        $("rendered-content"),
    htmlFrame:       $("html-frame"),
    loading:         $("loading-overlay"),
    breadcrumb:      $("breadcrumb"),
    syncDot:         $("sync-dot"),
    syncLabel:       $("sync-label"),
    contextMenu:     $("context-menu"),
    groupModal:      $("group-modal"),
    groupInput:      $("group-name-input"),
    toastContainer:  $("toast-container"),
    offlineBadge:    $("offline-badge"),
    main:            $("main"),
  };

  /* ── Toast ────────────────────────────────────────────────────── */
  const toast = (msg, duration = 2800) => {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    els.toastContainer.appendChild(el);
    setTimeout(() => {
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 300);
    }, duration);
  };

  /* ── Loading ─────────────────────────────────────────────────── */
  const showLoading = () => els.loading.classList.add("visible");
  const hideLoading = () => els.loading.classList.remove("visible");

  /* ── Sync indicator ──────────────────────────────────────────── */
  const setSyncStatus = (status) => {
    // status: "syncing" | "ok" | "error"
    els.syncDot.className = `sync-dot ${status}`;
    const labels = { syncing: "Sincronizando…", ok: "Atualizado", error: "Erro ao sincronizar" };
    els.syncLabel.textContent = labels[status] || "";
  };

  /* ── Theme ────────────────────────────────────────────────────── */
  const applyTheme = (theme) => {
    document.documentElement.setAttribute("data-theme", theme);
    App.theme = theme;
    Store.setTheme(theme);

    const btn = $("theme-toggle-btn");
    if (btn) {
      btn.innerHTML = theme === "dark"
        ? svgIcon("sun", 16)
        : svgIcon("moon", 16);
      btn.title = theme === "dark" ? "Modo claro" : "Modo escuro";
    }

    // Atualiza o iframe se estiver aberto
    if (App.currentFile?.ext === "html") {
      const frame = els.htmlFrame;
      if (frame?.contentDocument?.body) {
        frame.contentDocument.body.style.background =
          theme === "dark" ? "#1f1f1f" : "#ffffff";
        frame.contentDocument.body.style.color =
          theme === "dark" ? "#e8e6e3" : "#1e1c1a";
      }
    }
  };

  /* ── Sidebar ─────────────────────────────────────────────────── */
  const setSidebarOpen = (open) => {
    if (window.innerWidth <= 680) {
      document.body.classList.toggle("sidebar-open", open);
    } else {
      document.body.classList.toggle("sidebar-collapsed", !open);
    }
    Store.setSidebarOpen(open);
  };

  /* ── Breadcrumb ──────────────────────────────────────────────── */
  const setBreadcrumb = (file) => {
    if (!file) {
      els.breadcrumb.innerHTML = `<span>${CONFIG.APP_NAME}</span>`;
      return;
    }
    els.breadcrumb.innerHTML = `
      <span>${CONFIG.APP_NAME}</span>
      <span class="crumb-sep">›</span>
      <span class="crumb-file">${file.name}</span>`;
  };

  /* ── Ícone por extensão ──────────────────────────────────────── */
  const extLabel = (ext) => {
    const map = { md: "MD", html: "HTML", txt: "TXT" };
    return map[ext] ?? ext.toUpperCase();
  };

  return {
    els, $, $$,
    toast, showLoading, hideLoading,
    setSyncStatus, applyTheme, setSidebarOpen, setBreadcrumb, extLabel,
  };
})();

/* ═══════════════════════════════════════════════════════════════════
   SVG ICONS — inline para zero dependência de ícones externos
   ═══════════════════════════════════════════════════════════════════ */
function svgIcon(name, size = 16) {
  const s = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;
  const icons = {
    sun:      `${s}<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    moon:     `${s}<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/></svg>`,
    star:     `${s}<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
    menu:     `${s}<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    panel:    `${s}<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>`,
    search:   `${s}<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    x:        `${s}<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
    chevron:  `${s}<polyline points="6 9 12 15 18 9"/></svg>`,
    grip:     `${s}<circle cx="9" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none"/></svg>`,
    folder:   `${s}<path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>`,
    plus:     `${s}<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    book:     `${s}<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`,
    copy:     `${s}<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`,
    trash:    `${s}<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    alpha:    `${s}<polyline points="4 7 4 4 20 4"/><line x1="9" y1="4" x2="9" y2="20"/><path d="M13 20h7"/><path d="M18 15l5 5-5 5"/></svg>`,
    clock:    `${s}<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    read:     `${s}<path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>`,
    refresh:  `${s}<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>`,
    move:     `${s}<polyline points="5 9 2 12 5 15"/><polyline points="19 9 22 12 19 15"/><line x1="2" y1="12" x2="22" y2="12"/></svg>`,
  };
  return icons[name] ?? `${s}</svg>`;
}

/* ═══════════════════════════════════════════════════════════════════
   SIDEBAR RENDERER
   ═══════════════════════════════════════════════════════════════════ */
const SidebarRenderer = (() => {

  /**
   * Renderiza a lista completa na sidebar, respeitando:
   * - busca ativa
   * - favoritos no topo (separados)
   * - grupos customizados
   * - modo de ordenação
   */
  const render = () => {
    const container = UI.els.sidebarList;
    container.innerHTML = "";

    const favorites  = Store.getFavorites();
    const groups     = Store.getGroups();
    const order      = Store.getOrder();
    const query      = UI.els.searchInput.value.trim().toLowerCase();

    // Aplica filtro de busca
    let files = query ? App.filtered : [...App.files];

    // Ordena conforme modo
    files = sortFiles(files, order);

    // Separa favoritos / agrupados / soltos
    const favFiles     = files.filter(f => favorites.includes(f.name) && !isInGroup(f.name, groups));
    const groupedNames = groups.flatMap(g => g.files);
    const looseFiles   = files.filter(f => !favorites.includes(f.name) && !groupedNames.includes(f.name));

    // ─── Seção Favoritos ────────────────────────────────────────────
    if (favFiles.length > 0 && !query) {
      const label = document.createElement("div");
      label.className = "section-label";
      label.innerHTML = `${svgIcon("star", 11)} &nbsp;Favoritos`;
      label.style.display = "flex"; label.style.alignItems = "center"; label.style.gap = "4px";
      container.appendChild(label);

      favFiles.forEach(f => container.appendChild(buildFileItem(f, favorites)));
    }

    // ─── Grupos customizados ────────────────────────────────────────
    if (!query) {
      groups.forEach(group => {
        const groupFiles = files.filter(f => group.files.includes(f.name));
        if (groupFiles.length === 0 && !query) {
          // grupo vazio — mostra como zona de drop
          container.appendChild(buildGroupEl(group, [], favorites));
          return;
        }
        container.appendChild(buildGroupEl(group, groupFiles, favorites));
      });
    }

    // ─── Sem grupo ──────────────────────────────────────────────────
    if (looseFiles.length > 0 || query) {
      const listEl = document.createElement("div");
      listEl.id = "loose-list";

      const showFiles = query ? files : looseFiles;
      showFiles.forEach(f => listEl.appendChild(buildFileItem(f, favorites)));

      container.appendChild(listEl);
    }

    // ─── Estado vazio ───────────────────────────────────────────────
    if (files.length === 0) {
      const empty = document.createElement("div");
      empty.style.cssText = "padding:20px 12px;text-align:center;font-size:12px;color:var(--text-muted)";
      empty.textContent = query ? "Nenhum arquivo encontrado." : "Nenhum arquivo no repositório.";
      container.appendChild(empty);
    }

    // ─── Inicializa drag and drop ────────────────────────────────────
    initDragDrop();
  };

  /**
   * Constrói o elemento <div> de um arquivo.
   */
  const buildFileItem = (file, favorites) => {
    const isFav    = favorites.includes(file.name);
    const isActive = App.currentFile?.name === file.name;
    const query    = UI.els.searchInput.value.trim().toLowerCase();

    const el = document.createElement("div");
    el.className = `file-item${isActive ? " active" : ""}`;
    el.dataset.name = file.name;

    // Nome com highlight de busca
    const displayName = file.name.replace(/\.[^.]+$/, ""); // sem extensão
    const highlighted = query
      ? displayName.replace(new RegExp(`(${escapeRegex(query)})`, "gi"), "<mark>$1</mark>")
      : displayName;

    el.innerHTML = `
      <span class="drag-handle" title="Arrastar">${svgIcon("grip", 14)}</span>
      <span class="file-icon ${file.ext}">${UI.extLabel(file.ext)}</span>
      <span class="file-name" title="${file.name}">${highlighted}</span>
      <button class="star-btn${isFav ? " active" : ""}" title="${isFav ? "Remover favorito" : "Favoritar"}" data-name="${file.name}">
        ${svgIcon("star", 13)}
      </button>`;

    // Clique principal: abre arquivo
    el.addEventListener("click", (e) => {
      if (e.target.closest(".star-btn") || e.target.closest(".drag-handle")) return;
      openFile(file);
      if (window.innerWidth <= 680) UI.setSidebarOpen(false);
    });

    // Estrela: favoritar
    el.querySelector(".star-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleFavorite(file.name);
    });

    // Clique direito: context menu
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showContextMenu(e, file);
    });

    return el;
  };

  /**
   * Constrói o elemento de grupo (expansível).
   */
  const buildGroupEl = (group, files, favorites) => {
    const wrapper = document.createElement("div");
    wrapper.className = "group-wrapper";
    wrapper.dataset.groupId = group.id;

    const isCollapsed = group.collapsed ?? false;

    wrapper.innerHTML = `
      <div class="group-header${isCollapsed ? " collapsed" : ""}" data-group-id="${group.id}">
        <span class="group-chevron">${svgIcon("chevron", 13)}</span>
        ${svgIcon("folder", 13)}
        <span class="group-name">${group.name}</span>
        <span class="group-count">${files.length}</span>
      </div>
      <div class="group-items${isCollapsed ? " collapsed" : ""}" id="group-items-${group.id}">
        <div class="group-drop-zone" data-group-id="${group.id}"></div>
      </div>`;

    files.forEach(f => {
      wrapper.querySelector(".group-items").appendChild(buildFileItem(f, favorites));
    });

    // Toggle collapse
    wrapper.querySelector(".group-header").addEventListener("click", (e) => {
      if (e.target.closest(".group-header")) {
        toggleGroupCollapse(group.id);
      }
    });

    return wrapper;
  };

  /**
   * Ordena os arquivos conforme o modo atual.
   */
  const sortFiles = (files, order) => {
    const mode = App.sortMode;

    if (mode === "alpha") {
      return [...files].sort((a, b) => a.name.localeCompare(b.name));
    }
    if (mode === "date") {
      return [...files].sort((a, b) => {
        const da = a.date ? new Date(a.date) : new Date(0);
        const db = b.date ? new Date(b.date) : new Date(0);
        return db - da; // mais recente primeiro
      });
    }
    // manual: segue a ordem salva
    if (order.length > 0) {
      const indexed = Object.fromEntries(files.map(f => [f.name, f]));
      const sorted  = order.filter(n => indexed[n]).map(n => indexed[n]);
      const rest    = files.filter(f => !order.includes(f.name));
      return [...sorted, ...rest];
    }
    return files;
  };

  return { render };
})();

/* ═══════════════════════════════════════════════════════════════════
   DRAG AND DROP — SortableJS
   ═══════════════════════════════════════════════════════════════════ */
let sortableInstance = null;

const initDragDrop = () => {
  if (typeof Sortable === "undefined") return;

  // Lista principal (arquivos soltos)
  const looseList = document.getElementById("loose-list");
  if (looseList) {
    if (sortableInstance) sortableInstance.destroy();
    sortableInstance = new Sortable(looseList, {
      animation: 150,
      handle:    ".drag-handle",
      ghostClass: "sortable-ghost",
      chosenClass: "sortable-chosen",
      dragClass:  "sortable-drag",
      onEnd: () => {
        // Persiste nova ordem
        const names = Array.from(looseList.querySelectorAll(".file-item"))
          .map(el => el.dataset.name);
        Store.setOrder(names);
        App.sortMode = "manual";
        updateSortButtons("manual");
      },
    });
  }
};

/* ═══════════════════════════════════════════════════════════════════
   AÇÕES — abrir arquivo, favoritar, grupos, etc.
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Abre e renderiza um arquivo na área principal.
 */
const openFile = async (file) => {
  if (App.isLoading) return;

  App.currentFile = file;
  Store.setLastFile(file.name);
  App.isLoading = true;

  UI.showLoading();
  UI.setBreadcrumb(file);

  // Esconde views antigas
  UI.els.welcome.classList.add("hidden");
  UI.els.rendered.classList.remove("visible");
  UI.els.htmlFrame.classList.remove("visible");

  // Marca item ativo na sidebar
  document.querySelectorAll(".file-item").forEach(el => {
    el.classList.toggle("active", el.dataset.name === file.name);
  });

  try {
    // Usa cache em memória se já tiver
    if (!file.content) {
      file.content = await GitHub.fetchContent(file.downloadUrl);
    }

    await renderContent(file);

  } catch (err) {
    console.error("Erro ao abrir arquivo:", err);
    UI.els.rendered.innerHTML = `
      <div style="color:var(--text-muted);padding:40px 0;text-align:center">
        <p style="font-size:14px">Erro ao carregar o arquivo.</p>
        <p style="font-size:12px;margin-top:6px">${err.message}</p>
      </div>`;
    UI.els.rendered.classList.add("visible");
  } finally {
    App.isLoading = false;
    UI.hideLoading();
  }
};

/**
 * Renderiza o conteúdo na área principal conforme a extensão.
 */
const renderContent = async (file) => {
  const { rendered, htmlFrame } = UI.els;

  if (file.ext === "html") {
    rendered.classList.remove("visible");
    htmlFrame.classList.add("visible");
    htmlFrame.srcdoc = file.content;

    // Injeta tema no iframe quando carregado
    htmlFrame.onload = () => {
      try {
        const doc = htmlFrame.contentDocument;
        if (!doc) return;
        const style = doc.createElement("style");
        style.textContent = App.theme === "dark"
          ? "body{background:#1f1f1f;color:#e8e6e3;font-family:Georgia,serif;padding:24px}"
          : "body{background:#fff;color:#1e1c1a;font-family:Georgia,serif;padding:24px}";
        doc.head.appendChild(style);
      } catch {}
    };

  } else if (file.ext === "md") {
    htmlFrame.classList.remove("visible");
    rendered.className = ""; // reset
    rendered.classList.add("visible");
    if (App.readingMode) rendered.classList.add("reading-mode");
    rendered.innerHTML = MD.render(file.content);

  } else {
    // TXT
    htmlFrame.classList.remove("visible");
    rendered.className = "";
    rendered.classList.add("visible", "txt-view");
    rendered.textContent = file.content;
  }
};

/**
 * Favoritar / desfavoritar.
 */
const toggleFavorite = (name) => {
  let favs = Store.getFavorites();
  if (favs.includes(name)) {
    favs = favs.filter(f => f !== name);
    UI.toast("Removido dos favoritos.");
  } else {
    favs = [name, ...favs];
    UI.toast("Adicionado aos favoritos ⭐");
  }
  Store.setFavorites(favs);
  SidebarRenderer.render();
};

/**
 * Alterna collapse de um grupo.
 */
const toggleGroupCollapse = (groupId) => {
  const groups = Store.getGroups().map(g => {
    if (g.id === groupId) return { ...g, collapsed: !g.collapsed };
    return g;
  });
  Store.setGroups(groups);
  SidebarRenderer.render();
};

/**
 * Verifica se um arquivo está em algum grupo.
 */
const isInGroup = (name, groups) => groups.some(g => g.files.includes(name));

/**
 * Escapa regex.
 */
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ═══════════════════════════════════════════════════════════════════
   BUSCA FULL-TEXT
   ═══════════════════════════════════════════════════════════════════ */
const search = (() => {
  let debounceTimer = null;

  const run = (query) => {
    if (!query) {
      App.filtered = [];
      UI.els.searchClear.classList.remove("visible");
      SidebarRenderer.render();
      return;
    }

    UI.els.searchClear.classList.add("visible");
    const q = query.toLowerCase();

    App.filtered = App.files.filter(f => {
      // Nome
      if (f.name.toLowerCase().includes(q)) return true;
      // Conteúdo (se já baixado)
      if (f.content && f.content.toLowerCase().includes(q)) return true;
      return false;
    });

    SidebarRenderer.render();
  };

  const debounce = (query) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => run(query), 250);
  };

  return { run, debounce };
})();

/* ═══════════════════════════════════════════════════════════════════
   CONTEXT MENU
   ═══════════════════════════════════════════════════════════════════ */
const showContextMenu = (event, file) => {
  const menu   = UI.els.contextMenu;
  const groups = Store.getGroups();
  const inGroup = isInGroup(file.name, groups);

  // Gera itens de "Mover para grupo"
  const groupItems = groups.length > 0
    ? `<div class="ctx-sep"></div>
       ${groups.map(g => `
         <div class="ctx-item" data-action="move-to-group" data-group="${g.id}" data-file="${file.name}">
           ${svgIcon("folder", 14)} Mover para "${g.name}"
         </div>`).join("")}
       ${inGroup ? `<div class="ctx-item" data-action="remove-from-group" data-file="${file.name}">${svgIcon("move", 14)} Remover do grupo</div>` : ""}`
    : "";

  menu.innerHTML = `
    <div class="ctx-item" data-action="open" data-file="${file.name}">${svgIcon("book", 14)} Abrir</div>
    <div class="ctx-item" data-action="copy-url" data-file="${file.name}">${svgIcon("copy", 14)} Copiar URL</div>
    <div class="ctx-item" data-action="favorite" data-file="${file.name}">
      ${svgIcon("star", 14)} ${Store.getFavorites().includes(file.name) ? "Desfavoritar" : "Favoritar"}
    </div>
    ${groupItems}`;

  // Posiciona
  const { innerWidth, innerHeight } = window;
  let x = event.clientX, y = event.clientY;
  menu.style.left = (x + 170 > innerWidth  ? x - 170 : x) + "px";
  menu.style.top  = (y + 160 > innerHeight ? y - 160 : y) + "px";
  menu.classList.add("visible");

  // Ações
  menu.querySelectorAll(".ctx-item").forEach(item => {
    item.addEventListener("click", () => {
      const action = item.dataset.action;
      const fname  = item.dataset.file;
      const fileObj = App.files.find(f => f.name === fname);

      if (action === "open" && fileObj)          openFile(fileObj);
      if (action === "copy-url" && fileObj)      copyToClipboard(fileObj.downloadUrl);
      if (action === "favorite" && fname)        toggleFavorite(fname);
      if (action === "move-to-group" && fname)   moveToGroup(fname, item.dataset.group);
      if (action === "remove-from-group" && fname) removeFromGroup(fname);

      closeContextMenu();
    });
  });
};

const closeContextMenu = () => UI.els.contextMenu.classList.remove("visible");

const copyToClipboard = (text) => {
  navigator.clipboard.writeText(text)
    .then(() => UI.toast("URL copiada!"))
    .catch(() => UI.toast("Não foi possível copiar."));
};

/* ═══════════════════════════════════════════════════════════════════
   GRUPOS
   ═══════════════════════════════════════════════════════════════════ */
const createGroup = (name) => {
  if (!name.trim()) return;
  const groups = Store.getGroups();
  groups.push({ id: `g_${Date.now()}`, name: name.trim(), files: [], collapsed: false });
  Store.setGroups(groups);
  SidebarRenderer.render();
  UI.toast(`Grupo "${name.trim()}" criado.`);
};

const moveToGroup = (fileName, groupId) => {
  const groups = Store.getGroups().map(g => {
    // Remove de todos os grupos primeiro
    return { ...g, files: g.files.filter(f => f !== fileName) };
  }).map(g => {
    if (g.id === groupId) return { ...g, files: [...g.files, fileName] };
    return g;
  });
  Store.setGroups(groups);
  SidebarRenderer.render();
};

const removeFromGroup = (fileName) => {
  const groups = Store.getGroups().map(g => ({
    ...g,
    files: g.files.filter(f => f !== fileName),
  }));
  Store.setGroups(groups);
  SidebarRenderer.render();
};

/* ═══════════════════════════════════════════════════════════════════
   SORT BUTTONS
   ═══════════════════════════════════════════════════════════════════ */
const updateSortButtons = (mode) => {
  App.sortMode = mode;
  Store.setSort(mode);
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.sort === mode);
  });
};

/* ═══════════════════════════════════════════════════════════════════
   CARREGAMENTO INICIAL
   ═══════════════════════════════════════════════════════════════════ */
const loadFiles = async () => {
  UI.setSyncStatus("syncing");

  try {
    App.files = await GitHub.listFiles();
    UI.setSyncStatus("ok");

    SidebarRenderer.render();

    // Reabre último arquivo se existir
    const lastName = Store.getLastFile();
    if (lastName) {
      const file = App.files.find(f => f.name === lastName);
      if (file) openFile(file);
    }

    // Carrega datas dos commits em background (limita a 5 para não estourar rate limit)
    loadCommitDates();

  } catch (err) {
    UI.setSyncStatus("error");
    console.error("Erro ao carregar arquivos:", err);

    const container = UI.els.sidebarList;
    container.innerHTML = `
      <div style="padding:16px 12px;font-size:12px;color:var(--text-muted);line-height:1.6">
        <strong style="color:var(--text-secondary)">Erro ao carregar</strong><br>
        Verifique as configurações do repositório em <code>config.js</code>.<br><br>
        <small>${err.message}</small>
      </div>`;
  }
};

const loadCommitDates = async () => {
  // Carrega em lote de 5 para não bater no rate limit
  const batch = App.files.slice(0, 5);
  for (const file of batch) {
    file.date = await GitHub.fetchCommitDate(file.path);
    await sleep(200); // pequena pausa entre requisições
  }
  // Renderiza novamente se o sort for por data
  if (App.sortMode === "date") SidebarRenderer.render();
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ═══════════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════════════ */
const initEvents = () => {
  /* ── Busca ─────────────────────────────────────────────────── */
  UI.els.searchInput.addEventListener("input", (e) => {
    search.debounce(e.target.value.trim());
  });

  UI.els.searchClear.addEventListener("click", () => {
    UI.els.searchInput.value = "";
    search.run("");
  });

  /* ── Sort buttons ───────────────────────────────────────────── */
  document.querySelectorAll(".sort-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.sort;
      updateSortButtons(mode);
      SidebarRenderer.render();
    });
  });

  /* ── Theme toggle ───────────────────────────────────────────── */
  document.getElementById("theme-toggle-btn").addEventListener("click", () => {
    UI.applyTheme(App.theme === "dark" ? "light" : "dark");
  });

  /* ── Sidebar toggle (desktop) ───────────────────────────────── */
  document.getElementById("sidebar-toggle-btn").addEventListener("click", () => {
    const isOpen = !document.body.classList.contains("sidebar-collapsed");
    UI.setSidebarOpen(!isOpen);
  });

  /* ── Menu mobile ────────────────────────────────────────────── */
  document.getElementById("menu-btn").addEventListener("click", () => {
    const isOpen = document.body.classList.contains("sidebar-open");
    UI.setSidebarOpen(!isOpen);
  });

  /* ── Fechar sidebar no overlay mobile ──────────────────────── */
  document.addEventListener("click", (e) => {
    if (window.innerWidth <= 680 &&
        document.body.classList.contains("sidebar-open") &&
        !UI.els.sidebar.contains(e.target) &&
        e.target.id !== "menu-btn") {
      UI.setSidebarOpen(false);
    }
  });

  /* ── Fechar context menu ────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    if (!UI.els.contextMenu.contains(e.target)) closeContextMenu();
  });

  /* ── Modo leitura ────────────────────────────────────────────── */
  document.getElementById("reading-mode-btn").addEventListener("click", () => {
    App.readingMode = !App.readingMode;
    const btn = document.getElementById("reading-mode-btn");
    btn.classList.toggle("active", App.readingMode);
    btn.title = App.readingMode ? "Sair do modo leitura" : "Modo leitura";

    UI.els.rendered.classList.toggle("reading-mode", App.readingMode);

    // Re-renderiza se arquivo aberto for md
    if (App.currentFile && App.currentFile.ext !== "html") {
      renderContent(App.currentFile);
    }
  });

  /* ── Recarregar ──────────────────────────────────────────────── */
  document.getElementById("refresh-btn").addEventListener("click", async () => {
    App.files = [];
    SidebarRenderer.render();
    await loadFiles();
    UI.toast("Lista de arquivos atualizada.");
  });

  /* ── Criar grupo ─────────────────────────────────────────────── */
  document.getElementById("new-group-btn").addEventListener("click", () => {
    UI.els.groupModal.classList.add("visible");
    UI.els.groupInput.value = "";
    UI.els.groupInput.focus();
  });

  document.getElementById("group-cancel-btn").addEventListener("click", () => {
    UI.els.groupModal.classList.remove("visible");
  });

  document.getElementById("group-confirm-btn").addEventListener("click", () => {
    const name = UI.els.groupInput.value.trim();
    if (name) {
      createGroup(name);
      UI.els.groupModal.classList.remove("visible");
    }
  });

  UI.els.groupInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("group-confirm-btn").click();
    if (e.key === "Escape") UI.els.groupModal.classList.remove("visible");
  });

  UI.els.groupModal.addEventListener("click", (e) => {
    if (e.target === UI.els.groupModal) UI.els.groupModal.classList.remove("visible");
  });

  /* ── Online/Offline ──────────────────────────────────────────── */
  window.addEventListener("offline", () => document.body.classList.add("is-offline"));
  window.addEventListener("online",  () => document.body.classList.remove("is-offline"));

  /* ── Keyboard shortcuts ──────────────────────────────────────── */
  document.addEventListener("keydown", (e) => {
    // Ctrl/Cmd + K → foca busca
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      UI.els.searchInput.focus();
      UI.els.searchInput.select();
    }
    // Esc → limpa busca
    if (e.key === "Escape" && document.activeElement === UI.els.searchInput) {
      UI.els.searchInput.value = "";
      search.run("");
      UI.els.searchInput.blur();
    }
  });
};

/* ═══════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════ */
const init = async () => {
  // Restaura preferências
  const savedTheme = Store.getTheme();
  UI.applyTheme(savedTheme);

  App.sortMode = Store.getSort();
  updateSortButtons(App.sortMode);

  const sidebarOpen = Store.getSidebarOpen();
  if (!sidebarOpen && window.innerWidth > 680) {
    UI.setSidebarOpen(false);
  }

  // Registra Service Worker
  if ("serviceWorker" in navigator) {
    try {
      await navigator.serviceWorker.register("/service-worker.js");
    } catch (e) {
      console.warn("SW não registrado:", e);
    }
  }

  // Verifica status offline
  if (!navigator.onLine) document.body.classList.add("is-offline");

  // Inicializa eventos
  initEvents();

  // Carrega arquivos
  await loadFiles();
};

// Aguarda DOM estar pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
