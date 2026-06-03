use super::client::ApiClient;
use super::types::*;
use reqwest::Method;
use serde_json::json;
use std::collections::HashMap;

impl ApiClient {
    // ── System ────────────────────────────────────────────────────────────────

    pub async fn health(&self) -> anyhow::Result<HealthResponse> {
        self.do_decode::<_, HealthResponse>(Method::GET, "/health", None::<&()>).await
    }

    pub async fn whoami(&self) -> anyhow::Result<MeResponse> {
        self.do_decode::<_, MeResponse>(Method::GET, "/me", None::<&()>).await
    }

    // ── Auth ──────────────────────────────────────────────────────────────────

    pub async fn refresh_token(&self, refresh_token: &str) -> anyhow::Result<RefreshTokenResponse> {
        let body = json!({ "refreshToken": refresh_token });
        self.do_decode(Method::POST, "/auth/refresh", Some(&body)).await
    }

    pub async fn revoke_token(&self, refresh_token: &str) -> anyhow::Result<OkResponse> {
        let body = json!({ "refreshToken": refresh_token });
        self.do_decode(Method::POST, "/auth/revoke", Some(&body)).await
    }

    // ── Service Tokens ────────────────────────────────────────────────────────

    pub async fn list_service_tokens(&self) -> anyhow::Result<ListServiceTokensResponse> {
        self.do_decode::<_, _>(Method::GET, "/service-tokens", None::<&()>).await
    }

    pub async fn create_service_token(
        &self,
        name: &str,
        expires_in_days: Option<u32>,
    ) -> anyhow::Result<CreateServiceTokenResponse> {
        let mut body = json!({ "name": name });
        if let Some(days) = expires_in_days {
            body["expiresInDays"] = json!(days);
        }
        self.do_decode(Method::POST, "/service-tokens", Some(&body)).await
    }

    pub async fn revoke_service_token(&self, token_id: &str) -> anyhow::Result<OkResponse> {
        let path = format!("/service-tokens/{token_id}");
        self.do_decode::<_, OkResponse>(Method::DELETE, &path, None::<&()>).await
    }

    // ── Organizations ─────────────────────────────────────────────────────────

    pub async fn list_organizations(&self) -> anyhow::Result<ListOrganizationsResponse> {
        self.do_decode::<_, _>(Method::GET, "/orgs", None::<&()>).await
    }

    pub async fn create_organization(
        &self,
        name: &str,
        member_user_ids: Vec<String>,
    ) -> anyhow::Result<CreateOrganizationResponse> {
        let body = json!({ "name": name, "memberUserIds": member_user_ids });
        self.do_decode(Method::POST, "/orgs", Some(&body)).await
    }

    pub async fn delete_organization(&self, org_id: &str) -> anyhow::Result<OkResponse> {
        let path = format!("/orgs/{org_id}");
        self.do_decode::<_, OkResponse>(Method::DELETE, &path, None::<&()>).await
    }

    pub async fn add_organization_member(
        &self,
        org_id: &str,
        user_id: &str,
        role: &str,
    ) -> anyhow::Result<AddOrganizationMemberResponse> {
        let path = format!("/orgs/{org_id}/members");
        let body = json!({ "userId": user_id, "role": role });
        self.do_decode(Method::POST, &path, Some(&body)).await
    }

    pub async fn remove_organization_member(
        &self,
        org_id: &str,
        user_id: &str,
    ) -> anyhow::Result<OkResponse> {
        let path = format!("/orgs/{org_id}/members/{user_id}");
        self.do_decode::<_, OkResponse>(Method::DELETE, &path, None::<&()>).await
    }

    // ── Nodes ─────────────────────────────────────────────────────────────────

    pub async fn list_nodes(&self, org_id: &str) -> anyhow::Result<ListNodesResponse> {
        let path = format!("/orgs/{org_id}/nodes");
        self.do_decode::<_, _>(Method::GET, &path, None::<&()>).await
    }

    pub async fn delete_node(&self, org_id: &str, node_id: &str) -> anyhow::Result<OkResponse> {
        let path = format!("/orgs/{org_id}/nodes/{node_id}");
        self.do_decode::<_, OkResponse>(Method::DELETE, &path, None::<&()>).await
    }

    pub async fn update_node_scope(
        &self,
        org_id: &str,
        node_id: &str,
        scope: &str,
    ) -> anyhow::Result<UpdateNodeScopeResponse> {
        let path = format!("/orgs/{org_id}/nodes/{node_id}/scope");
        let body = json!({ "scope": scope });
        self.do_decode(Method::PATCH, &path, Some(&body)).await
    }

    pub async fn register_node(
        &self,
        node_id: &str,
        name: &str,
        kind: Option<&str>,
        endpoint: Option<&str>,
        metadata: Option<HashMap<String, serde_json::Value>>,
        scope: &str,
        update_if_exists: Option<bool>,
    ) -> anyhow::Result<RegisterNodeResponse> {
        let mut body = json!({
            "nodeId": node_id,
            "name": name,
            "scope": scope,
        });
        if let Some(k) = kind.filter(|s| !s.is_empty()) {
            body["kind"] = json!(k);
        }
        if let Some(e) = endpoint.filter(|s| !s.is_empty()) {
            body["endpoint"] = json!(e);
        }
        if let Some(m) = metadata.filter(|m| !m.is_empty()) {
            body["metadata"] = json!(m);
        }
        if let Some(u) = update_if_exists {
            body["updateIfExists"] = json!(u);
        }
        self.do_decode(Method::POST, "/nodes/register", Some(&body)).await
    }

    // ── Projects ──────────────────────────────────────────────────────────────

