/**
 * `assets/core` 的公开入口。
 *
 * 约定：**`view/` 与 `tools/` 只从本文件导入 core**。
 * 这样 core 内部怎么拆文件都不会波及调用方，也便于静态检查"谁越界 import 了内部路径"。
 *
 * 本模块整体零 `cc` 依赖——这是本项目最值钱的工程属性，别丢。
 */

// 配置
export * from './config';

// 数据模型
export type {
  BoardSpec,
  DragPreview,
  GamePhase,
  Intent,
  InvalidReason,
  ItemSpec,
  LevelSpec,
  LevelState,
  PlaceCheck,
  PlaceIntent,
  Placement,
  RC,
  Rotation,
  SaveDataV1,
  SfxKey,
  SfxPulse,
  SfxSpec,
  Vec2Like,
} from './model/types';
export {
  LevelDataError,
  levelIdsOf,
  parseLevelBundle,
  parseLevelSpec,
  validateLevelSpec,
} from './model/level';
export type { LevelBundle } from './model/level';

// 色板与明度阶梯（纯函数，view 与单测共用）
export {
  contrastRatio,
  itemFillHex,
  relativeLuminance,
  rgbOf,
  shadeHex,
  toHex,
  toneBaseHex,
  toneBaseIndexFor,
  toneFactorFor,
  toneLevelFor,
  TONE_DEEP_CELLS,
  TONE_MID_CELLS,
} from './palette';
export type { ToneLevel } from './palette';

// 几何
export {
  bboxOf,
  cellsToKey,
  cloneCells,
  hasDuplicates,
  isConnected,
  normalize,
  rotateBy,
  rotateCCW,
  rotateCW,
  rotationVariants,
} from './geometry/shape';
export type { BBox } from './geometry/shape';
export { clampAnchor, inBounds, rcKey, toIndex, toRC } from './geometry/coords';
export {
  anchorForPointerCell,
  grabOffsetForBoardCell,
  grabOffsetFromRatio,
  sameRC,
} from './geometry/drag';
export { fitThumbnail } from './geometry/thumbnail';
export type { ThumbnailFit } from './geometry/thumbnail';
export { rotatedCenterOffset } from './geometry/artOffset';
export type { Offset } from './geometry/artOffset';
export { centerOf, liftAndScale, offsetRects } from './geometry/lift';
export type { Point as RectPoint, Rect } from './geometry/lift';
export {
  trayClampScroll,
  trayContentWidth,
  trayMaxScroll,
  traySlotCenterX,
  traySlotInWindow,
} from './geometry/trayScroll';
export { isTakeoutPosition } from './geometry/takeout';
export { maskBands, screenRect } from './geometry/maskHoles';
export type { Rect as MaskRect } from './geometry/maskHoles';

// 规则
export {
  buildIndex,
  OccupancyIndex,
  OWNER_BLOCKED,
  OWNER_EMPTY,
  totalItemCellCount,
  usableCellCount,
} from './rules/board';
export {
  applyPlacement,
  canPlace,
  findItem,
  insertByTrayOrder,
  isPlacementLegal,
  itemAtCell,
  removeToTray,
  rotateInPlace,
  suggestNextPlacement,
  trayInsertIndex,
  trayRotationOf,
} from './rules/placement';
export type { HintSuggestion, RotateResult } from './rules/placement';

// 首次引导规则（M2-6 / PRD F13）
export { GuideMemory, guideDoneEventOf, guideKindOf, guideLearnedBy } from './guide';
export type { GuideDoneEvent, GuideKind } from './guide';

// 关卡进度（M2-7：首页选关 + 解锁；与 M2-8 存档强耦合）
export {
  continueLevelId,
  coerceProgress,
  defaultProgress,
  isCleared,
  isUnlocked,
  markCleared,
  setLearnedLevels,
  setMuted,
} from './progress';

// 音效规格表（M2-9：纯数据，发声在 view/AudioAdapter）
export { SFX_KEYS, sfxSpecOf } from './audio/sfx';

// 会话
export { GameSession } from './session/GameSession';
export type { GameSessionOptions } from './session/GameSession';
export { History } from './session/History';
export { eventName } from './session/events';
export type { GameEvent, SessionResult } from './session/events';

// 求解与快检
export {
  countSolutions,
  requiresRotation,
  solve,
  validateSolution,
} from './solver/packer';
export type {
  CountOptions,
  CountResult,
  SolutionPlacement,
  SolutionValidation,
  SolveOptions,
  SolveOutcome,
  SolveResult,
} from './solver/packer';
export {
  checkDeadend,
  isDefinitelyStuck,
  occupiedCellsOf,
  progressOf,
} from './solver/deadend';
export type { DeadendReport } from './solver/deadend';
