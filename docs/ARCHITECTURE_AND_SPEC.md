# Especificação Mestre de Produto, Arquitetura e UI/UX — PDF Studio

Este documento consolida integralmente as decisões arquiteturais, invariantes de engenharia e especificações de UI/UX do **PDF Studio** (Windows Desktop & Evolução Web/PWA).

## 1. Arquitetura Hexagonal do Monorepo

```plaintext
PDF_Editor_Free/
├── apps/
│   ├── desktop-windows/      # Shell Desktop Windows (.exe / NSIS / portátil via Electron + config Tauri v2 pronta)
│   └── web/                  # Aplicação Web / PWA (Vite + File System Access API + IndexedDB)
├── packages/
│   ├── platform-contracts/   # Interfaces abstratas puras (IFileSystem, IRecoveryStore, IPrinter, IFontRepository, ICertificateStore, IHeavyJobRunner, IWindowControls)
│   ├── pdf-engine/           # PDFium WASM em Web Worker dedicado, Scheduler 3 prioridades, Cache LRU em bytes, Tiles, @cantoo/pdf-lib, OCR Tesseract
│   ├── editor-core/          # Zustand Stores (Workspace, Editor, Anotações) + Command Pattern determinístico (Undo/Redo)
│   └── ui/                   # Interface silenciosa em 7 zonas (React + Tailwind + TanStack Virtual + 4 camadas empilhadas por página)
├── sidecars/                 # Diretório reservado para binários nativos opcionais (QPDF, Tesseract nativo)
└── docs/                     # Documentação de arquitetura, invariantes e ADRs
```

## 2. Política de Licenças Permissivas

Nenhuma biblioteca copyleft restritiva (AGPL-3.0 como MuPDF ou Ghostscript) é utilizada no núcleo:
- **Renderização e Inspeção ISO 32000:** `@embedpdf/pdfium` (Apache 2.0 / BSD)
- **Manipulação Estrutural, Formulários e Overlays:** `@cantoo/pdf-lib` (MIT)
- **OCR Local-First:** `tesseract.js` (Apache 2.0)
- **Estado, Virtualização e UI:** React, Zustand, TanStack Virtual, Tailwind CSS, Lucide (MIT / ISC)
- **Empacotamento Desktop:** Electron / Tauri v2 (MIT / Apache 2.0)

## 3. Invariantes Críticas do Motor PDFium WASM

1. **Posse Exclusiva da Heap:** O módulo WASM do PDFium roda exclusivamente dentro de Web Worker dedicado, transferindo apenas `ImageBitmap` zero-copy (`postMessage(..., [bitmap])`) e JSON leve.
2. **RGBA Direto no C++:** Uso de `FPDF_REVERSE_BYTE_ORDER` (`0x10`) em `FPDF_RenderPageBitmap` / `FPDF_RenderPageBitmapWithMatrix`.
3. **Render Scheduler + Generation Tokens:** Fila de 3 prioridades (`high` viewport, `medium` prefetch, `low` thumbnails/index) com descarte imediato de tarefas obsoletas ao alterar zoom.
4. **Cache LRU por Orçamento de Bytes:** Limite de memória (padrão 200 MB) calculado por `width * height * 4`, invocando obrigatoriamente `bitmap.close()` na expulsão.
5. **Liberação Determinística (`try/finally`):** Fechamento rigoroso na ordem `FPDFText_ClosePage` → `FPDFBitmap_Destroy` → `_free` → `FPDF_ClosePage`.
6. **Remoção em Ordem Decrescente + `FPDFPage_GenerateContent`:** Índices ordenados do maior para o menor antes de `FPDFPage_RemoveObject` + `FPDFPageObj_Destroy`, seguido de regeneração de stream.
7. **Proteção de Assinaturas Digitais:** Detecção automática de dicionários `/Sig` e `/ByteRange` na abertura, com banner informativo e opção de criar cópia editável antes de edições destrutivas.

## 4. Anatomia de UI/UX (Interface Silenciosa — 7 Zonas)

- **Paleta:** Azul-marinho primário `#1B2952`, seleção `#2F4D8F`, viewport clara `#E5E7EB` / escura `#111827`, tema independente da folha (Normal / Noturno / Sépia).
- **Zona 1:** Faixa superior customizada (`38px`) com aba fixa **Início**, abas multi-documento com indicador de alterações não salvas, menu de contexto e controles nativos do Windows.
- **Zona 2:** Barra contextual de 2 níveis (`44px` + `40px` deslizante) com 7 modos: *Visualizar*, *Comentar*, *Editar*, *Organizar*, *Formulários*, *Proteger*, *Converter e Otimizar*.
- **Zona 3:** Banner contextual dinâmico (Documento Assinado, Sugestão de OCR em PDF escaneado, Revisão de Tarjamento Definitivo pendente).
- **Zona 4:** Painel lateral esquerdo (`44px` rail + gaveta redimensionável) com Miniaturas, Sumário, Comentários, Anexos, Camadas e Assinaturas.
- **Zona 5:** Viewport virtualizada com 4 camadas empilhadas por página (Canvas HiDPI/Tiles, Texto Selecionável, SVG Normalizado + Canvas Efêmero Ramer-Douglas-Peucker, Editor DOM de Texto) + cápsula flutuante contextual.
- **Zona 6:** Inspetor de propriedades direito (`260–320px`) em tempo real e fluxos assistidos.
- **Zona 7:** Barra de status inferior (`30px`) com dimensões físicas em mm, tarefas em segundo plano, paginação editável, layout de leitura, tema da folha e zoom.
