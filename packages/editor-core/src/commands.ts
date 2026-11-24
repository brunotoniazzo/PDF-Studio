import type { PdfAnnotation, PdfFormField } from '@pdf-studio/platform-contracts';

export interface EditorCommand {
  readonly label: string;
  execute(): void | Promise<void>;
  undo(): void | Promise<void>;
}

export interface AnnotationMutator {
  upsertAnnotation: (tabId: string, annot: PdfAnnotation) => void;
  removeAnnotation: (tabId: string, pageIndex: number, annotId: string) => void;
}

export class AddAnnotationCommand implements EditorCommand {
  public readonly label: string;

  constructor(
    private readonly tabId: string,
    private readonly annotation: PdfAnnotation,
    private readonly mutator: AnnotationMutator,
    label?: string
  ) {
    this.label = label ?? `Adicionar ${describeAnnotType(annotation.type)}`;
  }

  execute(): void {
    this.mutator.upsertAnnotation(this.tabId, this.annotation);
  }

  undo(): void {
    this.mutator.removeAnnotation(
      this.tabId,
      this.annotation.pageIndex,
      this.annotation.id
    );
  }
}

export class UpdateAnnotationCommand implements EditorCommand {
  public readonly label: string;

  constructor(
    private readonly tabId: string,
    private readonly prevAnnotation: PdfAnnotation,
    private readonly nextAnnotation: PdfAnnotation,
    private readonly mutator: AnnotationMutator,
    label?: string
  ) {
    this.label = label ?? `Editar ${describeAnnotType(nextAnnotation.type)}`;
  }

  execute(): void {
    this.mutator.upsertAnnotation(this.tabId, this.nextAnnotation);
  }

  undo(): void {
    this.mutator.upsertAnnotation(this.tabId, this.prevAnnotation);
  }
}

export class DeleteAnnotationCommand implements EditorCommand {
  public readonly label: string;

  constructor(
    private readonly tabId: string,
    private readonly annotation: PdfAnnotation,
    private readonly mutator: AnnotationMutator
  ) {
    this.label = `Excluir ${describeAnnotType(annotation.type)}`;
  }

  execute(): void {
    this.mutator.removeAnnotation(
      this.tabId,
      this.annotation.pageIndex,
      this.annotation.id
    );
  }

  undo(): void {
    this.mutator.upsertAnnotation(this.tabId, this.annotation);
  }
}

export class UpdateFormFieldCommand implements EditorCommand {
  public readonly label: string;

  constructor(
    private readonly tabId: string,
    private readonly prevFields: PdfFormField[],
    private readonly nextFields: PdfFormField[],
    private readonly applyFields: (tabId: string, fields: PdfFormField[]) => void,
    label = 'Atualizar campo de formulário'
  ) {
    this.label = label;
  }

  execute(): void {
    this.applyFields(this.tabId, this.nextFields);
  }

  undo(): void {
    this.applyFields(this.tabId, this.prevFields);
  }
}

export class BinaryDocumentMutationCommand implements EditorCommand {
  constructor(
    public readonly label: string,
    private readonly tabId: string,
    private readonly prevBytes: Uint8Array,
    private readonly nextBytes: Uint8Array,
    private readonly applyBytes: (tabId: string, bytes: Uint8Array) => Promise<void>
  ) {}

  async execute(): Promise<void> {
    await this.applyBytes(this.tabId, this.nextBytes);
  }

  async undo(): Promise<void> {
    await this.applyBytes(this.tabId, this.prevBytes);
  }
}

export function describeAnnotType(type: PdfAnnotation['type']): string {
  switch (type) {
    case 'highlight':
      return 'Marca-texto';
    case 'underline':
      return 'Sublinhado';
    case 'strikethrough':
      return 'Tachado';
    case 'squiggly':
      return 'Ondulado';
    case 'sticky-note':
      return 'Nota adesiva';
    case 'callout':
      return 'Caixa com seta';
    case 'free-text':
      return 'Texto';
    case 'rect':
      return 'Retângulo';
    case 'ellipse':
      return 'Elipse';
    case 'line':
      return 'Linha';
    case 'arrow':
      return 'Seta';
    case 'ink':
      return 'Traço livre';
    case 'stamp':
      return 'Carimbo';
    case 'signature-visual':
      return 'Assinatura';
    case 'image':
      return 'Imagem';
    case 'link':
      return 'Hiperlink';
    case 'measure-distance':
      return 'Medição';
    case 'redaction':
      return 'Marcação de tarja';
    default:
      return 'Objeto';
  }
}
