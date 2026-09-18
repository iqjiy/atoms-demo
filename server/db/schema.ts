/**
 * 建表 DDL（与 schema.sql 同源，内联为字符串以避免编译产物缺 .sql 文件的路径问题）。
 * 每条为独立语句（neon serverless 不支持多语句 prepared statement），逐条执行。
 * schema.sql 保留为可读参考；改动请同步此处。
 */
export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS projects (
     id uuid PRIMARY KEY,
     owner_id text NOT NULL,
     share_id text NOT NULL UNIQUE,
     title text NOT NULL,
     initial_idea text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id)`,
  `CREATE TABLE IF NOT EXISTS runs (
     id uuid PRIMARY KEY,
     project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     status text NOT NULL DEFAULT 'running'
       CHECK (status IN ('running','awaiting_approval','completed','failed')),
     current_stage text CHECK (current_stage IN ('requirement','spec','architecture','code')),
     iteration int NOT NULL DEFAULT 1,
     model_plan jsonb,
     error text,
     started_at timestamptz NOT NULL DEFAULT now(),
     finished_at timestamptz
   )`,
  `CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, started_at DESC)`,
  `CREATE TABLE IF NOT EXISTS artifacts (
     id uuid PRIMARY KEY,
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     version int NOT NULL,
     kind text NOT NULL CHECK (kind IN ('markdown','html','json')),
     filename text NOT NULL,
     content text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (run_id, version)
   )`,
  `CREATE TABLE IF NOT EXISTS messages (
     id uuid PRIMARY KEY,
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     artifact_id uuid REFERENCES artifacts(id) ON DELETE SET NULL,
     seq int NOT NULL,
     iteration int NOT NULL DEFAULT 1,
     role text NOT NULL,
     stage text NOT NULL CHECK (stage IN ('requirement','spec','architecture','code')),
     content text NOT NULL,
     cause_by text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     UNIQUE (run_id, iteration, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS approvals (
     id uuid PRIMARY KEY,
     run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
     gate text NOT NULL CHECK (gate IN ('architecture','code')),
     decision boolean NOT NULL,
     comment text,
     iteration int NOT NULL DEFAULT 1,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS idx_approvals_run ON approvals(run_id)`,
];
