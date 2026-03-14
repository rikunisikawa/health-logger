あなたはAIエージェントアーキテクチャ設計の専門家です。

Claude Code で使用する
AI Agent Framework を設計してください。

このFrameworkは以下の3層で構成します。

Agents = 役割
Skills = 能力
Playbooks = 手順


# 目的

データエンジニアリング / AI開発 / クラウド開発 を
AIエージェントで効率的に実行するための構成を設計する。


# 技術スタック

AWS
S3
Athena
Glue
Lambda
Step Functions
Terraform
dbt
Python
Docker
GitHub Actions


# 設計方針

以下の原則で設計してください。

1
Agents は役割単位

2
Skills は再利用可能な能力単位

3
Playbooks は作業フロー

4
Agents は複数の Skills を使用する

5
Playbooks は Agents を呼び出す

6
並列開発が可能な設計にする


# 出力してほしい内容

以下をすべて出力してください。


① アーキテクチャ説明

Agents / Skills / Playbooks の役割
関係図


② ディレクトリ構造

以下の構造で提案してください

.claude/
  agents/
  skills/
  playbooks/


③ Agents

必要なAgentを設計してください

例

architecture_agent
implementation_agent
testing_agent
devops_agent
documentation_agent
project_manager_agent


各Agentについて

- role
- responsibilities
- used_skills
- output_format


④ Skills

再利用可能なスキルを設計してください

例

aws_architecture
terraform_iac
python_data_processing
dbt_modeling
data_testing
ci_cd
documentation_writing
research_analysis


各Skillについて

- purpose
- responsibilities
- best_practices
- output_format


⑤ Playbooks

実際の開発フローを定義してください

例

build_data_pipeline
create_api_service
implement_infrastructure
setup_ci_pipeline
develop_ml_pipeline


各Playbookについて

- goal
- workflow
- agents_used
- expected_output


⑥ 並列開発の設計

どのAgentが並列実行できるか
どのPlaybookが並列実行できるか


⑦ ベストプラクティス

Agent粒度
Skill粒度
Playbook粒度


# 出力形式

すべてMarkdownで出力してください。

各Agent / Skill / Playbookは
そのまま使用できるテンプレート形式で記述してください。


# 最後に

以下も説明してください。

1
このFrameworkを使ったAI並列開発方法

2
Claude Codeでの運用方法

3
大規模プロジェクトでのスケーリング方法