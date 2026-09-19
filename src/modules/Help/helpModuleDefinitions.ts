export const HELP_NAV_CHILDREN = [
  { id: "help-overview", label: "Overview" },
  { id: "help-getting-started", label: "Getting Started" },
  { id: "help-upload-run", label: "Upload / Run" },
  { id: "help-genome-browser", label: "Genome Browser" },
  { id: "help-structure", label: "Structure" },
  { id: "help-meta-plot", label: "Meta Plot" },
  { id: "help-peak-distribution", label: "Peak Distribution" },
  { id: "help-gene-statistics", label: "Gene Statistics" },
  { id: "help-exon-statistics", label: "Exon Statistics" },
  { id: "help-site", label: "Site" },
  { id: "help-export-cache", label: "Export & Cache" },
  { id: "help-faq", label: "FAQ / Troubleshooting" }
] as const;

export type HelpPageId = (typeof HELP_NAV_CHILDREN)[number]["id"];

const helpPageIdSet = new Set<string>(HELP_NAV_CHILDREN.map((item) => item.id));

export function isHelpPageId(value: string): value is HelpPageId {
  return helpPageIdSet.has(value);
}
