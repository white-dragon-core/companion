export enum PlanNodeType {
  Describe = 'Describe',
  It = 'It',
  BeforeAll = 'BeforeAll',
  AfterAll = 'AfterAll',
  BeforeEach = 'BeforeEach',
  AfterEach = 'AfterEach'
}

export enum ModifierType {
  None = 'None',
  Skip = 'Skip',
  Focus = 'Focus'
}

export interface PlanNode {
  phrase: string;
  type: PlanNodeType;
  modifier: ModifierType;
}

export enum ReporterStatus {
  Success = 'Success',
  Failure = 'Failure',
  Skipped = 'Skipped'
}

export interface ReporterChildNode {
  children: ReporterChildNode[];
  errors: string[];
  planNode: PlanNode;
  status: ReporterStatus;
}

export interface ReporterOutput {
  children: ReporterChildNode[];
  errors: string[];
  failureCount: number;
  skippedCount: number;
  successCount: number;
}