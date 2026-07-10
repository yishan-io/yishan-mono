/**
 * Public entry point for the organizations feature.
 * External callers should use organization screens, queries, and types from here instead of deep imports.
 */
export { useOrganizationsQuery } from "./queries/useOrganizationsQuery";
export { OrganizationDetailScreen } from "./screens/OrganizationDetailScreen";
export type { Organization, OrganizationMember, OrganizationRecord } from "./organizations.types";
