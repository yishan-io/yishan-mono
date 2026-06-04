#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

fn deserialize_nullable_string<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    Ok(Option::<String>::deserialize(deserializer)?.unwrap_or_default())
}

// ── Auth ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OkResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    pub ok: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub user: User,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshTokenResponse {
    pub token_type: String,
    pub access_token: String,
    pub refresh_token: String,
    pub access_token_expires_at: String,
    pub refresh_token_expires_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RelayTokenResponse {
    pub token: String,
    pub expires_at: String,
}

// ── Service Tokens ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServiceToken {
    pub id: String,
    pub name: String,
    pub token_prefix: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scopes: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    pub last_used_at: Option<String>,
    pub expires_at: Option<String>,
    pub revoked_at: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateServiceTokenResponse {
    pub service_token: ServiceToken,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListServiceTokensResponse {
    pub service_tokens: Vec<ServiceToken>,
}

// ── Organizations ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrganizationMember {
    pub user_id: String,
    pub role: String,
    pub email: String,
    pub name: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Organization {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub updated_at: String,
    pub members: Vec<OrganizationMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListOrganizationsResponse {
    pub organizations: Vec<Organization>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateOrganizationResponse {
    pub organization: Organization,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddOrganizationMemberResponse {
    pub member: OrganizationMember,
}

// ── Nodes ────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    pub id: String,
    pub organization_id: String,
    pub name: String,
    pub kind: String,
    pub scope: String,
    pub endpoint: String,
    pub metadata: HashMap<String, serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListNodesResponse {
    pub nodes: Vec<Node>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateNodeResponse {
    pub node: Node,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterNodeResponse {
    pub node: Node,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateNodeScopeResponse {
    pub node: Node,
}

// ── Projects ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub organization_id: String,
    pub name: String,
    pub source_type: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub repo_provider: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub repo_url: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub repo_key: String,
    pub icon: String,
    pub color: String,
    pub context_enabled: bool,
    #[serde(default)]
    pub setup_script: String,
    #[serde(default)]
    pub post_script: String,
    #[serde(default)]
    pub commands: Vec<ProjectCommand>,
    pub created_by_user_id: String,
    #[serde(default)]
    pub node_id: String,
    #[serde(default, deserialize_with = "deserialize_nullable_string")]
    pub local_path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCommand {
    pub name: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListProjectsResponse {
    pub projects: Vec<Project>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateProjectResponse {
    pub project: Project,
}

// ── Workspaces ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub organization_id: String,
    pub project_id: String,
    pub node_id: String,
    pub kind: String,
    pub branch: String,
    pub local_path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWorkspacesResponse {
    pub workspaces: Vec<Workspace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWorkspaceResponse {
    pub workspace: Workspace,
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledJob {
    pub id: String,
    pub organization_id: String,
    pub project_id: String,
    pub node_id: String,
    pub name: String,
    pub agent_kind: String,
    pub prompt: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    pub cron_expression: String,
    pub timezone: String,
    pub status: String,
    pub next_run_at: String,
    pub last_scheduled_for: String,
    pub last_run_at: String,
    pub last_run_status: String,
    pub last_error_code: String,
    pub last_error_message: String,
    pub created_by_user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

// ── Token Usage ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenUsageHourlyRow {
    pub project_id: String,
    pub workspace_id: String,
    pub workspace_path: String,
    pub agent_kind: String,
    pub model: String,
    pub model_normalized: String,
    pub bucket_start_hour_utc: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cached_input_tokens: i64,
    pub cached_output_tokens: i64,
    pub reasoning_tokens: i64,
    pub total_tokens: i64,
    pub event_count: i64,
    pub session_count: i64,
    pub attribution_confidence: String,
    pub ingested_at: String,
    pub run_id: String,
}
