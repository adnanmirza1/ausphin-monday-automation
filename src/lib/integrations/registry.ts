import "server-only";
import type { ProviderConfig } from "./types";
import { github } from "./github";
import { gitlab } from "./gitlab";
import { slack } from "./slack";
import { circleci } from "./circleci";
import { pagerduty } from "./pagerduty";
import { jira } from "./jira";
import { gmail } from "./gmail";
import { googleCalendar } from "./google-calendar";
import { outlook } from "./outlook";
import { teams } from "./teams";

// The registry every generic route/action/UI component reads from. Adding a
// new provider = write one file satisfying ProviderConfig, add it here.
export const PROVIDERS: Record<string, ProviderConfig> = {
  github,
  gitlab,
  slack,
  circleci,
  pagerduty,
  jira,
  gmail,
  google_calendar: googleCalendar,
  outlook,
  teams,
};

export function getProvider(id: string): ProviderConfig | null {
  return PROVIDERS[id] ?? null;
}

export function listProviders(): ProviderConfig[] {
  return Object.values(PROVIDERS);
}
