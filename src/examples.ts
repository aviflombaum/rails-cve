import { advisoryPayload } from "./advisories";
import advisory from "./examples/active-storage.json";

// Frozen canonical metadata, captured 2026-09-22. This is not a recorded delivery.
export function examplePayload(appUrl: string) {
  return advisoryPayload(
    advisory,
    {
      id: "evt_example_cve_2026_66066",
      type: "advisory.published",
      created_at: "2026-07-29T18:00:00.000Z",
    },
    appUrl.replace(/\/$/, ""),
  );
}
export function examplePreview(appUrl: string) {
  const payload = examplePayload(appUrl);
  return {
    ...payload,
    advisory: {
      ...payload.advisory,
      description: "[Abbreviated here. Full upstream advisory text is included in the download.]",
    },
    investigation: {
      ...payload.investigation,
      prompt:
        "[Abbreviated here. Full repository investigation instructions and the Rails forensic toolkit link are included in the download.]",
    },
  };
}
