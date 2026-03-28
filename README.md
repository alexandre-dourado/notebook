# 📖 Notebook PWA

> Explorador de conhecimento pessoal baseado em arquivos de um repositório GitHub.  
> Interface estilo ChatGPT: sidebar com lista de arquivos + área de leitura.

---

## ✨ Funcionalidades

- **Listagem automática** de arquivos `.md`, `.html` e `.txt` de qualquer pasta do GitHub
- **Renderização** de Markdown (via marked.js), HTML e texto simples
- **Favoritos** com persistência no localStorage
- **Grupos/pastas** customizáveis com arrastar e soltar
- **Ordenação** manual (drag & drop), alfabética ou por data de commit
- **Busca full-text** por nome e conteúdo (arquivos já abertos)
- **Modo leitura** com tipografia ampliada
- **Dark/Light mode** com toggle
- **PWA offline-first** com Service Worker e cache automático
- **Responsivo** para mobile e desktop

---

## ⚙️ Configuração

Abra o arquivo `config.js` e edite as 3 variáveis principais:

```js
const CONFIG = {
  GITHUB_OWNER: "alexandre-dourado",   // ← seu usuário GitHub
  GITHUB_REPO:  "notebook",            // ← nome do repositório
  GITHUB_PATH:  "docs",                // ← pasta com os arquivos
  GITHUB_TOKEN: "",                    // ← deixe vazio (repo público)
  // ...
};
```

### Estrutura esperada do repositório

```
meu-repo/
└── docs/
    ├── artigo.md
    ├── notas.txt
    └── pagina.html
```

Você pode usar qualquer nome de pasta — basta alterar `GITHUB_PATH`.

### Token (repositórios privados)

1. Vá em **GitHub → Settings → Developer settings → Personal access tokens**
2. Gere um token com escopo `repo` (read-only é suficiente)
3. Cole em `GITHUB_TOKEN: "ghp_seu_token_aqui"`

> ⚠️ **Atenção:** tokens no frontend são visíveis. Use apenas com repositórios privados que não contenham dados sensíveis, ou sirva o app de forma restrita.

---

## 🚀 Deploy na Vercel

### Opção 1 — Via GitHub (recomendado)

1. Faça push deste projeto para um repositório GitHub
2. Acesse [vercel.com](https://vercel.com) e clique em **"Add New Project"**
3. Importe o repositório
4. Deixe todas as configurações padrão — o `vercel.json` já está configurado
5. Clique em **Deploy**

### Opção 2 — Via CLI

```bash
npm i -g vercel
cd notebook-pwa
vercel --prod
```

### Após o deploy

- Acesse a URL gerada pela Vercel
- No Chrome/Edge, clique em **"Instalar app"** para adicionar à tela inicial como PWA
- No iOS (Safari), toque em **Compartilhar → Adicionar à Tela Inicial**

---

## 📁 Estrutura do projeto

```
notebook-pwa/
├── index.html          # HTML da aplicação (estrutura + markup)
├── styles.css          # Estilos completos (tokens, temas, layout)
├── app.js              # Lógica principal (GitHub API, renderização, estado)
├── config.js           # ← EDITE AQUI: owner, repo, path, token
├── service-worker.js   # PWA offline-first (cache shell + conteúdo)
├── manifest.json       # Metadados do PWA (ícones, nome, tema)
├── vercel.json         # Configuração de deploy (headers, rewrites)
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

---

## 🖥️ Rodando localmente

O Service Worker exige HTTPS ou `localhost`. Use qualquer servidor estático:

```bash
# Python 3
python3 -m http.server 3000

# Node (npx)
npx serve .

# VS Code → extensão Live Server
```

Depois acesse `http://localhost:3000`.

---

## ⌨️ Atalhos de teclado

| Atalho       | Ação                    |
|--------------|-------------------------|
| `⌘K` / `Ctrl+K` | Foca o campo de busca |
| `Esc`        | Limpa a busca           |
| Clique direito num arquivo | Abre menu de contexto |

---

## 🗺️ Melhorias futuras sugeridas

| Feature | Como implementar |
|---|---|
| **Indexação local offline** | `IndexedDB` para armazenar conteúdo e indexar com `lunr.js` |
| **Highlight de texto** | `mark.js` para sublinhar termo buscado no conteúdo aberto |
| **Histórico de navegação** | `History API` para botão voltar/avançar entre arquivos |
| **Export / Print** | Botão que abre o conteúdo formatado para impressão |
| **Suporte a subpastas** | Chamadas recursivas à GitHub Contents API |
| **Contador de palavras** | Parser simples no conteúdo carregado |
| **Notas pessoais** | Editor simples salvo no `localStorage` por arquivo |
| **Sincronização bidirecional** | GitHub API + Octokit para commits via frontend |

---

## 📝 Licença

Projeto pessoal de uso livre. Adapte à vontade.
