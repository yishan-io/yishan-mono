import { Box, Table, TableBody, TableCell, TableRow } from "@mui/material";

type MarkdownPreviewMetadataTableProps = {
  metadata: Record<string, string>;
  fullWidth: boolean;
};

/** Renders parsed markdown frontmatter above the preview body. */
export function MarkdownPreviewMetadataTable({ metadata, fullWidth }: MarkdownPreviewMetadataTableProps) {
  return (
    <Box
      sx={{
        width: "100%",
        maxWidth: fullWidth ? "none" : 860,
        mx: fullWidth ? 0 : "auto",
        mb: 3,
        overflow: "auto",
      }}
    >
      <Table
        size="small"
        sx={{
          fontSize: "0.875em",
          border: 1,
          borderColor: "divider",
          "& td, & th": { border: 1, borderColor: "divider" },
        }}
      >
        <TableBody>
          {Object.entries(metadata).map(([key, value]) => (
            <TableRow key={key}>
              <TableCell
                component="th"
                scope="row"
                sx={{
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  width: "1%",
                  borderRight: 1,
                  borderColor: "divider",
                }}
              >
                {key}
              </TableCell>
              <TableCell>{value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