    pub async fn list_projects(&self, org_id: &str) -> anyhow::Result<ListProjectsResponse> {
        let path = format!("/orgs/{org_id}/projects");
        self.do_decode::<_, _>(Method::GET, &path, None::<&()>).await
    }

    pub async fn create_project(
        &self,
        org_id: &str,
        name: &str,
        source_type_hint: Option<&str>,
        repo_url: Option<&str>,
        node_id: Option<&str>,
        local_path: Option<&str>,
    ) -> anyhow::Result<CreateProjectResponse> {
        let mut body = json!({ "name": name });
        if let Some(v) = source_type_hint.filter(|s| !s.is_empty()) {
            body["sourceTypeHint"] = json!(v);
        }
        if let Some(v) = repo_url.filter(|s| !s.is_empty()) {
            body["repoUrl"] = json!(v);
        }
        if let Some(v) = node_id.filter(|s| !s.is_empty()) {
            body["nodeId"] = json!(v);
        }
        if let Some(v) = local_path.filter(|s| !s.is_empty()) {
            body["localPath"] = json!(v);
        }
        let path = format!("/orgs/{org_id}/projects");
        self.do_decode(Method::POST, &path, Some(&body)).await
    }

    pub async fn delete_project(
        &self,
        org_id: &str,
        project_id: &str,
    ) -> anyhow::Result<OkResponse> {
        let path = format!("/orgs/{org_id}/projects/{project_id}");
        self.do_decode::<_, OkResponse>(Method::DELETE, &path, None::<&()>).await
    }

    // ── Workspaces ────────────────────────────────────────────────────────────

    pub async fn list_workspaces(
        &self,
        org_id: &str,
        project_id: &str,
    ) -> anyhow::Result<ListWorkspacesResponse> {
        let path = format!("/orgs/{org_id}/projects/{project_id}/workspaces");
        self.do_decode::<_, _>(Method::GET, &path, None::<&()>).await
    }

    pub async fn create_workspace(
        &self,
        org_id: &str,
        project_id: &str,
        id: Option<&str>,
        node_id: &str,
        local_path: &str,
        kind: &str,
        branch: Option<&str>,
        source_branch: Option<&str>,
    ) -> anyhow::Result<CreateWorkspaceResponse> {
        let mut body = json!({
            "nodeId": node_id,
            "localPath": local_path,
            "kind": kind,
        });
        if let Some(v) = id.filter(|s| !s.is_empty()) {
            body["id"] = json!(v);
        }
        if let Some(v) = branch.filter(|s| !s.is_empty()) {
            body["branch"] = json!(v);
        }
        if let Some(v) = source_branch.filter(|s| !s.is_empty()) {
            body["sourceBranch"] = json!(v);
        }
        let path = format!("/orgs/{org_id}/projects/{project_id}/workspaces");
        self.do_decode(Method::POST, &path, Some(&body)).await
    }

    pub async fn close_workspace(
        &self,
        org_id: &str,
        project_id: &str,
        workspace_id: &str,
    ) -> anyhow::Result<CreateWorkspaceResponse> {
        let path = format!("/orgs/{org_id}/projects/{project_id}/workspaces/close");
        let body = json!({ "workspaceId": workspace_id });
        self.do_decode(Method::PATCH, &path, Some(&body)).await
    }

    // ── Relay / Node tokens ───────────────────────────────────────────────────

    pub async fn relay_token(&self, node_id: &str) -> anyhow::Result<RelayTokenResponse> {
        let path = format!("/nodes/{node_id}/relay-token");
        self.do_decode::<_, _>(Method::POST, &path, None::<&()>).await
    }

    // ── Scheduled Jobs ────────────────────────────────────────────────────────

    pub async fn start_scheduled_job_run(
        &self,
        node_id: &str,
        run_id: &str,
        started_at: Option<&str>,
    ) -> anyhow::Result<OkResponse> {
        let mut body = json!({ "runId": run_id });
        if let Some(t) = started_at.filter(|s| !s.is_empty()) {
            body["startedAt"] = json!(t);
        }
        let path = format!("/nodes/{node_id}/scheduled-jobs/runs/start");
        self.do_decode(Method::PUT, &path, Some(&body)).await
    }

    pub async fn complete_scheduled_job_run(
        &self,
        node_id: &str,
        run_id: &str,
        status: &str,
        finished_at: Option<&str>,
        response_body: Option<&str>,
        error_code: Option<&str>,
        error_message: Option<&str>,
        error_details: Option<HashMap<String, serde_json::Value>>,
    ) -> anyhow::Result<OkResponse> {
        let mut body = json!({ "runId": run_id, "status": status });
        if let Some(t) = finished_at.filter(|s| !s.is_empty()) {
            body["finishedAt"] = json!(t);
        }
        if let Some(r) = response_body.filter(|s| !s.is_empty()) {
            body["responseBody"] = json!(r);
        }
        if let Some(c) = error_code.filter(|s| !s.is_empty()) {
            body["errorCode"] = json!(c);
        }
        if let Some(m) = error_message.filter(|s| !s.is_empty()) {
            body["errorMessage"] = json!(m);
        }
        if let Some(d) = error_details.filter(|d| !d.is_empty()) {
            body["errorDetails"] = json!(d);
        }
        let path = format!("/nodes/{node_id}/scheduled-jobs/runs/complete");
        self.do_decode(Method::PUT, &path, Some(&body)).await
    }

    // ── Token Usage ───────────────────────────────────────────────────────────

    pub async fn upsert_token_usage_hourly(
        &self,
        org_id: &str,
        rows: &[TokenUsageHourlyRow],
    ) -> anyhow::Result<OkResponse> {
        let path = format!("/orgs/{org_id}/token-usage/hourly");
        let body = json!({ "rows": rows });
        self.do_decode(Method::POST, &path, Some(&body)).await
    }
}
