# Sidecars Nativos Opcionais (Windows Desktop)

Esta pasta é reservada para binários nativos auxiliares empacotados opcionalmente na distribuição Windows (`apps/desktop-windows`) para aceleração multi-thread via `IHeavyJobRunner`:

- `qpdf.exe` (Apache 2.0): Linearização Fast Web View, reparo avançado de tabelas XRef corrompidas e criptografia AES-256 nativa.
- `tesseract.exe` + `tessdata/` (`por.traineddata`, `eng.traineddata` — Apache 2.0): OCR nativo multi-thread.

Na ausência dos binários locais (ou na versão Web/PWA), o motor `packages/pdf-engine` utiliza automaticamente seus equivalentes WebAssembly (`@embedpdf/pdfium`, `@cantoo/pdf-lib` e `tesseract.js`) mantendo 100% de compatibilidade funcional.
