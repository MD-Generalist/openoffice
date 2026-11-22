// Shared advanced print parts (decision 0141). Renderer code; the only layout
// entry it reads is the renderer-safe `@genoffice/print-layout/plan`.
export {
  coupleDuplex,
  createDuplexCoupling,
  effectiveCollate,
  forcedDuplex,
  isCollateLocked,
  labelCellsOf,
  labelPresetText,
  layoutSchematic,
  normalizePanelOptions,
  parsePrintRanges,
  printLayoutIssueText,
  printLayoutProblem,
  PRINT_LAYOUT_SCHEMATIC_FACES,
  setDuplexByUser,
  showsLayoutSchematic,
  takesNewPrintRoute,
  type DuplexCoupling,
  type PrintLayoutCapabilities,
  type PrintLayoutDuplex,
  type PrintLayoutProgress,
  type PrintPageRange,
  type SchematicCell,
  type SchematicFace,
  type SchematicView,
} from './model'
export {
  DEFAULT_PRINTER,
  SYSTEM_DIALOG,
  useArrangedPreview,
  useDuplexCoupling,
  usePrintJob,
  usePrintLayoutOptions,
  type ArrangedPreviewState,
  type PrintJobSelection,
  type PrintJobState,
  type PrintLayoutPreviewRequest,
  type PrintPrinterInfo,
} from './hooks'
export { PrintJobFields, type PrintJobFieldsProps } from './PrintJobFields'
export {
  PrintLayoutPanel,
  type PrintLabelSpecStore,
  type PrintLayoutJob,
  type PrintLayoutPanelProps,
} from './PrintLayoutPanel'
export { PrintLayoutSchematic, type PrintLayoutSchematicProps } from './PrintLayoutSchematic'
export {
  ArrangedPreview,
  PrintLayoutProgressLine,
  type ArrangedPreviewProps,
} from './ArrangedPreview'
export {
  SimplePrintDialog,
  type SimplePrintDialogProps,
  type SimplePrintRange,
  type SimplePrintRangeChoice,
} from './SimplePrintDialog'
