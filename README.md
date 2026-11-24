# PDF Studio

**PDF Studio** é um leitor e editor de PDF gratuito, profissional e **100% Local-First** para **Windows Desktop** (`.exe` instalável e portátil) e **Web / PWA**.

Projetado sobre uma **Arquitetura Hexagonal em Monorepo**, o **PDF Studio** separa rigorosamente a interface visual em React + Tailwind CSS, o núcleo de estado e comandos reversíveis (`EditorCommand`), e o motor de processamento baseado em **PDFium WebAssembly (`@embedpdf/pdfium`)** em Web Worker dedicado + **`@cantoo/pdf-lib`** + **OCR (`tesseract.js`)**, mantendo todos os documentos confidenciais exclusivamente na máquina do usuário.

---

## Sumário

1. [Todas as Ações Possíveis no PDF Studio](#todas-as-ações-possíveis-no-pdf-studio)
   - [1. Gestão de Documentos, Abas e Sessão](#1-gestão-de-documentos-abas-e-sessão)
   - [2. Modo Visualizar — Leitura, Navegação e Busca](#2-modo-visualizar--leitura-navegação-e-busca)
   - [3. Modo Comentar — Anotações, Revisão e Medição](#3-modo-comentar--anotações-revisão-e-medição)
   - [4. Modo Editar — Edição Direta de Texto, Imagens e Elementos Globais](#4-modo-editar--edição-direta-de-texto-imagens-e-elementos-globais)
   - [5. Modo Organizar — Mesa de Luz e Manipulação de Páginas](#5-modo-organizar--mesa-de-luz-e-manipulação-de-páginas)
   - [6. Modo Formulários — AcroForms Interativos](#6-modo-formulários--acroforms-interativos)
   - [7. Modo Proteger — Assinaturas, Privacidade e Tarjamento LGPD](#7-modo-proteger--assinaturas-privacidade-e-tarjamento-lgpd)
   - [8. Modo Converter e Otimizar — OCR, Compressão e Exportações](#8-modo-converter-e-otimizar--ocr-compressão-e-exportações)
2. [Atalhos de Teclado e Interações de Ponteiro](#atalhos-de-teclado-e-interações-de-ponteiro)
3. [Arquitetura Hexagonal do Monorepo](#arquitetura-hexagonal-do-monorepo)
4. [Stack Tecnológica e Licenças Permissivas](#stack-tecnológica-e-licenças-permissivas)
5. [Como Executar, Testar e Gerar Instaladores](#como-executar-testar-e-gerar-instaladores)

---

## Todas as Ações Possíveis no PDF Studio

### 1. Gestão de Documentos, Abas e Sessão
- **Abrir documentos PDF (`Ctrl+O`):** Abertura individual ou múltipla via diálogo nativo do Windows/navegador, por linha de comando/associação `.pdf` no Windows Explorer (*Single Instance*) ou arrastando e soltando arquivos sobre a janela (*Drag & Drop*).
- **Desbloquear PDFs criptografados:** Cartão de senha isolado por aba (com alternância de visibilidade de caracteres) sem bloquear os demais documentos abertos.
- **Criar novo PDF em branco (`Ctrl+N`):** Seleção de formato de papel (**A4**, **Carta**, **A3**, **Ofício**), orientação (**Retrato** ou **Paisagem**) e quantidade inicial de páginas.
- **Abrir PDF Demonstrativo Interativo:** Gera instantaneamente um documento de 3 páginas contendo parágrafos editáveis, formulário AcroForm preenchível, dados de teste LGPD (CPF/CNPJ/E-mail) e escala técnica em milímetros.
- **Gerenciamento multi-abas:**
  - Aba fixa **Início** sempre acessível à esquerda sem fechar os PDFs abertos;
  - Indicador visual de alterações pendentes não salvas;
  - Reordenação horizontal de abas via *drag-and-drop*;
  - Fechamento rápido pelo botão do meio do mouse ou atalho (`Ctrl+W` no Desktop / `Alt+W` na Web) com modal de proteção contra perda de dados (*Salvar*, *Descartar alterações* ou *Cancelar*);
  - Reabertura da última aba fechada (`Ctrl+Shift+T`);
  - Menu de contexto na aba: *Fechar*, *Fechar outras abas*, *Fechar abas à direita*, *Duplicar em visualização dividida*, *Abrir local no Explorer* e *Copiar caminho/nome*;
  - Menu suspenso com filtro de busca rápida quando há múltiplas abas abertas.
- **Histórico de Documentos Recentes:** Busca instantânea em tempo real, fixação de arquivos importantes no topo (*Pin*) e limpeza de histórico.
- **Recuperação Automática Pós-Queda (*Auto-Recovery*):** Gravação automática de snapshots incrementais (em `%APPDATA%` no Windows e `IndexedDB` na Web) permitindo restaurar documentos não salvos na próxima abertura.
- **Histórico Determinístico de Desfazer e Refazer (`Ctrl+Z` / `Ctrl+Y`):** Baseado no *Command Pattern*, revertendo e reaplicando tanto anotações quanto mutações estruturais e edições de texto.
- **Salvar (`Ctrl+S`), Salvar como (`Ctrl+Shift+S`), Imprimir (`Ctrl+P`) e Inspetor de Propriedades (`Ctrl+D`):** Visualização de versão ISO PDF, metadados, tamanho, criptografia e presença de AcroForms.

---

### 2. Modo Visualizar — Leitura, Navegação e Busca
- **Modos de exibição de página:**
  - **Página única:** Foco em uma folha por vez centralizada na tela;
  - **Rolagem contínua virtualizada:** Renderização sob demanda via `@tanstack/react-virtual` para PDFs extensos com alturas de página variadas;
  - **Página dupla (Modo Livro):** Exibição lado a lado de duas páginas consecutivas;
  - **Visualização Dividida (*Split View*):** Exibe duas áreas simultâneas do mesmo documento lado a lado para consulta cruzada.
- **Zoom de alta definição e ajuste:**
  - Zoom contínuo de `25%` a `400%` com predefinições rápidas, controle deslizante e `Ctrl + Roda do Mouse` centrado na posição exata do cursor;
  - **Tile Rendering automático (`512×512 px`):** Em níveis de zoom elevados, renderiza quadrantes de alta nitidez sem estourar a memória RAM/GPU;
  - **Ajustar à largura (`Ctrl+2`)** e **Ajustar à página inteira (`Ctrl+1`)**.
- **Conforto visual e temas independentes:**
  - Alternância entre **Modo Claro** e **Modo Escuro** da interface;
  - Alternância independente do **Tema da Folha** na barra de status: **Folha Original**, **Folha Noturna** (alto contraste invertido) e **Folha Sépia**.
- **Seleção de texto e Cápsula Flutuante Contextual:**
  - Selecionar qualquer trecho abre automaticamente uma cápsula flutuante acima do texto com ações de 1 clique: *Copiar*, *Marca-texto em 4 cores*, *Sublinhar*, *Tachar*, *Adicionar Nota* e *Marcar para Tarjamento*.
- **Ferramenta Mão / Pan (`H` ou segurar `Barra de Espaço`):** Arraste suave do viewport em qualquer direção.
- **Busca Global Assíncrona (`Ctrl+F`):** Pesquisa executada no Worker PDFium com suporte a **Diferenciar maiúsculas/minúsculas (`Aa`)**, **Palavra inteira** e **Expressões Regulares (`.*`)**, navegação entre ocorrências (`Enter` / `Shift+Enter`) e destaque visual nas páginas.
- **Painel Lateral Esquerdo (6 Gavetas Estruturais):**
  1. **Miniaturas de Páginas:** Prévias renderizadas em baixa prioridade com reordenação por *drag-and-drop* e botões rápidos de girar, duplicar e excluir;
  2. **Sumário (Bookmarks):** Navegação em árvore hierárquica, criação de marcadores na página atual e renomeação com clique duplo;
  3. **Comentários e Revisões:** Listagem consolidada de todas as anotações com filtro por status de revisão, salto direto para a página e exportação do resumo;
  4. **Anexos Embutidos:** Visualização e extração para disco de arquivos anexados internamente ao PDF;
  5. **Camadas (OCG):** Ligamento/desligamento independente das camadas de conteúdo base, anotações e formulários;
  6. **Assinaturas Digitais:** Inspeção das assinaturas criptográficas presentes no arquivo.

---

### 3. Modo Comentar — Anotações, Revisão e Medição
- **Marcações de texto:** **Marca-texto (`U`)** com mistura multiplicativa real, **Sublinhado** e **Tachado**.
- **Notas e caixas:** **Nota adesiva (`C`)** e **Caixa de texto livre (`T`)** com edição de conteúdo, cor e opacidade em tempo real no Inspetor Direito.
- **Formas vetoriais:** **Retângulo**, **Elipse** e **Seta** direcional redimensionáveis e reposicionáveis no canvas SVG normalizado.
- **Desenho à mão livre (`D`) e Borracha:** Captura fluida em canvas efêmero a 60 FPS com suporte a pressão de caneta stylus e simplificação vetorial via algoritmo **Ramer-Douglas-Peucker**, além de borracha clicável para remoção rápida.
- **Carimbos (*Stamps*):** Inserção de carimbos visuais de revisão com data automática.
- **Medição técnica em escala (`mm`):** Cálculo automático de distância física em milímetros diretamente sobre plantas e desenhos técnicos.
- **Revisão colaborativa:** Atribuição de status (**Aprovado**, **Rejeitado**, **Concluído**), encadeamento de **Respostas** por anotação, controle de camada Z (*Trazer para frente* / *Enviar para trás*), duplicação e **Exportação de Relatório de Comentários em Markdown (`.MD`)**.

---

### 4. Modo Editar — Edição Direta de Texto, Imagens e Elementos Globais
- **Edição Real e Expansível de Texto Existente:**
  - Reconstrói automaticamente fragmentos `FPDF_PAGEOBJ_TEXT` da página em linhas e parágrafos editáveis;
  - Com clique simples ou duplo sobre qualquer bloco, ativa a caixa interativa na Camada 4 com **8 alças de redimensionamento/expansão livre**, **barra de movimentação para qualquer posição da página** e atalho **Expandir largura** para ampliar o bloco além dos limites originais do PDF;
  - Formatação rica **por palavra/trecho selecionado ou bloco inteiro**: ao selecionar uma palavra ou trecho específico, aplicar **Negrito (`Ctrl+B`)**, **Itálico (`Ctrl+I`)**, **Sublinhado (`Ctrl+U`)**, **Família da Fonte**, **Tamanho (`pt`)** ou **Cor** altera **exclusivamente o trecho selecionado** (tanto visualmente no editor quanto no *stream* final do PDFium WASM); quando não há seleção ativa, a alteração aplica-se ao bloco inteiro;
  - Controle completo em tempo real no Inspetor Direito: indicador de escopo (*Trecho selecionado* vs. *Bloco inteiro*), largura/altura em `pt` e `mm`, entrelinha, alinhamento (*esquerda*, *centro*, *direita*), cobertura opcional de fundo e exclusão do bloco;
  - Remove prefixos de fontes em *subset*, aplica fallback métrico compatível (*Liberation Sans / Arial*, *Liberation Serif / Times*, *Liberation Mono / Courier*, *Carlito / Calibri* — carregando fontes TrueType CID nativas do Windows quando disponíveis) e regrava o *content stream* real via `FPDFPage_GenerateContent`.
- **Adicionar novos blocos de texto:** Inserção livre de texto formatado em qualquer coordenada da página.
- **Inserir Imagens:** Inclusão, movimentação e dimensionamento de imagens `PNG`, `JPEG` e `WebP`.
- **Inserir Hiperlinks:** Criação de áreas clicáveis apontando para URLs externas.
- **Cabeçalho e Rodapé Dinâmicos:** Aplicação em lote em todas as páginas com suporte às variáveis automáticas `{page}`, `{total}` e `{date}`.
- **Numeração Jurídica Bates:** Estampagem sequencial configurável com prefixo, sufixo e quantidade de dígitos (ex.: `PROC-000001`).
- **Marca d'Água em Lote:** Texto customizável com controle de tamanho tipográfico, ângulo de rotação, cor e opacidade.
- **Recorte de Margens (*Crop*):** Ajuste geométrico da `CropBox` da página.

---

### 5. Modo Organizar — Mesa de Luz e Manipulação de Páginas
- **Mesa de Luz Responsiva:** Grade visual em tela cheia de todas as páginas do documento com suporte a seleção múltipla (`Ctrl + Clique`).
- **Reordenar páginas:** Arrastar e soltar cartões de páginas diretamente na grade ou na barra de miniaturas.
- **Rotacionar páginas:** Giro instantâneo em incrementos de `90°` sobre uma ou múltiplas páginas selecionadas.
- **Inserir página em branco** e **Duplicar página** na posição desejada.
- **Excluir páginas selecionadas** (com trava de segurança impedindo documento com zero páginas).
- **Mesclar PDFs (*Merge*):** União de múltiplos arquivos PDF externos preservando a ordem das páginas.
- **Dividir ou Extrair Páginas (*Split*):**
  - Extração por intervalo personalizado (ex.: `1-3, 5, 8-10`);
  - Divisão automática a cada `N` páginas;
  - Extração apenas das páginas selecionadas na Mesa de Luz para novas abas independentes.

---

### 6. Modo Formulários — AcroForms Interativos
- **Preenchimento de formulários existentes:** Detecção e renderização interativa automática de campos `TextField`, `CheckBox`, `Dropdown` e `RadioGroup` do dicionário `/AcroForm`.
- **Máscaras automáticas brasileiras:** Formatação assistida para campos de **CPF**, **CNPJ**, **Data** e **Moeda (BRL)**.
- **Construtor de campos AcroForm:** Criação visual de novos **Campos de Texto**, **Caixas de Seleção (Checkbox)** e **Campos de Assinatura** diretamente sobre a página.
- **Exportar dados em `.JSON`:** Extração instantânea de todos os pares chave-valor preenchidos no formulário.
- **Achatar Formulário (*Flatten*):** Converte permanentemente os campos editáveis e aparências em conteúdo estático imutável na página.

---

### 7. Modo Proteger — Assinaturas, Privacidade e Tarjamento LGPD
- **Assinatura Eletrônica Visual Rápida:**
  - Desenhar rubrica ou assinatura à mão livre no quadro de assinatura;
  - Gerar assinatura caligráfica digitando o nome completo;
  - Salvar assinaturas no perfil local do usuário para reutilização em 1 clique em qualquer página.
- **Proteção e Inspeção de Assinaturas Digitais Criptográficas (ICP-Brasil / PKCS#7):**
  - Detecção automática de dicionários `/Sig` na abertura do PDF;
  - Exibição de banner de integridade alertando que edições diretas invalidam o hash criptográfico e oferecendo o botão **Criar cópia editável**.
- **Tarjamento Definitivo (*Real Redaction* — Conformidade LGPD):**
  - **Fase 1 (Marcação e Revisão):** Marcação manual com retângulo vermelho tracejado ou **busca automática em lote via Regex** para localizar **CPFs**, **CNPJs**, **E-mails** e **Telefones** em todo o documento;
  - **Fase 2 (Aplicação Destrutiva):** Ao confirmar em **Aplicar Tarjamento Permanente**, o motor PDFium WASM destrói fisicamente os objetos/caracteres subjacentes no *stream* binário e grava blocos pretos opacos definitivos.
- **Sanitização de Privacidade:** Limpeza em 1 clique de metadados ocultos (`Author`, `Creator`, `Producer`, `Keywords`, `XMP`), ações de abertura e scripts JavaScript embutidos.

---

### 8. Modo Converter e Otimizar — OCR, Compressão e Exportações
- **OCR Pesquisável Local (`tesseract.js`):**
  - Detecção automática de PDFs escaneados sem camada de texto (exibindo sugestão contextual no topo);
  - Execução de reconhecimento óptico de caracteres em **Português (`por`)**, **Inglês (`eng`)** ou **Português + Inglês (`por+eng`)** na página atual ou em todo o documento, com barra de progresso na barra de status e injeção de camada de texto pesquisável/selecionável sobre a imagem original.
- **Compressão e Otimização Inteligente:**
  - Estimativa prévia de economia de tamanho (comparando peso atual vs. peso estimado);
  - Perfis de qualidade (*Alta 220 DPI*, *Equilibrado 150 DPI*, *Compressão Máxima 72 DPI*), reescrita limpa de *object streams* e remoção opcional de metadados e objetos órfãos.
- **Criar PDF a partir de Imagens:** Conversão direta de múltiplas imagens (`PNG`, `JPG`, `JPEG`, `WebP`) em um único documento PDF paginado em formato A4.
- **Exportar Página Atual em PNG:** Renderização em alta resolução incluindo anotações visuais.
- **Exportar para Texto Puro (`.TXT`) e Markdown Estruturado (`.MD`):** Extração integral do texto paginado do documento.

---

## Atalhos de Teclado e Interações de Ponteiro

| Categoria | Ação | Atalho |
| --- | --- | --- |
| **Arquivos** | Abrir PDF / Novo PDF em branco | `Ctrl + O` / `Ctrl + N` (`Alt + N` na Web) |
| **Arquivos** | Salvar / Salvar como | `Ctrl + S` / `Ctrl + Shift + S` |
| **Arquivos** | Imprimir / Propriedades do documento | `Ctrl + P` / `Ctrl + D` |
| **Abas** | Fechar aba atual | `Ctrl + W` (Desktop) / `Alt + W` (Web) |
| **Abas** | Alternar próxima aba / aba anterior | `Ctrl + Tab` / `Ctrl + Shift + Tab` |
| **Abas** | Reabrir última aba fechada | `Ctrl + Shift + T` |
| **Edição** | Desfazer / Refazer | `Ctrl + Z` / `Ctrl + Y` ou `Ctrl + Shift + Z` |
| **Edição** | Excluir anotação selecionada / Cancelar ferramenta | `Delete` / `Esc` |
| **Busca e Navegação** | Buscar no documento / Próxima / Anterior | `Ctrl + F` / `Enter` / `Shift + Enter` |
| **Busca e Navegação** | Ir para página específica | `Ctrl + G` |
| **Busca e Navegação** | Página anterior / Próxima / Primeira / Última | `PageUp` / `PageDown` / `Home` / `End` |
| **Visualização e Zoom** | Ampliar / Reduzir / Zoom 100% | `Ctrl + +` / `Ctrl + -` / `Ctrl + 0` |
| **Visualização e Zoom** | Ajustar à página / Ajustar à largura | `Ctrl + 1` / `Ctrl + 2` |
| **Visualização e Zoom** | Girar página atual à direita / esquerda | `Ctrl + Shift + +` / `Ctrl + Shift + -` |
| **Ferramentas Rápidas** | Seleção (`V`), Mão (`H`), Marca-texto (`U`), Nota (`C`), Texto (`T`), Caneta (`D`) | Tecla única fora de campos de texto |
| **Ponteiro** | Arrastar página temporariamente / Zoom no cursor | Segurar `Espaço` / `Ctrl + Roda do Mouse` |

---

## Arquitetura Hexagonal do Monorepo

```plaintext
PDF-Studio/
├── apps/
│   ├── desktop-windows/      # Aplicativo Desktop Windows (.exe NSIS + Portátil via Electron + config Tauri v2)
│   └── web/                  # Aplicação Web / PWA (Vite + File System Access API + IndexedDB)
├── packages/
│   ├── platform-contracts/   # Modelos de domínio ISO 32000 e interfaces puras de plataforma
│   ├── pdf-engine/           # Worker PDFium WASM, Render Scheduler, Cache LRU, Tiles, @cantoo/pdf-lib e OCR
│   ├── editor-core/          # Stores Zustand multi-abas e Command Pattern determinístico (Undo/Redo)
│   └── ui/                   # Interface silenciosa em 7 zonas e 4 camadas empilhadas por página
├── sidecars/                 # Diretório para binários nativos auxiliares opcionais (QPDF / Tesseract)
└── docs/                     # Especificação mestre de arquitetura e UI/UX
```

---

## Stack Tecnológica e Licenças Permissivas

| Camada | Tecnologia | Licença |
| --- | --- | --- |
| Interface e Virtualização | React 18 + TypeScript + Vite + Tailwind CSS + TanStack Virtual + Lucide | MIT / ISC |
| Estado e Histórico | Zustand + Command Pattern (`EditorCommand`) | MIT |
| Renderização e Edição Profunda | PDFium WebAssembly (`@embedpdf/pdfium`) em Web Worker dedicado | Apache 2.0 / BSD |
| Manipulação Estrutural e AcroForms | `@cantoo/pdf-lib` | MIT |
| Reconhecimento Óptico (OCR) | `tesseract.js` | Apache 2.0 |
| Desktop Windows | Electron + Electron Builder (`.exe` NSIS & Portátil) + Config Tauri v2 | MIT / Apache 2.0 |

---

## Como Executar, Testar e Gerar Instaladores

### Pré-requisitos
- **Node.js** `>= 20` e **npm** `>= 10`

### Instalação e Desenvolvimento

```powershell
# 1. Instalar dependências de todos os pacotes do monorepo
npm install

# 2. Executar checagem estrita de tipos e suíte de testes automatizados
npm run typecheck
npm test

# 3. Iniciar versão Web / PWA em modo de desenvolvimento (http://localhost:5173)
npm run dev:web

# 4. Iniciar aplicativo Desktop Windows nativo
npm run dev:desktop
```

### Build de Produção e Executáveis Windows

```powershell
# Gerar bundle estático de produção para Web / PWA (apps/web/dist)
npm run build:web

# Gerar instalador NSIS e executável portátil para Windows (apps/desktop-windows/release)
npm run dist:windows
```
