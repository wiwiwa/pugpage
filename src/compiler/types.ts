export type PugNodeType =
  | "Block"
  | "NamedBlock"
  | "Tag"
  | "InterpolatedTag"
  | "Text"
  | "Code"
  | "Comment"
  | "BlockComment"
  | "Doctype"
  | "Conditional"
  | "While"
  | "Each"
  | "EachOf"
  | "Case"
  | "When"
  | "Mixin"
  | "MixinBlock"
  | "YieldBlock"
  | "Literal";

export interface PugASTAttribute {
  name: string;
  val: string;
  mustEscape: boolean;
  line?: number;
  column?: number;
  filename?: string;
}

export interface PugASTNode {
  type: PugNodeType | string;
  line?: number;
  column?: number;
  filename?: string;
  name?: string;
  selfClosing?: boolean;
  block?: PugASTNode;
  attrs?: PugASTAttribute[];
  attributeBlocks?: unknown[];
  isInline?: boolean;
  val?: string;
  buffer?: boolean;
  mustEscape?: boolean;
  nodes?: PugASTNode[];
  test?: string;
  consequent?: PugASTNode;
  alternate?: PugASTNode;
  key?: string;
  obj?: string;
  code?: string;
  args?: string;
  call?: boolean;
  doctype?: string;
  declaredBlocks?: Record<string, PugASTNode>;
  [key: string]: unknown;
}
