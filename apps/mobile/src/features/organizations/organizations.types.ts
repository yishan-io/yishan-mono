export type OrganizationMember = {
  userId: string;
  role: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
};

export type OrganizationRecord = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: OrganizationMember[];
};

export type Organization = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
};
