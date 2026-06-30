import { View } from "react-native";
import { Button, Text } from "tamagui";

import { AppModalSheet } from "@/components/ui/AppModalSheet";
import type { Organization } from "@/features/organizations/organizations.types";

type OrganizationSelectorSheetProps = {
  currentOrganizationId: string | null;
  onClose: () => void;
  onSelectOrganization: (orgId: string) => void;
  open: boolean;
  organizations: Organization[];
  title: string;
};

// Owns only the organization-picking UI; switching logic stays in shell commands/view-models.
export function OrganizationSelectorSheet({
  currentOrganizationId,
  onClose,
  onSelectOrganization,
  open,
  organizations,
  title,
}: OrganizationSelectorSheetProps) {
  return (
    <AppModalSheet open={open} onClose={onClose} position="center">
      <Text fontSize="$8" fontWeight="800">
        {title}
      </Text>
      <View style={{ gap: 8 }}>
        {organizations.map((organization) => {
          const selected = organization.id === currentOrganizationId;
          return (
            <Button key={organization.id} themeInverse={selected} onPress={() => onSelectOrganization(organization.id)}>
              {organization.name}
            </Button>
          );
        })}
      </View>
    </AppModalSheet>
  );
}
