import { helpContentAnalysis } from "./helpContentAnalysis";
import { helpContentCore } from "./helpContentCore";
import { helpContentGenome } from "./helpContentGenome";
import { helpContentSupport } from "./helpContentSupport";
import type { HelpPage } from "./helpTypes";
import type { HelpPageId } from "./helpModuleDefinitions";

export const HELP_WEB_URL = "https://rnainformatics.cn/RNAmeta-online/";

export const HELP_PAGES: HelpPage[] = [
  ...helpContentCore,
  ...helpContentGenome,
  ...helpContentAnalysis,
  ...helpContentSupport
];

export const HELP_PAGE_MAP = new Map<HelpPageId, HelpPage>(
  HELP_PAGES.map((page) => [page.id as HelpPageId, page])
);
