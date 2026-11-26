# PDF Studio — Patch Notes

Histórico completo de atualizações, melhorias de usabilidade e correções aplicadas nas distribuições **PDF Studio Beta (`v2.0.0-beta.1`)**, **PDF Studio (`v1.0.0`)** e **Web / PWA**.

[← Voltar ao README principal](README.md)

## Índice de Versões

- [Atualização do Modo Editar — 26/11/2026 (`v2.0.0-beta.1` e `v1.0.0`)](#atualização-do-modo-editar--26112026-v200-beta1-e-v100)
- [PDF Studio Beta `v2.0.0-beta.1` — 26/11/2026 (`Cult UI Edition`)](#pdf-studio-beta-v200-beta1--26112026-cult-ui-edition)
- [PDF Studio `v1.0.0` — Desktop UX & Multi-Monitor (`26/11/2026`)](#pdf-studio-v100--desktop-ux--multi-monitor-26112026)
- [PDF Studio `v1.0.0` — Lançamento Inicial & Evoluções do Editor (`24/11/2026`)](#pdf-studio-v100--lançamento-inicial--evoluções-do-editor-24112026)

---

## Atualização do Modo Editar — 26/11/2026 (`v2.0.0-beta.1` e `v1.0.0`)

- **Preservação fiel de formatação, entrelinha e quebras de parágrafo (`pdfium.worker.ts` & `textBlockCommit.ts`):**
  - Detecção precisa de tamanho escalado por matriz (`scaleY`), peso (`FPDFFont_GetWeight`), itálico/família (`FPDFFont_GetFlags` / `FPDFFont_GetFamilyName`) e entrelinha mediana compacta (sem inflação forçada para `1,2×`).
  - Reconstrução de parágrafos diferenciando quebras automáticas (*soft-wrap* `' '`) de quebras reais de parágrafo/marcadores (`\n`), calibrando a largura útil de coluna e compensando borda/preenchimento da caixa do editor para evitar palavras órfãs isoladas durante a edição e ao aplicar.
  - Guarda de alteração real (`hasUserEdited` e comparação de *runs* normalizados): clicar em **Aplicar** sem editar o bloco fecha a caixa sem alterar o PDF.
  - Middleware local de fontes TrueType nativas no modo Web (`/__pdf_studio_font`) e suporte ampliado de fontes TrueType CID no PDFium WASM.
- **Reflow automático anti-sobreposição no PDF (`pdfium.worker.ts`):** Ao expandir um bloco editado (horizontalmente ou adicionando novas linhas), objetos à direita na mesma linha e parágrafos/blocos abaixo são automaticamente reposicionados preservando o espaçamento original (expandindo `MediaBox`/`CropBox` quando necessário) e aplicando fundo opaco protetor em deslocamentos livres ou sobreposições residuais.
- **Autoajuste dinâmico da caixa de texto (`autoFitDraftRect`):** Blocos de linha única expandem automaticamente sua largura até a margem útil da página conforme o usuário digita ou altera o estilo/tamanho da fonte, enquanto parágrafos originalmente multi-linha mantêm sua largura de coluna e ajustam a altura vertical automaticamente (com botão **Auto** no Inspetor Direito).
- **Correção exata de espaçamento entre letras e segmentos (`analyzeEditableTextBlocks` & `commitEditedTextBlockInWorker`):** Filtragem de espaços sintéticos de kerning (`FPDFText_IsGenerated`) em fragmentos adjacentes, ordenação por *baseline* real (`FPDFText_GetCharOrigin`), fusão automática de segmentos consecutivos de mesmo estilo e cálculo exato de avanço tipográfico com marcadores delimitadores sem introduzir espaços fantasmas em palavras não alteradas.

---

## PDF Studio Beta `v2.0.0-beta.1` — 26/11/2026 (`Cult UI Edition`)

- **Reformulação Visual Completa com Cult UI (`packages/ui/src/components/cult/CultUiPrimitives.tsx`):**
  - **`TextureCard` & `TextureSeparator`:** Superfícies chanfradas com 5 camadas concêntricas de borda e divisores de sulco duplo na Tela Inicial, Documentos Recentes, desbloqueio por senha e resumos de compressão.
  - **`TextureButton`:** Botões físicos de casca dupla (`p-[1px]` + gradiente tátil) nas variantes `primary`, `secondary`, `minimal`, `destructive` e `icon`.
  - **`DirectionAwareTabs` & `CollabToolbar`:** Alternador de 7 modos de trabalho e fluxos do inspetor em trilho rebaixado com pílula elevada, sub-barras segmentadas e cápsulas flutuantes de seleção de texto, anotações e edição rica de blocos.
  - **`MinimalCard` & `MinimalCardFrame`:** Moldura dupla fosca de 3 px nas ferramentas rápidas, miniaturas laterais e Mesa de Luz (*Organizar*).
  - **`PopoverTicketModal`, `FloatingPanelSurface` & `DynamicIslandToast`:** Modais e busca global (`Ctrl+F`) com entalhes laterais estilo *ticket cutout*, grade pontilhada (*halftone dot-grid*) no fundo do viewport e notificações em cápsula escura estilo *Dynamic Island*.
- **Empacotamento Isolado:** Gerado na pasta dedicada [`apps/desktop-windows/release-beta/`](apps/desktop-windows/release-beta) mantendo intacta a mecânica de execução (`PDFium WASM`, `@cantoo/pdf-lib`, OCR `tesseract.js`, `EditorCommand`) e os binários estáveis `v1.0.0` em [`apps/desktop-windows/release/`](apps/desktop-windows/release).

---

## PDF Studio `v1.0.0` — Desktop UX & Multi-Monitor (`26/11/2026`)

- **Arraste livre pela barra superior:** A área vazia da barra superior de título e abas (`TopTitleTabsBar`) permanece totalmente arrastável no Desktop Windows enquanto as abas abertas não preenchem a barra, preservando uma faixa mínima arrastável mesmo com muitos documentos abertos e rolagem horizontal das abas pela roda do mouse.
- **Suporte aprimorado a múltiplos monitores:** Movimentação livre da janela entre áreas do monitor e múltiplas telas, suporte nativo a *Aero Snap*, sincronização em tempo real do botão *Maximizar/Restaurar* ao encaixar/desencaixar a janela e validação automática das coordenadas salvas ao desconectar monitores externos.

---

## PDF Studio `v1.0.0` — Lançamento Inicial & Evoluções do Editor (`24/11/2026`)

- **Identidade Windows nativa:** Incorporação de ícone PE multi-resolução customizado e `AppUserModelId` para exibição correta na barra de tarefas do Windows 11.
- **Edição avançada de texto PDF:** Blocos de texto livremente expansíveis e reposicionáveis, com formatação rica por palavra/trecho selecionado (negrito, itálico, sublinhado, fonte, tamanho e cor) persistida diretamente via PDFium WASM.
- **Empacotamento otimizado:** Geração de executáveis Windows (`.exe` NSIS e Portátil) abaixo de 73 MiB diretamente no repositório, sem dependência de Git LFS.
- **Lançamento inicial Local-First (Windows Desktop & Web PWA):** Leitura virtualizada, anotações e medição em `mm`, organização de páginas, formulários AcroForm, tarjamento definitivo LGPD, assinatura eletrônica visual e OCR local com `tesseract.js`.
