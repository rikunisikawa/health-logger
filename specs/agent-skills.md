あなたはAIエージェント設計の専門家です。

Claude Code の Agent Skills を設計してください。

目的
データエンジニアリング / AWS / IaC / AI開発 のための
再利用可能な Agent Skills を構築すること。

以下の要件を満たしてください。


# 1. 技術スタック

AWS
S3
Athena
Glue
Lambda
Step Functions
Terraform
dbt
Python
GitHub Actions
Docker


# 2. Skills に含める領域

以下の領域を必ず含めること

orchestrator
architecture
implementation
data_engineering
devops
testing
project_management
documentation
analysis


# 3. 出力内容

以下をすべて出力してください

① Agent Skills の設計思想  
② ディレクトリ構造  
③ 各 Skill の役割  
④ 各 Skill のテンプレート内容  


# 4. 出力フォーマット

以下の構造で出力してください


.claude/
  skills/
    orchestrator.md
    architecture.md
    implementation.md
    data_engineering.md
    devops.md
    testing.md
    project_management.md
    documentation.md
    analysis.md


各ファイルには以下を含める

- role
- responsibilities
- workflows
- output_format
- best_practices


# 5. Testing Skill

testing skill には以下を含める

test strategy
unit tests
integration tests
data tests
dbt tests
CI validation
coverage


# 6. Project Management Skill

project_management skill には以下を含める

task breakdown
issue planning
sprint planning
risk management
EVM
progress tracking
documentation


# 7. Output

すべて Markdown で出力してください。

各 Skill は実際に使用できるテンプレートとして
具体的に記述してください。


# 8. 最後に

以下も追加してください

- Claude Agent Skills のベストプラクティス
- 大規模プロジェクトでの運用方法
- Skills の分割戦略